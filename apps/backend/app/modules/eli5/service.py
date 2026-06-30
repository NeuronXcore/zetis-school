import json
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AIJob, LearningEvent, Skill, SkillMastery, StudentProfile, Subject
from app.modules.ai.provider import LLMProvider, LLMRequest
from app.modules.eli5.schemas import ELI5ExplainRequest, ELI5ReverseRequest
from app.modules.memory.service import interval_from_score, schedule_review
from app.prompts.eli5 import (
    ELI5_EXPLAIN_PROMPT_V1,
    ELI5_REVERSE_PROMPT_V1,
    ELI5_SYSTEM,
    PROMPT_VERSION,
)

_BANNED_WORDS = ("nul", "échec", "echec", "grosse lacune")
_SAFE_FEEDBACK = "C'est une notion à renforcer — tu progresses, on continue ensemble à la prochaine étape."


def _sanitize_feedback(text: str) -> str:
    """Garde-fou pédagogique : remplace tout feedback humiliant (CLAUDE.md)."""
    lowered = text.lower()
    if any(word in lowered for word in _BANNED_WORDS):
        return _SAFE_FEEDBACK
    return text or _SAFE_FEEDBACK


def get_default_student(db: Session) -> StudentProfile:
    """Élève courant (MVP : premier profil — lien auth↔DB ultérieur)."""
    student = db.scalar(select(StudentProfile).order_by(StudentProfile.id))
    if student is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aucun profil élève en base (lance `python -m app.db.seed`).",
        )
    return student


def _skill_and_subject(db: Session, skill_id: int) -> tuple[Skill, Subject]:
    skill = db.get(Skill, skill_id)
    if skill is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Notion {skill_id} introuvable."
        )
    subject = db.get(Subject, skill.subject_id)
    assert subject is not None
    return skill, subject


def list_skills(db: Session) -> list[dict]:
    rows = db.execute(select(Skill, Subject).join(Subject, Subject.id == Skill.subject_id)).all()
    return [{"id": skill.id, "name": skill.name, "subject": subject.name} for skill, subject in rows]


def _run_traced(
    db: Session,
    *,
    job_type: str,
    input_payload: dict,
    provider: LLMProvider,
    request: LLMRequest,
) -> dict:
    """Exécute un appel IA en SYNCHRONE et trace toujours un `ai_jobs` (input/output/statut/durée)."""
    now = datetime.now(timezone.utc)
    job = AIJob(
        job_type=job_type,
        status="running",
        input_json=input_payload,
        created_by="child",
        created_at=now,
        started_at=now,
    )
    db.add(job)
    db.flush()

    try:
        response = provider.generate(request)
        parsed = json.loads(response.text)
        if not isinstance(parsed, dict):
            raise ValueError("La réponse IA n'est pas un objet JSON.")
    except Exception as exc:  # noqa: BLE001
        job.status = "failed"
        job.error_message = str(exc)[:1000]
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Appel IA échoué : {exc}"
        ) from exc

    job.status = "succeeded"
    job.output_json = parsed
    job.duration_ms = response.duration_ms
    job.finished_at = datetime.now(timezone.utc)
    return parsed


def explain(
    db: Session,
    provider: LLMProvider,
    req: ELI5ExplainRequest,
    context: list[str] | None = None,
) -> dict:
    """ELI5 — ZETIS explique. `context` (vide ici) prépare la couture RAG (drop-in)."""
    get_default_student(db)
    skill, subject = _skill_and_subject(db, req.skill_id)

    prompt = ELI5_EXPLAIN_PROMPT_V1.format(
        level=skill.level or "4e",
        subject=subject.name,
        skill=skill.name,
        question=req.question or "(pas de question précise)",
        context="\n".join(context or []) or "(aucun)",
    )
    parsed = _run_traced(
        db,
        job_type="eli5_explain",
        input_payload={"skill_id": skill.id, "mode": req.mode, "prompt_version": PROMPT_VERSION},
        provider=provider,
        request=LLMRequest(prompt=prompt, system=ELI5_SYSTEM, json_output=True),
    )
    db.commit()
    return {
        "title": str(parsed.get("title") or f"Comprendre {skill.name}"),
        "simple_explanation": str(parsed.get("simple_explanation") or ""),
        "analogy": str(parsed.get("analogy") or ""),
        "example": str(parsed.get("example") or ""),
        "common_mistake": str(parsed.get("common_mistake") or ""),
        "check_question": str(parsed.get("check_question") or ""),
        "next_action": str(parsed.get("next_action") or "reverse_explain"),
    }


def _mastery_status(score: int) -> str:
    if score >= 90:
        return "mastered"
    if score >= 70:
        return "solid"
    if score >= 40:
        return "learning"
    return "weak"


def reverse_evaluate(db: Session, provider: LLMProvider, req: ELI5ReverseRequest) -> dict:
    """ELI5 reverse — Massimo explique, ZETIS évalue (synchrone) puis écrit la trace + mémoire."""
    student = get_default_student(db)
    skill, subject = _skill_and_subject(db, req.skill_id)

    prompt = ELI5_REVERSE_PROMPT_V1.format(
        skill=skill.name, subject=subject.name, level=skill.level or "4e", answer_text=req.answer_text
    )
    parsed = _run_traced(
        db,
        job_type="eli5_reverse",
        input_payload={"skill_id": skill.id, "prompt_version": PROMPT_VERSION},
        provider=provider,
        request=LLMRequest(prompt=prompt, system=ELI5_SYSTEM, json_output=True),
    )

    score = max(0, min(100, int(parsed.get("score", 0))))
    feedback = _sanitize_feedback(str(parsed.get("feedback", "")))
    missing = [str(p) for p in (parsed.get("missing_points") or [])][:5]
    next_action = str(parsed.get("next_action") or "prochaine étape : refaire une explication")

    now = datetime.now(timezone.utc)
    interval = interval_from_score(score)  # 1 / 3 / 7 jours, fixes

    # Trace de progression.
    db.add(
        LearningEvent(
            student_id=student.id,
            subject_id=subject.id,
            skill_id=skill.id,
            event_type="reverse_eli5",
            payload_json={"score": score, "interval_days": interval},
            created_at=now,
        )
    )

    # Upsert de la maîtrise de la notion.
    mastery = db.scalar(
        select(SkillMastery).where(
            SkillMastery.student_id == student.id, SkillMastery.skill_id == skill.id
        )
    )
    if mastery is None:
        mastery = SkillMastery(student_id=student.id, skill_id=skill.id)
        db.add(mastery)
    mastery.mastery_score = score
    mastery.confidence_score = score
    mastery.last_seen_at = now
    mastery.next_review_at = now + timedelta(days=interval)
    mastery.status = _mastery_status(score)

    # Une carte de révision (intervalle fixe selon le score).
    schedule_review(
        db,
        student_id=student.id,
        skill_id=skill.id,
        interval=interval,
        front=f"Réexplique : {skill.name}",
        back=req.answer_text,
    )

    db.commit()
    return {"score": score, "feedback": feedback, "missing_points": missing, "next_action": next_action}
