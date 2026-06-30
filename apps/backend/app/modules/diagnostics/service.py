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
from app.prompts.diagnostic import (
    DIAGNOSTIC_GEN_PROMPT_V1,
    DIAGNOSTIC_SYSTEM,
    PROMPT_VERSION,
)

QUESTIONS_PER_SKILL = 2
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


def generate_diagnostic(
    db: Session, provider: LLMProvider, subject_id: int, level: str | None
) -> tuple[Quiz, str, int]:
    """Génère un quiz diagnostic (QCM par notion) pour une matière. Trace ai_jobs."""
    subject = _subject_or_404(db, subject_id)
    skills = list(
        db.scalars(select(Skill).where(Skill.subject_id == subject_id).order_by(Skill.id))
    )[:MAX_SKILLS]
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
    rows = db.execute(
        select(Quiz, Subject)
        .join(Subject, Subject.id == Quiz.subject_id)
        .where(Quiz.quiz_type == "diagnostic")
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
    quiz = db.get(Quiz, quiz_id)
    if quiz is None or quiz.quiz_type != "diagnostic":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagnostic introuvable.")
    return quiz


def get_quiz_for_taking(db: Session, quiz_id: int) -> dict:
    """Questions servies à l'enfant : SANS la bonne réponse ni l'explication."""
    quiz = _quiz_or_404(db, quiz_id)
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
    quiz = _quiz_or_404(db, quiz_id)
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

    # Agrégat par notion : skill_id -> {name, correct, total}
    per_skill: dict[int | None, dict] = {}
    total_correct = 0
    for q, skill in rows:
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
        bucket = per_skill.setdefault(
            q.skill_id, {"name": skill.name if skill is not None else "Notion", "correct": 0, "total": 0}
        )
        bucket["total"] += 1
        bucket["correct"] += int(is_correct)

    overall = round(total_correct / len(rows) * 100)
    attempt.score_percent = overall

    per_skill_out: list[dict] = []
    gaps_out: list[dict] = []
    strengths: list[str] = []
    for skill_id, data in per_skill.items():
        score = round(data["correct"] / data["total"] * 100)
        status_label = _status_from_score(score)
        per_skill_out.append(
            {"skill_id": skill_id, "skill_name": data["name"], "score": score, "status": status_label}
        )
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
            gaps_out.append(
                {"skill_id": skill_id, "skill_name": data["name"], "severity": _severity_from_score(score)}
            )
        else:
            strengths.append(data["name"])

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
    mastery.status = _status_from_score(score)


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
        per_skill_out, gaps_out = _per_skill_for_attempt(db, attempt)
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


def _per_skill_for_attempt(db: Session, attempt: QuizAttempt) -> tuple[list[dict], list[dict]]:
    rows = db.execute(
        select(QuizAnswer, QuizQuestion, Skill)
        .join(QuizQuestion, QuizQuestion.id == QuizAnswer.question_id)
        .outerjoin(Skill, Skill.id == QuizQuestion.skill_id)
        .where(QuizAnswer.attempt_id == attempt.id)
    ).all()
    per_skill: dict[int | None, dict] = {}
    for answer, question, skill in rows:
        bucket = per_skill.setdefault(
            question.skill_id,
            {"name": skill.name if skill is not None else "Notion", "correct": 0, "total": 0},
        )
        bucket["total"] += 1
        bucket["correct"] += int(bool(answer.is_correct))
    per_skill_out: list[dict] = []
    gaps_out: list[dict] = []
    for skill_id, data in per_skill.items():
        score = round(data["correct"] / data["total"] * 100) if data["total"] else 0
        per_skill_out.append(
            {
                "skill_id": skill_id,
                "skill_name": data["name"],
                "score": score,
                "status": _status_from_score(score),
            }
        )
        if score < GAP_THRESHOLD:
            gaps_out.append(
                {"skill_id": skill_id, "skill_name": data["name"], "severity": _severity_from_score(score)}
            )
    return per_skill_out, gaps_out
