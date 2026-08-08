"""Service diagnostic : génération de QCM par IA, passation, scoring par notion,
upsert de la maîtrise et détection de lacunes (Gap).

Vocabulaire bienveillant (CLAUDE.md) : on parle de « notion à renforcer », jamais
d'échec. Les questions sont générées via le LLMProvider abstrait (mockable en test)
et chaque génération laisse une trace `ai_jobs`."""

import json
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    AIJob,
    Gap,
    Quiz,
    QuizAnswer,
    QuizAttempt,
    QuizQuestion,
    Skill,
    SkillMastery,
    StudentProfile,
    Subject,
)
from app.modules.ai.provider import LLMProvider, LLMRequest
from app.modules.eli5.service import get_default_student
from app.modules.gamification.service import XP_DIAGNOSTIC, award_xp
from app.modules.progress.mastery import record_mastery_transition
from app.modules.progress.service import OPEN_GAP_STATUSES
from app.modules.provenance import PARENT, mark_validated
from app.prompts.diagnostic import (
    DIAGNOSTIC_GEN_PROMPT_V1,
    DIAGNOSTIC_SYSTEM,
    PROMPT_VERSION,
)

# ADR-0043 Décision 3 — 5 et non 2. À deux questions, un score par notion ne pouvait valoir que
# 0, 50 ou 100 : le seuil de lacune à 70 était binaire, et une notion pouvait être déclarée lacune
# GRAVE sur une seule réponse ratée.
#
# ⚠️ **N'améliore que les passations FUTURES.** Celles d'avant restent à trois valeurs, pour
# toujours : la granularité du dépôt est et restera MIXTE. `score_par_notion` sert donc
# `questions_count` par notion, pour que la page puisse le dire au lieu de comparer en silence des
# grains incomparables.
QUESTIONS_PER_SKILL = 5
MAX_SKILLS = 8
# Seuil en dessous duquel une notion est « à renforcer » (génère une lacune).
GAP_THRESHOLD = 70


def _status_from_score(score: int) -> str:
    if score >= 90:
        return "mastered"
    if score >= 70:
        return "solid"
    if score >= 40:
        return "learning"
    return "weak"


def _severity_from_score(score: int) -> str:
    return "high" if score < 40 else "medium"


def list_subjects(db: Session) -> list[Subject]:
    return list(db.scalars(select(Subject).where(Subject.is_active).order_by(Subject.sort_order)))


def _subject_or_404(db: Session, subject_id: int) -> Subject:
    subject = db.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matière introuvable.")
    return subject


def notions_a_mesurer(
    db: Session, *, subject_id: int, student_id: int | None, limit: int = MAX_SKILLS
) -> list[Skill]:
    """Les notions d'un diagnostic — **par ancienneté de mesure** (ADR-0043 Décision 4).

    Avant : `order_by(Skill.id)[:8]`, c'est-à-dire les 8 premières entrées au référentiel. Sur ~280
    notions au catalogue, une matière rendait **toujours les 8 mêmes**. Ce n'était pas une
    sélection, c'était un accident d'ordre d'insertion.

    **Motif de l'ordre choisi** : un diagnostic sert à *réduire l'incertitude*. Remesurer ce qui
    vient de l'être n'en réduit aucune. D'où : jamais mesurées d'abord, puis les plus anciennement
    mesurées. Cette règle fait tourner le périmètre toute seule, **sans tirage aléatoire** — donc
    sans rendre deux passations incomparables.

    ⚠️ **`student_id` peut être `None`, et la dégradation est correcte, pas silencieuse.**
    `SkillMastery` est clé sur `(student, skill)` : sans élève, la jointure gauche ne rend que des
    `NULL`, toutes les notions sont « jamais mesurées », et l'ordre retombe sur `Skill.id` —
    exactement le comportement d'avant l'ADR-0043. Aucun résultat faux, seulement l'ancien.

    `Skill.id` reste le départage final : sans lui, deux notions jamais mesurées sortiraient dans
    un ordre non déterminé par la base, et deux générations successives ne seraient pas
    reproductibles.
    """
    mesure = (
        select(SkillMastery.skill_id, SkillMastery.last_seen_at)
        .where(SkillMastery.student_id == student_id)
        .subquery()
        if student_id is not None
        else None
    )
    query = select(Skill).where(Skill.subject_id == subject_id)
    if mesure is not None:
        query = query.outerjoin(mesure, mesure.c.skill_id == Skill.id).order_by(
            # `NULLS FIRST` n'est pas portable sur SQLite : on trie sur un drapeau explicite. Il dit
            # la règle mieux qu'un modificateur de tri, en plus d'être vrai dans les deux moteurs.
            (mesure.c.last_seen_at.isnot(None)).asc(),
            mesure.c.last_seen_at.asc(),
            Skill.id.asc(),
        )
    else:
        query = query.order_by(Skill.id.asc())
    return list(db.scalars(query.limit(limit)))


def generate_diagnostic(
    db: Session, provider: LLMProvider, subject_id: int, level: str | None
) -> tuple[Quiz, str, int]:
    """Génère un quiz diagnostic (QCM par notion) pour une matière. Trace ai_jobs."""
    subject = _subject_or_404(db, subject_id)
    # ⚠️ L'élève est résolu ICI et pas reçu en paramètre : cette fonction est appelée par le worker
    # (`production/jobs.py::_diagnostic_generate`), dont la charge utile ne porte que `subject_id`
    # et `level`. Le module entier est mono-enfant — le router résout de la même façon pour toutes
    # ses autres routes — et le multi-enfant est hors périmètre de l'ADR-0043.
    student = get_default_student(db)
    skills = notions_a_mesurer(
        db, subject_id=subject_id, student_id=student.id if student is not None else None
    )
    if not skills:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucune notion pour cette matière — impossible de générer un diagnostic.",
        )

    quiz = Quiz(
        subject_id=subject_id,
        title=f"Diagnostic — {subject.name}",
        quiz_type="diagnostic",
        status="ready",
        created_by="ai",
    )
    db.add(quiz)
    db.flush()

    now = datetime.now(timezone.utc)
    job = AIJob(
        job_type="diagnostic_generate",
        status="running",
        input_json={
            "subject_id": subject_id,
            "skill_ids": [s.id for s in skills],
            "questions_per_skill": QUESTIONS_PER_SKILL,
            "prompt_version": PROMPT_VERSION,
        },
        created_by="parent",
        created_at=now,
        started_at=now,
    )
    db.add(job)
    db.flush()

    sort_order = 0
    total = 0
    try:
        for skill in skills:
            prompt = DIAGNOSTIC_GEN_PROMPT_V1.format(
                n=QUESTIONS_PER_SKILL,
                subject=subject.name,
                skill=skill.name,
                level=skill.level or level or "4e",
            )
            response = provider.generate(
                LLMRequest(prompt=prompt, system=DIAGNOSTIC_SYSTEM, json_output=True)
            )
            parsed = json.loads(response.text)
            for q in (parsed.get("questions") or [])[:QUESTIONS_PER_SKILL]:
                choices = [str(c) for c in (q.get("choices") or [])]
                if len(choices) < 2:
                    continue
                correct = max(0, min(len(choices) - 1, int(q.get("correct_index", 0))))
                db.add(
                    QuizQuestion(
                        quiz_id=quiz.id,
                        skill_id=skill.id,
                        question_type="mcq",
                        prompt_markdown=str(q.get("prompt") or ""),
                        choices_json=choices,
                        correct_answer_json=correct,
                        explanation_markdown=str(q.get("explanation") or ""),
                        sort_order=sort_order,
                    )
                )
                sort_order += 1
                total += 1
    except Exception as exc:  # noqa: BLE001
        job.status = "failed"
        job.error_message = str(exc)[:1000]
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Génération diagnostic échouée : {exc}"
        ) from exc

    if total == 0:
        job.status = "failed"
        job.error_message = "Génération diagnostic vide."
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="La génération n'a produit aucune question."
        )

    job.status = "succeeded"
    job.output_json = {"questions_count": total}
    job.finished_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(quiz)
    return quiz, subject.name, total


def _question_count(db: Session, quiz_id: int) -> int:
    return db.scalar(
        select(func.count()).select_from(QuizQuestion).where(QuizQuestion.quiz_id == quiz_id)
    ) or 0


def _is_taken(db: Session, quiz_id: int, student_id: int) -> bool:
    return bool(
        db.scalar(
            select(func.count())
            .select_from(QuizAttempt)
            .where(
                QuizAttempt.quiz_id == quiz_id,
                QuizAttempt.student_id == student_id,
                QuizAttempt.completed_at.isnot(None),
            )
        )
    )


def list_diagnostics(db: Session, student: StudentProfile) -> list[dict]:
    """Les diagnostics que Massimo peut passer — **relus seulement** (ADR-0043 Décision 1).

    C'est l'un des trois points d'entrée gatés, pas le seul : filtrer la liste sans filtrer
    `get_quiz_for_taking` laisserait l'accès direct par identifiant, et un diagnostic non relu
    resterait passable pour qui connaît son id. Le verrou de la session porte sur les TROIS.
    """
    rows = db.execute(
        select(Quiz, Subject)
        .join(Subject, Subject.id == Quiz.subject_id)
        .where(Quiz.quiz_type == "diagnostic", Quiz.validation_status == "validated")
        .order_by(Quiz.id.desc())
    ).all()
    return [
        {
            "quiz_id": quiz.id,
            "title": quiz.title,
            "subject": subject.name,
            "questions_count": _question_count(db, quiz.id),
            "taken": _is_taken(db, quiz.id, student.id),
        }
        for quiz, subject in rows
    ]


def _quiz_or_404(db: Session, quiz_id: int) -> Quiz:
    """Résout un diagnostic **sans regarder son statut de relecture**.

    C'est le résolveur de PAPA : relire suppose de pouvoir ouvrir ce qui n'est pas encore relu.
    Les routes de Massimo passent par `_servable_quiz_or_404`, jamais par celui-ci.
    """
    quiz = db.get(Quiz, quiz_id)
    if quiz is None or quiz.quiz_type != "diagnostic":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagnostic introuvable.")
    return quiz


def _servable_quiz_or_404(db: Session, quiz_id: int) -> Quiz:
    """Le même, plus le gate de relecture — résolveur des routes élève (ADR-0043).

    Même patron, nom pour nom, que `quizzes.service._servable_quiz_or_404` : un résolveur neutre,
    un résolveur servable, et les routes élève ne touchent que le second. Deux fonctions plutôt
    qu'un drapeau, parce qu'un drapeau s'oublie à `False` par défaut.

    **`404`, pas `403`.** Un diagnostic non relu n'existe pas pour Massimo ; lui répondre « c'est
    interdit » lui apprendrait qu'un contenu l'attend derrière une porte — exactement l'information
    que la relecture de Papa doit pouvoir retenir.
    """
    quiz = _quiz_or_404(db, quiz_id)
    if quiz.validation_status != "validated":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagnostic introuvable.")
    return quiz


def set_validation(db: Session, quiz_id: int, verdict: str) -> Quiz:
    """Verdict de Papa sur un diagnostic — la soupape du gate (ADR-0043).

    Sans elle, la 6ᵉ famille de `/relecture` serait un cul-de-sac : la ligne s'afficherait, le
    bouton appellerait une route absente, et **plus aucun diagnostic n'atteindrait Massimo**.

    La validation passe par `provenance.mark_validated`, seul chemin d'écriture (§F.3) : un
    diagnostic relu porte `parent`, comme tout contenu qu'un humain a ouvert et laissé passer.
    """
    quiz = _quiz_or_404(db, quiz_id)
    if verdict == "validate":
        mark_validated(quiz, PARENT)
    else:
        quiz.validation_status = "rejected"
    db.commit()
    db.refresh(quiz)
    return quiz


def get_quiz_for_taking(db: Session, quiz_id: int) -> dict:
    """Questions servies à l'enfant : SANS la bonne réponse ni l'explication."""
    quiz = _servable_quiz_or_404(db, quiz_id)
    subject = db.get(Subject, quiz.subject_id)
    rows = db.execute(
        select(QuizQuestion, Skill)
        .outerjoin(Skill, Skill.id == QuizQuestion.skill_id)
        .where(QuizQuestion.quiz_id == quiz_id)
        .order_by(QuizQuestion.sort_order)
    ).all()
    questions = [
        {
            "id": q.id,
            "prompt": q.prompt_markdown,
            "choices": list(q.choices_json or []),
            "skill_id": q.skill_id,
            "skill_name": skill.name if skill is not None else "Notion",
        }
        for q, skill in rows
    ]
    return {
        "quiz_id": quiz.id,
        "title": quiz.title,
        "subject": subject.name if subject is not None else "",
        "questions": questions,
    }


def _upsert_gap(db: Session, *, student_id: int, subject_id: int, skill_id: int, score: int) -> None:
    existing = db.scalar(
        select(Gap).where(
            Gap.student_id == student_id,
            Gap.skill_id == skill_id,
            Gap.status == "open",
        )
    )
    severity = _severity_from_score(score)
    if existing is not None:
        existing.severity = severity
        return
    db.add(
        Gap(
            student_id=student_id,
            skill_id=skill_id,
            subject_id=subject_id,
            source="diagnostic",
            severity=severity,
            status="open",
            first_detected_at=datetime.now(timezone.utc),
        )
    )


def submit(
    db: Session, student: StudentProfile, quiz_id: int, answers: list
) -> dict:
    """Corrige les réponses, calcule le score par notion, écrit la tentative,
    met à jour la maîtrise et ouvre les lacunes des notions faibles."""
    quiz = _servable_quiz_or_404(db, quiz_id)
    subject = db.get(Subject, quiz.subject_id)
    rows = db.execute(
        select(QuizQuestion, Skill)
        .outerjoin(Skill, Skill.id == QuizQuestion.skill_id)
        .where(QuizQuestion.quiz_id == quiz_id)
    ).all()
    if not rows:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Diagnostic sans question.")

    chosen_by_question = {a.question_id: a.choice_index for a in answers}
    now = datetime.now(timezone.utc)
    attempt = QuizAttempt(
        quiz_id=quiz_id,
        student_id=student.id,
        started_at=now,
        completed_at=now,
        context="diagnostic",
    )
    db.add(attempt)
    db.flush()

    # ⚠️ **Une réponse par question, y compris NON RÉPONDUE** (`chosen is None`). C'est ce qui rend
    # le dénominateur par notion complet, donc la comparaison entre passations honnête. Ne pas
    # « optimiser » en n'écrivant que les réponses données : le score deviendrait flatteur.
    total_correct = 0
    for q, _skill in rows:
        chosen = chosen_by_question.get(q.id)
        is_correct = chosen is not None and int(chosen) == int(q.correct_answer_json)
        db.add(
            QuizAnswer(
                attempt_id=attempt.id,
                question_id=q.id,
                answer_json={"choice_index": chosen},
                is_correct=is_correct,
                score=1.0 if is_correct else 0.0,
            )
        )
        total_correct += int(is_correct)

    overall = round(total_correct / len(rows) * 100)
    attempt.score_percent = overall

    # 🔴 L'agrégat par notion se RELIT, il ne se recompte pas ici. `submit()` en portait sa propre
    # copie, calculée pendant l'écriture — la deuxième des trois du dépôt, et celle qui n'avait pas
    # de garde sur un dénominateur nul. Le `flush` ci-dessus rend les réponses visibles à la
    # requête ; le prix est une lecture, le gain est qu'une passation ne peut plus être notée
    # différemment selon la surface qui la regarde.
    db.flush()
    per_skill_out = score_par_notion(db, attempt.id)

    strengths: list[str] = []
    for row in per_skill_out:
        skill_id, score = row["skill_id"], row["score"]
        if skill_id is not None:
            _upsert_skill_mastery(db, student_id=student.id, skill_id=skill_id, score=score, now=now)
        if score < GAP_THRESHOLD:
            if skill_id is not None:
                _upsert_gap(
                    db,
                    student_id=student.id,
                    subject_id=quiz.subject_id,
                    skill_id=skill_id,
                    score=score,
                )
        else:
            strengths.append(row["skill_name"])

    # Les lacunes rendues sont celles de la BASE, pas celles qu'on vient de calculer : le `flush`
    # rend visibles les `Gap` tout juste ouvertes, et la lecture y ajoute celles qui étaient déjà
    # ouvertes sur ces notions. Massimo voit donc le même état que Papa, au même instant.
    db.flush()
    gaps_out = lacunes_ouvertes(
        db,
        student_id=student.id,
        skill_ids=[r["skill_id"] for r in per_skill_out if r["skill_id"] is not None],
    )

    # XP pour avoir passé le diagnostic (gamification) — récompense l'engagement.
    award_xp(
        db, student_id=student.id, subject_id=quiz.subject_id, amount=XP_DIAGNOSTIC, reason="diagnostic"
    )

    db.commit()
    return {
        "attempt_id": attempt.id,
        "quiz_id": quiz_id,
        "subject": subject.name if subject is not None else "",
        "score_percent": overall,
        "per_skill": per_skill_out,
        "gaps": gaps_out,
        "strengths": strengths,
    }


def _upsert_skill_mastery(
    db: Session, *, student_id: int, skill_id: int, score: int, now: datetime
) -> None:
    mastery = db.scalar(
        select(SkillMastery).where(
            SkillMastery.student_id == student_id, SkillMastery.skill_id == skill_id
        )
    )
    if mastery is None:
        mastery = SkillMastery(student_id=student_id, skill_id=skill_id)
        db.add(mastery)
    mastery.mastery_score = score
    mastery.confidence_score = score
    mastery.last_seen_at = now
    record_mastery_transition(db, mastery, _status_from_score(score), now)


def latest_results(db: Session, student: StudentProfile, limit: int = 10) -> list[dict]:
    """Vue Papa : derniers diagnostics passés, score par notion + lacunes ouvertes."""
    attempts = list(
        db.scalars(
            select(QuizAttempt)
            .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
            .where(
                QuizAttempt.student_id == student.id,
                Quiz.quiz_type == "diagnostic",
                QuizAttempt.completed_at.isnot(None),
            )
            .order_by(QuizAttempt.id.desc())
            .limit(limit)
        )
    )
    results: list[dict] = []
    for attempt in attempts:
        quiz = db.get(Quiz, attempt.quiz_id)
        subject = db.get(Subject, quiz.subject_id) if quiz is not None else None
        per_skill_out, gaps_out = _per_skill_for_attempt(db, attempt, student_id=student.id)
        results.append(
            {
                "attempt_id": attempt.id,
                "quiz_id": attempt.quiz_id,
                "subject": subject.name if subject is not None else "",
                "score_percent": round(attempt.score_percent or 0),
                "completed_at": attempt.completed_at.isoformat() if attempt.completed_at else None,
                "per_skill": per_skill_out,
                "gaps": gaps_out,
            }
        )
    return results


def score_par_notion(db: Session, attempt_id: int) -> list[dict]:
    """**Le** calcul du score par notion d'une passation — un seul, réutilisé partout.

    Il lisait déjà `quiz_answers` ; il est désormais le SEUL chemin du module. `submit()` en avait
    sa propre copie, calculée pendant l'écriture des réponses ; elle est supprimée. Le prix est une
    relecture de ce qu'on vient d'écrire ; le gain est que la réponse de `submit()` et la ligne que
    `latest_results()` sert pour la MÊME passation ne peuvent plus diverger — c'est exactement ce
    dont le pivot a besoin pour comparer deux passations sans comparer deux façons de compter.

    🔴 **Il reste UNE autre copie dans le dépôt**, `quizzes.complete_attempt`, et elle n'est pas
    absorbée ici : `quizzes/scoring.py` documente que ses paliers sont *« dupliqués volontairement
    pour ne PAS importer `diagnostics` (modules évaluatifs indépendants) »*. Fusionner défairait
    une décision écrite. L'ADR-0043 §8 demande de ne pas en écrire un **quatrième** ; on passe de
    trois à deux, et la frontière restante est une frontière voulue.

    ⚠️ **Le dénominateur est complet** parce que `submit()` écrit une réponse par question, *y
    compris non répondue*. Ne pas « optimiser » cette écriture : sans elle, une notion à moitié
    répondue rendrait un score calculé sur les seules réponses données, donc trop flatteur.

    `total` est servi : c'est lui qui dit la granularité d'une passation (2 questions avant
    l'ADR-0043, 5 après). La page en a besoin pour ne pas comparer des grains incomparables en
    silence.
    """
    rows = db.execute(
        select(QuizAnswer, QuizQuestion, Skill)
        .join(QuizQuestion, QuizQuestion.id == QuizAnswer.question_id)
        .outerjoin(Skill, Skill.id == QuizQuestion.skill_id)
        .where(QuizAnswer.attempt_id == attempt_id)
    ).all()
    per_skill: dict[int | None, dict] = {}
    for answer, question, skill in rows:
        bucket = per_skill.setdefault(
            question.skill_id,
            {"name": skill.name if skill is not None else "Notion", "correct": 0, "total": 0},
        )
        bucket["total"] += 1
        bucket["correct"] += int(bool(answer.is_correct))
    return [
        {
            "skill_id": skill_id,
            "skill_name": data["name"],
            "score": round(data["correct"] / data["total"] * 100) if data["total"] else 0,
            "status": _status_from_score(
                round(data["correct"] / data["total"] * 100) if data["total"] else 0
            ),
            "questions_count": data["total"],
        }
        for skill_id, data in per_skill.items()
    ]


def lacunes_ouvertes(db: Session, *, student_id: int, skill_ids: list[int]) -> list[dict]:
    """Les lacunes **lues en base**, à l'état d'aujourd'hui (ADR-0043 Décision 5).

    Avant, ce module les **recalculait** depuis les réponses de la passation : une lacune que Papa
    avait résolue continuait de s'afficher, à jamais, alors que le docstring promettait « lacunes
    ouvertes ».

    ⚠️ **Ce que le champ veut dire a changé, et ce n'était pas évitable.** Une `Gap` est clé sur
    `(student, skill)`, jamais sur une tentative : « les lacunes de cette passation » n'existe pas
    en base. Ce qu'on sert est donc *les lacunes ouvertes aujourd'hui sur les notions que cette
    passation a mesurées*. Conséquence assumée : une lacune ouverte par un diagnostic antérieur
    apparaît sur la ligne d'un diagnostic plus récent qui remesure la même notion. C'est le sens
    de « état à aujourd'hui ».

    `OPEN_GAP_STATUSES` est **importé**, jamais recopié : c'est la définition canonique
    (`("open", "in_progress")`), et `diagnostics` était justement le module qui ne l'importait pas.

    🔴 **Dédup défensive, et voici pourquoi elle est nécessaire ici.** `_upsert_gap` déduplique sur
    `"open"` SEUL : une lacune passée `in_progress` laisse la porte ouverte à une seconde ligne au
    diagnostic suivant. Ce défaut est au `BACKLOG.md` et **hors du périmètre de cette session** —
    mais lire avec le tuple canonique le rendrait VISIBLE, sous la forme de deux lignes pour une
    notion dans le panneau. On garde la plus sévère, et le défaut reste à corriger là où il est.
    """
    if not skill_ids:
        return []
    rows = db.execute(
        select(Gap, Skill)
        .outerjoin(Skill, Skill.id == Gap.skill_id)
        .where(
            Gap.student_id == student_id,
            Gap.skill_id.in_(skill_ids),
            Gap.source == "diagnostic",
            Gap.status.in_(OPEN_GAP_STATUSES),
        )
        .order_by(Gap.id)
    ).all()
    par_notion: dict[int, dict] = {}
    for gap, skill in rows:
        connue = par_notion.get(gap.skill_id)
        if connue is not None and connue["severity"] == "high":
            continue  # déjà au maximum : rien de plus sévère ne peut arriver
        par_notion[gap.skill_id] = {
            "skill_id": gap.skill_id,
            "skill_name": skill.name if skill is not None else "Notion",
            "severity": gap.severity,
        }
    return list(par_notion.values())


def _passations_de_matiere(
    db: Session, *, student_id: int, subject_id: int, limit: int
) -> list[QuizAttempt]:
    """Les passations de diagnostic d'une matière, **du plus ancien au plus récent**.

    L'ordre chronologique est celui de la portée : une pente se lit dans le sens du temps.
    `latest_results` sert l'ordre inverse, parce qu'une liste se lit du plus récent — les deux ne
    se contredisent pas, ils répondent à deux questions.
    """
    return list(
        db.scalars(
            select(QuizAttempt)
            .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
            .where(
                QuizAttempt.student_id == student_id,
                Quiz.quiz_type == "diagnostic",
                Quiz.subject_id == subject_id,
                QuizAttempt.completed_at.isnot(None),
            )
            .order_by(QuizAttempt.completed_at.asc(), QuizAttempt.id.asc())
            .limit(limit)
        )
    )


def portee(db: Session, *, student: StudentProfile, subject_id: int, limit: int = 12) -> dict:
    """La portée : une notion, ses passations successives, son delta (ADR-0043, spec §portée).

    C'est `latest_results` **transposé** — par notion au lieu de par passation. Il ne recompte
    rien : chaque passation passe par `score_par_notion`, le calcul unique du module. C'est la
    condition pour que la portée et le panneau d'une passation ne puissent pas se contredire.

    🔴 **Aucune interpolation.** Une notion non mesurée par une passation vaut `None` à ce point,
    jamais la valeur précédente reportée. Reporter dessinerait un palier plat que personne n'a
    mesuré, et un palier plat se lit « rien n'a bougé » — l'exact contraire de « on n'a pas
    regardé ».

    🔴 **Seules les notions mesurées AU MOINS DEUX FOIS sortent.** Un point ne fait pas une pente ;
    une notion mesurée une seule fois appartient au panneau de sa passation, pas à la comparaison.
    Conséquence : à une seule passation, `notions` est vide — c'est ce qui permet à la page de
    remplacer la portée par son absence expliquée sans avoir à compter elle-même.

    ⚠️ **La granularité est servie point par point** (`questions_count`), et elle sera MIXTE pour
    toujours : les passations d'avant l'ADR-0043 ont 2 questions par notion (3 valeurs possibles),
    celles d'après en ont 5 (6 valeurs). Un delta entre deux grains différents reste vrai, mais il
    ne se lit pas comme un delta entre deux grains identiques — la page doit pouvoir le dire.

    ⚠️ **Une requête par passation, assumée.** L'alternative serait un `GROUP BY (attempt, skill)`
    en SQL — c'est-à-dire une **quatrième** écriture de l'agrégat, précisément la faute que
    l'ADR-0037 nomme et que l'ADR-0043 §8 interdit. On échange N lectures bornées par `limit`
    contre une définition unique du score.
    """
    subject = _subject_or_404(db, subject_id)
    attempts = _passations_de_matiere(
        db, student_id=student.id, subject_id=subject_id, limit=limit
    )

    scores: dict[int, dict[int, dict]] = {}  # attempt_id -> skill_id -> ligne
    noms: dict[int, str] = {}
    for attempt in attempts:
        par_notion = {}
        for ligne in score_par_notion(db, attempt.id):
            if ligne["skill_id"] is None:
                continue  # une question sans notion n'entre dans aucune série
            par_notion[ligne["skill_id"]] = ligne
            noms[ligne["skill_id"]] = ligne["skill_name"]
        scores[attempt.id] = par_notion

    notions: list[dict] = []
    for skill_id, nom in noms.items():
        points = [
            (
                {
                    "attempt_id": attempt.id,
                    "score": scores[attempt.id][skill_id]["score"],
                    "questions_count": scores[attempt.id][skill_id]["questions_count"],
                }
                if skill_id in scores[attempt.id]
                else None
            )
            for attempt in attempts
        ]
        mesures = [point for point in points if point is not None]
        if len(mesures) < 2:
            continue
        notions.append(
            {
                "skill_id": skill_id,
                "skill_name": nom,
                "points": points,
                # Delta entre la PREMIÈRE et la DERNIÈRE mesure, pas entre les deux dernières :
                # c'est le trajet de la notion sur la fenêtre servie, et il ne dépend pas du
                # nombre de passations qui l'ont sautée entre-temps.
                "delta": mesures[-1]["score"] - mesures[0]["score"],
            }
        )
    notions.sort(key=lambda ligne: (ligne["delta"], ligne["skill_name"]))

    return {
        "subject_id": subject.id,
        "subject": subject.name,
        "attempts": [
            {
                "attempt_id": attempt.id,
                "completed_at": attempt.completed_at.isoformat() if attempt.completed_at else None,
                "score_percent": round(attempt.score_percent or 0),
            }
            for attempt in attempts
        ],
        "notions": notions,
    }


def result_detail(db: Session, student: StudentProfile, attempt_id: int) -> dict:
    """Le détail d'UNE passation — il n'existait aucun endpoint pour ça (spec §Ce qui manque).

    Le panneau de la page ouvrait jusqu'ici une passation en la cherchant dans les dix que
    `latest_results` sert : au-delà, elle était inaccessible, et la limite de dix est en dur.

    `404` sur une passation qui n'est pas un diagnostic ou qui n'est pas celle de cet élève — pas
    `403` : Papa n'a pas à apprendre l'existence de ce qu'il ne peut pas ouvrir.
    """
    attempt = db.get(QuizAttempt, attempt_id)
    quiz = db.get(Quiz, attempt.quiz_id) if attempt is not None else None
    if (
        attempt is None
        or attempt.student_id != student.id
        or quiz is None
        or quiz.quiz_type != "diagnostic"
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Passation introuvable.")
    subject = db.get(Subject, quiz.subject_id)
    per_skill_out, gaps_out = _per_skill_for_attempt(db, attempt, student_id=student.id)
    return {
        "attempt_id": attempt.id,
        "quiz_id": attempt.quiz_id,
        "subject": subject.name if subject is not None else "",
        "score_percent": round(attempt.score_percent or 0),
        "completed_at": attempt.completed_at.isoformat() if attempt.completed_at else None,
        "per_skill": per_skill_out,
        "gaps": gaps_out,
    }


def _per_skill_for_attempt(
    db: Session, attempt: QuizAttempt, *, student_id: int
) -> tuple[list[dict], list[dict]]:
    """Le couple servi par la vue Papa : scores par notion + lacunes **ouvertes**.

    Deux lectures distinctes et assumées : la mesure vient de la passation (figée, historique), la
    lacune vient de la table (vivante, à aujourd'hui). C'est ce qui permet à la page de tenir les
    deux colonnes que l'ADR-0043 Décision 6 veut **disjointes** — une notion à renforcer sans
    lacune ouverte, une lacune résolue sur une notion pas encore acquise.
    """
    per_skill_out = score_par_notion(db, attempt.id)
    skill_ids = [row["skill_id"] for row in per_skill_out if row["skill_id"] is not None]
    return per_skill_out, lacunes_ouvertes(db, student_id=student_id, skill_ids=skill_ids)
