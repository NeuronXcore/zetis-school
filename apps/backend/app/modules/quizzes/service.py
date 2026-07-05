"""Service du moteur de quiz unifié — fin de cours en premier client (ADR-0014, Lot 1).

Génération LOCALE depuis le cours canonique validé (deuxième client de `resolve_canonical_context`
après ELI5), auto-vérification à l'aveugle (Décision 5), correction déterministe serveur,
CRUD Papa (co-construction) et flux de tentative élève (feedback immédiat sans jamais livrer
la clé). Vocabulaire bienveillant (CLAUDE.md). Le module `diagnostics` (étape 14) reste intact.
"""

import json
from datetime import datetime, timezone

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    AIJob,
    Chapter,
    Lesson,
    LessonSkill,
    Quiz,
    QuizAnswer,
    QuizAttempt,
    QuizQuestion,
    SchoolYear,
    SchoolYearSubject,
    Skill,
    StudentProfile,
    Subject,
)
from app.modules.ai.canonical_context import (
    CanonicalContext,
    build_canonical_sections,
    resolve_canonical_context,
)
from app.modules.ai.provider import EmbeddingProvider, LLMProvider, LLMRequest
from app.modules.gamification.service import XP_QUIZ_COMPLETED, award_xp
from app.modules.quizzes import correction, scoring
from app.modules.quizzes.schemas import (
    GeneratedQuiz,
    ManualQuestionCreate,
    QuestionPatch,
)
from app.prompts.quiz import (
    QUIZ_GEN_FMT,
    QUIZ_GEN_PROMPT_V1,
    QUIZ_PROMPT_VERSION,
    QUIZ_SYSTEM,
    QUIZ_VERIFY_FMT,
    QUIZ_VERIFY_PROMPT_V1,
    QUIZ_VERIFY_SYSTEM,
    VERIFY_ANSWER_SHAPE,
)

QUIZ_TYPE_MISSION = "mission"
# Types éditables à la main par Papa (Lot 1) : les sept à correction déterministe.
MANUAL_QUESTION_TYPES = correction.SUPPORTED_TYPES


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Garde-fous & helpers ──────────────────────────────────────────────────────


def _validated_lesson_or_409(db: Session, lesson_id: int | None) -> Lesson:
    lesson = db.get(Lesson, lesson_id) if lesson_id is not None else None
    if lesson is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Leçon introuvable.")
    if lesson.status != "validated":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="La leçon doit être validée avant de générer un quiz.",
        )
    if not lesson.content_markdown:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="La leçon n'a pas encore de cours rédigé — génère le cours d'abord.",
        )
    return lesson


def _lesson_skills(db: Session, lesson_id: int) -> list[Skill]:
    return list(
        db.scalars(
            select(Skill)
            .join(LessonSkill, LessonSkill.skill_id == Skill.id)
            .where(LessonSkill.lesson_id == lesson_id)
            .order_by(Skill.id)
        )
    )


def _mission_quiz_or_404(db: Session, quiz_id: int) -> Quiz:
    quiz = db.get(Quiz, quiz_id)
    if quiz is None or quiz.quiz_type != QUIZ_TYPE_MISSION:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Quiz introuvable.")
    return quiz


def _question_or_404(db: Session, question_id: int) -> QuizQuestion:
    q = db.get(QuizQuestion, question_id)
    if q is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Question introuvable.")
    return q


def _question_has_answers(db: Session, question_id: int) -> bool:
    return bool(
        db.scalar(
            select(func.count()).select_from(QuizAnswer).where(QuizAnswer.question_id == question_id)
        )
    )


def _quiz_has_attempts(db: Session, quiz_id: int) -> bool:
    return bool(
        db.scalar(
            select(func.count()).select_from(QuizAttempt).where(QuizAttempt.quiz_id == quiz_id)
        )
    )


def _skill_name(db: Session, skill_id: int | None) -> str:
    if skill_id is None:
        return "Notion"
    skill = db.get(Skill, skill_id)
    return skill.name if skill is not None else "Notion"


# ── Génération (LLM local + auto-vérification à l'aveugle) ─────────────────────


def _canonical_sections(
    db: Session, embedder: EmbeddingProvider, lesson: Lesson, skills: list[Skill]
) -> str:
    """Bloc de contexte canonique. Le quiz de fin de cours ancre LE cours = cette leçon
    (déjà validée par la garde de route) ; le RAG du substrat ne sert que de complément."""
    ctx = resolve_canonical_context(db, embedder, skill_id=skills[0].id, query=lesson.title)
    ctx = CanonicalContext(lesson=lesson, chunks=ctx.chunks)  # cours forcé = la leçon quizzée
    return build_canonical_sections(ctx)


def _generate_and_parse(provider: LLMProvider, prompt: str) -> GeneratedQuiz:
    """Pipeline ADR-0007 : validation Pydantic stricte → 1 réparation → 502."""
    raw = provider.generate(
        LLMRequest(prompt=prompt, system=QUIZ_SYSTEM, json_output=True, fmt=QUIZ_GEN_FMT)
    )
    try:
        return GeneratedQuiz.model_validate_json(raw.text)
    except (ValidationError, ValueError):
        repair = (
            prompt
            + "\n\nTa réponse précédente n'était pas un JSON valide au format demandé. "
            "Recommence en respectant EXACTEMENT la structure, sans texte autour."
        )
        raw2 = provider.generate(
            LLMRequest(prompt=repair, system=QUIZ_SYSTEM, json_output=True, fmt=QUIZ_GEN_FMT)
        )
        try:
            return GeneratedQuiz.model_validate_json(raw2.text)
        except (ValidationError, ValueError) as exc:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                detail=f"Génération du quiz invalide après réparation : {exc}",
            ) from exc


def _format_question_for_verify(qtype: str, prompt_text: str, choices_json) -> str:
    """Met en forme l'énoncé + les options pour l'auto-vérification — SANS la clé."""
    lines = [prompt_text]
    if qtype in ("mcq", "mcq_multi") and isinstance(choices_json, list):
        lines += [f"{i}. {c}" for i, c in enumerate(choices_json)]
    elif qtype == "ordering" and isinstance(choices_json, dict):
        lines.append("Éléments : " + ", ".join(str(x) for x in choices_json.get("items", [])))
    elif qtype == "matching" and isinstance(choices_json, dict):
        lines.append("Gauche : " + ", ".join(str(x) for x in choices_json.get("left", [])))
        lines.append("Droite : " + ", ".join(str(x) for x in choices_json.get("right", [])))
    return "\n".join(lines)


def _self_check_agrees(
    provider: LLMProvider, qtype: str, prompt_text: str, choices_json, key_json
) -> bool:
    """Resoumet la question à l'aveugle ; True si la réponse du modèle CONCORDE avec la clé.

    Une réponse de vérification illisible est traitée comme une divergence (on écarte par
    prudence : mieux vaut une question de moins qu'une clé douteuse servie à l'enfant)."""
    presentation = _format_question_for_verify(qtype, prompt_text, choices_json)
    vprompt = QUIZ_VERIFY_PROMPT_V1.format(
        question=presentation, shape=VERIFY_ANSWER_SHAPE.get(qtype, "{...}")
    )
    resp = provider.generate(
        LLMRequest(
            prompt=vprompt, system=QUIZ_VERIFY_SYSTEM, json_output=True, fmt=QUIZ_VERIFY_FMT
        )
    )
    try:
        model_answer = json.loads(resp.text).get("answer")
    except (json.JSONDecodeError, AttributeError):
        return False
    return correction.correct(qtype, model_answer, key_json)


def _produce_questions(
    db: Session,
    provider: LLMProvider,
    embedder: EmbeddingProvider,
    *,
    lesson: Lesson,
    skills: list[Skill],
    count: int,
    difficulty: int,
) -> tuple[list[dict], dict]:
    """Génère, valide, résout la notion et auto-vérifie chaque question. Renvoie les survivantes
    (prêtes à persister) + les compteurs (`discarded`, `invalid`)."""
    sections = _canonical_sections(db, embedder, lesson, skills)
    skill_by_norm = {correction.normalize_text(s.name): s for s in skills}
    prompt = QUIZ_GEN_PROMPT_V1.format(
        sections=sections,
        notions="\n".join(f"- {s.name}" for s in skills),
        count=count,
        difficulty=difficulty,
    )
    parsed = _generate_and_parse(provider, prompt)

    survivors: list[dict] = []
    counters = {"discarded": 0, "invalid": 0}
    for gq in parsed.questions:
        skill = skill_by_norm.get(correction.normalize_text(gq.skill))
        if skill is None:  # notion non résolue → rejetée au parsing (une question = un skill_id)
            counters["invalid"] += 1
            continue
        try:
            choices_json, key_json = gq.columns()
        except (ValueError, TypeError):
            counters["invalid"] += 1
            continue
        if not _self_check_agrees(provider, gq.question_type, gq.prompt, choices_json, key_json):
            counters["discarded"] += 1  # le modèle ne retrouve pas sa propre clé → écartée
            continue
        survivors.append(
            {
                "skill_id": skill.id,
                "question_type": gq.question_type,
                "prompt_markdown": gq.prompt,
                "choices_json": choices_json,
                "correct_answer_json": key_json,
                "explanation_markdown": gq.explanation,
                "difficulty": gq.difficulty or difficulty,
            }
        )
    return survivors, counters


def _persist_questions(db: Session, quiz_id: int, survivors: list[dict], start_order: int) -> None:
    order = start_order
    for s in survivors:
        db.add(
            QuizQuestion(
                quiz_id=quiz_id,
                skill_id=s["skill_id"],
                question_type=s["question_type"],
                prompt_markdown=s["prompt_markdown"],
                choices_json=s["choices_json"],
                correct_answer_json=s["correct_answer_json"],
                explanation_markdown=s["explanation_markdown"],
                difficulty=s["difficulty"],
                sort_order=order,
                source="generated",
                status="active",
            )
        )
        order += 1


def _trace_job(
    db: Session,
    *,
    lesson: Lesson,
    quiz_id: int,
    count: int,
    difficulty: int,
    generated: int,
    discarded: int,
    invalid: int,
    started_at: datetime,
) -> None:
    finished = _now()
    db.add(
        AIJob(
            job_type="quiz_generate",
            status="succeeded",
            input_json={
                "lesson_id": lesson.id,
                "count": count,
                "difficulty": difficulty,
                "prompt_version": QUIZ_PROMPT_VERSION,
            },
            output_json={
                "quiz_id": quiz_id,
                "lesson_id": lesson.id,
                "lesson_title": lesson.title,
                "questions_generated": generated,
                "questions_discarded": discarded,
                "questions_invalid": invalid,
            },
            created_by="parent",
            created_at=started_at,
            started_at=started_at,
            finished_at=finished,
            duration_ms=int((finished - started_at).total_seconds() * 1000),
        )
    )


def generate_quiz(
    db: Session,
    provider: LLMProvider,
    embedder: EmbeddingProvider,
    *,
    lesson_id: int,
    count: int,
    difficulty: int,
) -> tuple[Quiz, dict]:
    """Crée un NOUVEAU quiz de fin de cours (0..N par leçon). 409 si leçon non validée / sans cours."""
    lesson = _validated_lesson_or_409(db, lesson_id)
    skills = _lesson_skills(db, lesson.id)
    if not skills:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="La leçon n'a aucune notion rattachée — impossible d'attribuer les questions.",
        )
    started = _now()
    survivors, counters = _produce_questions(
        db, provider, embedder, lesson=lesson, skills=skills, count=count, difficulty=difficulty
    )
    if not survivors:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Aucune question n'a passé l'auto-vérification — réessaie la génération.",
        )

    quiz = Quiz(
        subject_id=skills[0].subject_id,
        lesson_id=lesson.id,
        chapter_id=lesson.chapter_id,
        title=f"Quiz — {lesson.title}",
        quiz_type=QUIZ_TYPE_MISSION,
        status="ready",
        created_by="ai",
    )
    db.add(quiz)
    db.flush()
    _persist_questions(db, quiz.id, survivors, start_order=0)
    _trace_job(
        db,
        lesson=lesson,
        quiz_id=quiz.id,
        count=count,
        difficulty=difficulty,
        generated=len(survivors),
        discarded=counters["discarded"],
        invalid=counters["invalid"],
        started_at=started,
    )
    db.commit()
    db.refresh(quiz)
    return quiz, {"questions_generated": len(survivors), "questions_discarded": counters["discarded"]}


def regenerate_quiz(
    db: Session, provider: LLMProvider, embedder: EmbeddingProvider, *, quiz_id: int
) -> tuple[Quiz, dict]:
    """Remplace les questions `generated` actives, PRÉSERVE les `manual` (règle des chapitres)."""
    quiz = _mission_quiz_or_404(db, quiz_id)
    lesson = _validated_lesson_or_409(db, quiz.lesson_id)
    skills = _lesson_skills(db, lesson.id)
    if not skills:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="La leçon n'a aucune notion rattachée."
        )
    started = _now()
    # Produit d'abord (peut lever 502) AVANT de toucher l'existant — pas de quiz vidé pour rien.
    survivors, counters = _produce_questions(
        db, provider, embedder, lesson=lesson, skills=skills, count=len(skills) or 5, difficulty=2
    )
    if not survivors:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Aucune question n'a passé l'auto-vérification — l'ancien quiz est conservé.",
        )

    gen_active = list(
        db.scalars(
            select(QuizQuestion).where(
                QuizQuestion.quiz_id == quiz.id,
                QuizQuestion.source == "generated",
                QuizQuestion.status == "active",
            )
        )
    )
    for q in gen_active:
        if _question_has_answers(db, q.id):
            q.status = "retired"  # a des réponses → retiré (les quiz_answers restent intacts)
        else:
            db.delete(q)
    next_order = (
        db.scalar(select(func.max(QuizQuestion.sort_order)).where(QuizQuestion.quiz_id == quiz.id))
        or 0
    ) + 1
    _persist_questions(db, quiz.id, survivors, start_order=next_order)
    _trace_job(
        db,
        lesson=lesson,
        quiz_id=quiz.id,
        count=len(skills),
        difficulty=2,
        generated=len(survivors),
        discarded=counters["discarded"],
        invalid=counters["invalid"],
        started_at=started,
    )
    db.commit()
    db.refresh(quiz)
    return quiz, {"questions_generated": len(survivors), "questions_discarded": counters["discarded"]}


# ── CRUD Papa ─────────────────────────────────────────────────────────────────


def _discard_rate(db: Session, quiz_id: int) -> float | None:
    """Taux d'écart de l'auto-vérification (dernier job de génération du quiz)."""
    jobs = db.scalars(
        select(AIJob).where(AIJob.job_type == "quiz_generate").order_by(AIJob.id.desc())
    )
    for job in jobs:
        out = job.output_json or {}
        if out.get("quiz_id") == quiz_id:
            gen = out.get("questions_generated", 0)
            disc = out.get("questions_discarded", 0)
            total = gen + disc
            return round(disc / total, 3) if total else None
    return None


def _quiz_list_item(db: Session, quiz: Quiz) -> dict:
    active = select(QuizQuestion).where(
        QuizQuestion.quiz_id == quiz.id, QuizQuestion.status == "active"
    )
    questions_count = db.scalar(select(func.count()).select_from(active.subquery())) or 0
    manual_count = (
        db.scalar(
            select(func.count())
            .select_from(QuizQuestion)
            .where(
                QuizQuestion.quiz_id == quiz.id,
                QuizQuestion.status == "active",
                QuizQuestion.source == "manual",
            )
        )
        or 0
    )
    lesson = db.get(Lesson, quiz.lesson_id) if quiz.lesson_id is not None else None
    return {
        "quiz_id": quiz.id,
        "title": quiz.title,
        "quiz_type": quiz.quiz_type,
        "status": quiz.status,
        "lesson_id": quiz.lesson_id,
        "lesson_title": lesson.title if lesson is not None else None,
        "questions_count": questions_count,
        "manual_count": manual_count,
        "discard_rate": _discard_rate(db, quiz.id),
    }


def list_quizzes_for_lesson(db: Session, lesson_id: int) -> list[dict]:
    quizzes = db.scalars(
        select(Quiz)
        .where(Quiz.lesson_id == lesson_id, Quiz.quiz_type == QUIZ_TYPE_MISSION)
        .order_by(Quiz.id.desc())
    )
    return [_quiz_list_item(db, q) for q in quizzes]


def list_quizzes_for_subject(db: Session, subject_slug: str) -> list[dict]:
    subject = db.scalar(select(Subject).where(Subject.slug == subject_slug))
    if subject is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Matière « {subject_slug} » inconnue.")
    quizzes = db.scalars(
        select(Quiz)
        .where(Quiz.subject_id == subject.id, Quiz.quiz_type == QUIZ_TYPE_MISSION)
        .order_by(Quiz.id.desc())
    )
    return [_quiz_list_item(db, q) for q in quizzes]


def _papa_question_out(db: Session, q: QuizQuestion) -> dict:
    return {
        "id": q.id,
        "question_type": q.question_type,
        "prompt_markdown": q.prompt_markdown,
        "choices_json": q.choices_json,
        "correct_answer_json": q.correct_answer_json,
        "explanation_markdown": q.explanation_markdown,
        "skill_id": q.skill_id,
        "skill_name": _skill_name(db, q.skill_id),
        "difficulty": q.difficulty,
        "source": q.source,
        "status": q.status,
        "sort_order": q.sort_order,
    }


def get_quiz_papa(db: Session, quiz_id: int) -> dict:
    """Vue Papa : toutes les questions (actives ET retirées) AVEC clés et explications."""
    quiz = _mission_quiz_or_404(db, quiz_id)
    questions = db.scalars(
        select(QuizQuestion)
        .where(QuizQuestion.quiz_id == quiz.id)
        .order_by(QuizQuestion.sort_order, QuizQuestion.id)
    )
    return {
        "quiz_id": quiz.id,
        "title": quiz.title,
        "lesson_id": quiz.lesson_id,
        "subject_id": quiz.subject_id,
        "status": quiz.status,
        "questions": [_papa_question_out(db, q) for q in questions],
    }


def patch_question(db: Session, question_id: int, patch: QuestionPatch) -> dict:
    """Édite une question. TOUTE édition bascule `source='manual'` (règle de service)."""
    q = _question_or_404(db, question_id)
    data = patch.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(q, field, value)
    q.source = "manual"  # survit désormais aux régénérations
    db.commit()
    db.refresh(q)
    return _papa_question_out(db, q)


def add_manual_question(db: Session, quiz_id: int, payload: ManualQuestionCreate) -> dict:
    """Ajoute une question manuelle (`source='manual'`, validée d'office)."""
    quiz = _mission_quiz_or_404(db, quiz_id)
    if payload.question_type not in MANUAL_QUESTION_TYPES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Type de question non pris en charge (Lot 1) : {payload.question_type}.",
        )
    next_order = (
        db.scalar(select(func.max(QuizQuestion.sort_order)).where(QuizQuestion.quiz_id == quiz.id))
        or 0
    ) + 1
    q = QuizQuestion(
        quiz_id=quiz.id,
        skill_id=payload.skill_id,
        question_type=payload.question_type,
        prompt_markdown=payload.prompt_markdown,
        choices_json=payload.choices_json,
        correct_answer_json=payload.correct_answer_json,
        explanation_markdown=payload.explanation_markdown,
        difficulty=payload.difficulty,
        sort_order=next_order,
        source="manual",
        status="active",
    )
    db.add(q)
    db.commit()
    db.refresh(q)
    return _papa_question_out(db, q)


def retire_question(db: Session, question_id: int) -> dict:
    """Retire une question des tirages (`status='retired'`) — les réponses passées restent."""
    q = _question_or_404(db, question_id)
    q.status = "retired"
    db.commit()
    db.refresh(q)
    return _papa_question_out(db, q)


def delete_quiz(db: Session, quiz_id: int) -> dict:
    """Hard delete si aucune tentative ; sinon archivage (l'historique de maîtrise reste)."""
    quiz = _mission_quiz_or_404(db, quiz_id)
    if _quiz_has_attempts(db, quiz_id):
        quiz.status = "archived"
        db.commit()
        return {"deleted": False, "archived": True}
    for q in db.scalars(select(QuizQuestion).where(QuizQuestion.quiz_id == quiz_id)):
        db.delete(q)
    db.delete(quiz)
    db.commit()
    return {"deleted": True, "archived": False}


# ── Flux élève (préfixe /api/student — filtrage serveur) ──────────────────────


def _active_year(db: Session) -> SchoolYear | None:
    return db.scalar(
        select(SchoolYear).where(SchoolYear.status == "active").order_by(SchoolYear.id.desc())
    )


def _validated_lesson_ids_for_subject(db: Session, subject_id: int) -> list[int]:
    """Ids des leçons validées de la matière dans l'année active (via chapitres validés)."""
    year = _active_year(db)
    if year is None:
        return []
    sys_ids = list(
        db.scalars(
            select(SchoolYearSubject.id).where(
                SchoolYearSubject.school_year_id == year.id,
                SchoolYearSubject.subject_id == subject_id,
            )
        )
    )
    if not sys_ids:
        return []
    chapter_ids = list(
        db.scalars(
            select(Chapter.id).where(
                Chapter.school_year_subject_id.in_(sys_ids),
                Chapter.validation_status == "validated",
            )
        )
    )
    if not chapter_ids:
        return []
    return list(
        db.scalars(
            select(Lesson.id).where(
                Lesson.chapter_id.in_(chapter_ids), Lesson.status == "validated"
            )
        )
    )


def _student_question_out(db: Session, q: QuizQuestion) -> dict:
    """Question pour Massimo : SANS `correct_answer_json` ni `explanation_markdown`."""
    return {
        "id": q.id,
        "question_type": q.question_type,
        "prompt_markdown": q.prompt_markdown,
        "choices_json": q.choices_json,
        "skill_id": q.skill_id,
        "skill_name": _skill_name(db, q.skill_id),
    }


def list_student_quizzes(db: Session, subject_slug: str) -> list[dict]:
    """Quiz jouables : leçons validées de l'année active, questions actives, sans clé."""
    subject = db.scalar(select(Subject).where(Subject.slug == subject_slug))
    if subject is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Matière « {subject_slug} » inconnue.")
    lesson_ids = _validated_lesson_ids_for_subject(db, subject.id)
    if not lesson_ids:
        return []
    quizzes = list(
        db.scalars(
            select(Quiz)
            .where(
                Quiz.lesson_id.in_(lesson_ids),
                Quiz.quiz_type == QUIZ_TYPE_MISSION,
                Quiz.status != "archived",
            )
            .order_by(Quiz.id.desc())
        )
    )
    out: list[dict] = []
    for quiz in quizzes:
        questions = list(
            db.scalars(
                select(QuizQuestion)
                .where(QuizQuestion.quiz_id == quiz.id, QuizQuestion.status == "active")
                .order_by(QuizQuestion.sort_order, QuizQuestion.id)
            )
        )
        if not questions:
            continue
        out.append(
            {
                "quiz_id": quiz.id,
                "title": quiz.title,
                "lesson_id": quiz.lesson_id,
                "questions": [_student_question_out(db, q) for q in questions],
            }
        )
    return out


def student_quiz_subjects(db: Session) -> list[dict]:
    """Grille « Quiz » (écran 1) : matières de l'année active à leçons validées + nb de quiz.

    `quiz_count == 0` → la matière est servie mais grisée (« bientôt »), même logique que les
    matières sans carte sur la page Révision. Matière sans leçon validée : absente."""
    year = _active_year(db)
    if year is None:
        return []
    subjects = list(db.scalars(select(Subject).order_by(Subject.sort_order, Subject.name)))
    out: list[dict] = []
    for subject in subjects:
        lesson_ids = _validated_lesson_ids_for_subject(db, subject.id)
        if not lesson_ids:
            continue
        quiz_count = (
            db.scalar(
                select(func.count())
                .select_from(Quiz)
                .where(
                    Quiz.lesson_id.in_(lesson_ids),
                    Quiz.quiz_type == QUIZ_TYPE_MISSION,
                    Quiz.status != "archived",
                )
            )
            or 0
        )
        out.append(
            {
                "subject_id": subject.id,
                "slug": subject.slug,
                "name": subject.name,
                "quiz_count": quiz_count,
            }
        )
    return out


def _servable_quiz_or_404(db: Session, quiz_id: int) -> Quiz:
    quiz = _mission_quiz_or_404(db, quiz_id)
    if quiz.status == "archived":
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Quiz indisponible.")
    _validated_lesson_or_409(db, quiz.lesson_id)  # la leçon source doit rester validée
    return quiz


def start_attempt(db: Session, student: StudentProfile, quiz_id: int) -> dict:
    quiz = _servable_quiz_or_404(db, quiz_id)
    now = _now()
    attempt = QuizAttempt(
        quiz_id=quiz.id,
        student_id=student.id,
        started_at=now,
        context=quiz.quiz_type,  # « mission » → scoring signal faible
    )
    db.add(attempt)
    db.flush()
    count = (
        db.scalar(
            select(func.count())
            .select_from(QuizQuestion)
            .where(QuizQuestion.quiz_id == quiz.id, QuizQuestion.status == "active")
        )
        or 0
    )
    db.commit()
    return {"attempt_id": attempt.id, "quiz_id": quiz.id, "questions_count": count}


def _attempt_or_404(db: Session, student: StudentProfile, attempt_id: int) -> QuizAttempt:
    attempt = db.get(QuizAttempt, attempt_id)
    if attempt is None or attempt.student_id != student.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tentative introuvable.")
    return attempt


def submit_answer(
    db: Session, student: StudentProfile, attempt_id: int, question_id: int, answer_json
) -> dict:
    """Corrige CETTE réponse côté serveur et renvoie le feedback immédiat (jamais la clé)."""
    attempt = _attempt_or_404(db, student, attempt_id)
    q = _question_or_404(db, question_id)
    if q.quiz_id != attempt.quiz_id or q.status != "active":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Question hors de cette tentative."
        )
    is_correct = correction.correct(q.question_type, answer_json, q.correct_answer_json)
    existing = db.scalar(
        select(QuizAnswer).where(
            QuizAnswer.attempt_id == attempt_id, QuizAnswer.question_id == question_id
        )
    )
    if existing is not None:
        existing.answer_json = answer_json
        existing.is_correct = is_correct
        existing.score = 1.0 if is_correct else 0.0
    else:
        db.add(
            QuizAnswer(
                attempt_id=attempt_id,
                question_id=question_id,
                answer_json=answer_json,
                is_correct=is_correct,
                score=1.0 if is_correct else 0.0,
            )
        )
    db.commit()
    return {"is_correct": is_correct, "explanation_markdown": q.explanation_markdown}


def complete_attempt(db: Session, student: StudentProfile, attempt_id: int) -> dict:
    """Score global + par notion, scoring pondéré (signal faible), XP, résumé bienveillant."""
    attempt = _attempt_or_404(db, student, attempt_id)
    quiz = db.get(Quiz, attempt.quiz_id)
    rows = db.execute(
        select(QuizAnswer, QuizQuestion, Skill)
        .join(QuizQuestion, QuizQuestion.id == QuizAnswer.question_id)
        .outerjoin(Skill, Skill.id == QuizQuestion.skill_id)
        .where(QuizAnswer.attempt_id == attempt_id)
    ).all()

    per_skill: dict[int | None, dict] = {}
    total = total_correct = 0
    for ans, q, skill in rows:
        total += 1
        total_correct += int(bool(ans.is_correct))
        bucket = per_skill.setdefault(
            q.skill_id,
            {"name": skill.name if skill is not None else "Notion", "correct": 0, "total": 0},
        )
        bucket["total"] += 1
        bucket["correct"] += int(bool(ans.is_correct))

    overall = round(total_correct / total * 100) if total else 0
    now = _now()
    per_skill_scores = {
        sid: round(d["correct"] / d["total"] * 100)
        for sid, d in per_skill.items()
        if sid is not None and d["total"]
    }
    scoring.apply_quiz_result(
        db,
        student_id=student.id,
        per_skill_scores=per_skill_scores,
        context=attempt.context or QUIZ_TYPE_MISSION,
        now=now,
    )
    award_xp(
        db,
        student_id=student.id,
        subject_id=quiz.subject_id if quiz is not None else None,
        amount=XP_QUIZ_COMPLETED,
        reason="quiz_completed",
    )
    attempt.score_percent = overall
    attempt.completed_at = now
    db.commit()

    per_skill_out: list[dict] = []
    strengths: list[str] = []
    to_review: list[str] = []
    for sid, d in per_skill.items():
        score = round(d["correct"] / d["total"] * 100) if d["total"] else 0
        status_label = scoring._status_from_score(score)
        per_skill_out.append(
            {"skill_id": sid, "skill_name": d["name"], "score": score, "status": status_label}
        )
        (strengths if score >= 70 else to_review).append(d["name"])

    return {
        "attempt_id": attempt.id,
        "quiz_id": attempt.quiz_id,
        "score_percent": overall,
        "xp_awarded": XP_QUIZ_COMPLETED,
        "per_skill": per_skill_out,
        "strengths": strengths,
        "to_review": to_review,
    }


# ── Pilotage Papa : overview + arbre par matière (page « Quiz — pilotage ») ────
# Surface de LECTURE dédiée (même patron que la page SRS : overview léger + arbre matière).


def _generation_stats_by_subject(db: Session) -> dict[int, dict]:
    """Cumule (généré, écarté) par matière depuis les traces `ai_jobs` de génération.

    Le taux d'écart de l'auto-vérification est l'indicateur de santé du moteur local par
    matière (Décision 5). On relie chaque job à sa matière via `output_json.quiz_id`."""
    stats: dict[int, dict] = {}
    jobs = db.scalars(
        select(AIJob).where(AIJob.job_type == "quiz_generate").order_by(AIJob.id)
    )
    for job in jobs:
        out = job.output_json or {}
        quiz = db.get(Quiz, out.get("quiz_id")) if out.get("quiz_id") else None
        if quiz is None:
            continue
        bucket = stats.setdefault(quiz.subject_id, {"generated": 0, "discarded": 0})
        bucket["generated"] += out.get("questions_generated", 0)
        bucket["discarded"] += out.get("questions_discarded", 0)
    return stats


def _subject_validated_lessons(db: Session, subject_id: int) -> list[Lesson]:
    """Leçons validées (avec cours) de la matière dans l'année active, ordre du curriculum."""
    year = _active_year(db)
    if year is None:
        return []
    sys_row = db.scalar(
        select(SchoolYearSubject).where(
            SchoolYearSubject.school_year_id == year.id,
            SchoolYearSubject.subject_id == subject_id,
        )
    )
    if sys_row is None:
        return []
    chapters = list(
        db.scalars(
            select(Chapter)
            .where(
                Chapter.school_year_subject_id == sys_row.id,
                Chapter.validation_status == "validated",
            )
            .order_by(Chapter.sort_order, Chapter.id)
        )
    )
    lessons: list[Lesson] = []
    for chapter in chapters:
        for lesson in db.scalars(
            select(Lesson)
            .where(
                Lesson.chapter_id == chapter.id,
                Lesson.status == "validated",
                Lesson.content_markdown.isnot(None),
            )
            .order_by(Lesson.sort_order, Lesson.id)
        ):
            lesson._chapter_name = chapter.name  # type: ignore[attr-defined]
            lessons.append(lesson)
    return lessons


def _quiz_card(db: Session, quiz: Quiz) -> dict:
    """Résumé d'un quiz pour la page pilotage : compteurs, formats, taux d'écart."""
    active = list(
        db.scalars(
            select(QuizQuestion).where(
                QuizQuestion.quiz_id == quiz.id, QuizQuestion.status == "active"
            )
        )
    )
    retired = (
        db.scalar(
            select(func.count())
            .select_from(QuizQuestion)
            .where(QuizQuestion.quiz_id == quiz.id, QuizQuestion.status == "retired")
        )
        or 0
    )
    formats: list[str] = []
    for q in active:  # formats distincts, ordre d'apparition (stable pour l'UI)
        if q.question_type not in formats:
            formats.append(q.question_type)
    return {
        "quiz_id": quiz.id,
        "title": quiz.title,
        "quiz_type": quiz.quiz_type,
        "status": quiz.status,
        "questions_count": len(active),
        "retired_count": retired,
        "manual_count": sum(1 for q in active if q.source == "manual"),
        "formats": formats,
        "discard_rate": _discard_rate(db, quiz.id),
        "created_at": quiz.created_at.isoformat() if quiz.created_at is not None else None,
    }


def pilotage_overview(db: Session) -> dict:
    """KPI globaux + santé de la génération par matière (payload léger, jamais les questions)."""
    subjects = list(db.scalars(select(Subject).order_by(Subject.sort_order, Subject.name)))
    gen_stats = _generation_stats_by_subject(db)

    kpi = {"active_quizzes": 0, "served_questions": 0, "retired_questions": 0}
    out_subjects: list[dict] = []
    total_generated = total_discarded = 0
    for subject in subjects:
        lessons = _subject_validated_lessons(db, subject.id)
        if not lessons:
            continue
        lesson_ids = [lesson.id for lesson in lessons]
        quizzes = list(
            db.scalars(
                select(Quiz).where(
                    Quiz.lesson_id.in_(lesson_ids),
                    Quiz.quiz_type == QUIZ_TYPE_MISSION,
                    Quiz.status != "archived",
                )
            )
        )
        lessons_with_quiz = {q.lesson_id for q in quizzes}
        served = retired = 0
        for quiz in quizzes:
            served += (
                db.scalar(
                    select(func.count())
                    .select_from(QuizQuestion)
                    .where(QuizQuestion.quiz_id == quiz.id, QuizQuestion.status == "active")
                )
                or 0
            )
            retired += (
                db.scalar(
                    select(func.count())
                    .select_from(QuizQuestion)
                    .where(QuizQuestion.quiz_id == quiz.id, QuizQuestion.status == "retired")
                )
                or 0
            )
        stats = gen_stats.get(subject.id, {"generated": 0, "discarded": 0})
        gen, disc = stats["generated"], stats["discarded"]
        total_generated += gen
        total_discarded += disc
        kpi["active_quizzes"] += len(quizzes)
        kpi["served_questions"] += served
        kpi["retired_questions"] += retired
        out_subjects.append(
            {
                "subject_id": subject.id,
                "name": subject.name,
                "slug": subject.slug,
                "validated_lessons": len(lessons),
                "lessons_without_quiz": len(lessons) - len(lessons_with_quiz),
                "quiz_count": len(quizzes),
                "discarded": disc,
                "generated_total": gen + disc,
                "discard_rate": round(disc / (gen + disc), 3) if (gen + disc) else None,
            }
        )
    kpi["avg_discard_rate"] = (
        round(total_discarded / total_generated, 3) if total_generated else None
    )
    return {"kpis": kpi, "subjects": out_subjects}


def pilotage_subject_tree(db: Session, subject_id: int) -> dict:
    """Leçons validées de la matière + leurs quiz (leçons SANS quiz incluses → bouton Générer)."""
    subject = db.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Matière introuvable.")
    lessons = _subject_validated_lessons(db, subject_id)
    out_lessons: list[dict] = []
    for lesson in lessons:
        quizzes = list(
            db.scalars(
                select(Quiz)
                .where(
                    Quiz.lesson_id == lesson.id,
                    Quiz.quiz_type == QUIZ_TYPE_MISSION,
                    Quiz.status != "archived",
                )
                .order_by(Quiz.id.desc())
            )
        )
        out_lessons.append(
            {
                "lesson_id": lesson.id,
                "title": lesson.title,
                "chapter_name": getattr(lesson, "_chapter_name", None),
                "quizzes": [_quiz_card(db, q) for q in quizzes],
            }
        )
    return {
        "subject_id": subject.id,
        "name": subject.name,
        "slug": subject.slug,
        "lessons": out_lessons,
    }
