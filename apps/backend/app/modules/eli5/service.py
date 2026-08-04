import json
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AIJob, LearningEvent, Skill, SkillMastery, StudentProfile, Subject
from app.modules.activity.events import EVENT_ELI5_REQUESTED, log_learning_event
from app.modules.ai.canonical_context import build_canonical_sections, resolve_canonical_context
from app.modules.ai.provider import EmbeddingProvider, LLMProvider, LLMRequest
from app.modules.eli5.schemas import ELI5ExplainRequest, ELI5ReverseRequest
from app.modules.stt.provider import SttProvider, SttRequest, SttUnavailable
from app.modules.gamification.service import XP_ELI5_REVERSE, award_xp
from app.modules.memory.service import interval_from_score, schedule_review
from app.modules.progress.mastery import record_mastery_transition
from app.prompts.eli5 import (
    ELI5_EXPLAIN_PROMPT_V2,
    ELI5_EXPLAIN_PROMPT_VERSION,
    ELI5_REVERSE_PROMPT_V1,
    ELI5_SYSTEM,
    PROMPT_VERSION,
)

_BANNED_WORDS = ("nul", "échec", "echec", "grosse lacune")
_SAFE_FEEDBACK = "C'est une notion à renforcer — tu progresses, on continue ensemble à la prochaine étape."

# Garde-fou taille : une dictée ELI5 est courte (< ~30 s). 25 Mo couvre largement
# WebM/Opus et évite de charger un gros fichier en mémoire.
_MAX_AUDIO_BYTES = 25 * 1024 * 1024


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
) -> AIJob:
    """Exécute un appel IA en SYNCHRONE et trace toujours un `ai_jobs` (input/output/statut/durée).

    Renvoie le job (status `succeeded`, `output_json` peuplé) pour que l'appelant puisse
    exposer `job_id`/`status` (contrat API_SPEC) ou relire la sortie via `job.output_json`.
    """
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
    return job


def explain(
    db: Session,
    provider: LLMProvider,
    embedder: EmbeddingProvider,
    req: ELI5ExplainRequest,
) -> dict:
    """ELI5 v2 — ZETIS explique, premier CLIENT du substrat canonique (ADR-0011).

    Résout le contexte via `resolve_canonical_context` (cours validé d'abord, RAG en
    complément) au lieu d'une récupération plate, et insère le bloc à deux sections dans
    le prompt. La tâche « expliquer simplement » ne change pas.
    """
    get_default_student(db)
    skill, subject = _skill_and_subject(db, req.skill_id)

    ctx = resolve_canonical_context(
        db, embedder, skill_id=req.skill_id, query=req.question or ""
    )
    prompt = ELI5_EXPLAIN_PROMPT_V2.format(
        level=skill.level or "4e",
        subject=subject.name,
        skill=skill.name,
        question=req.question or "(pas de question précise)",
        context_block=build_canonical_sections(ctx),
    )
    job = _run_traced(
        db,
        job_type="eli5_explain",
        input_payload={
            "skill_id": skill.id,
            "mode": req.mode,
            "prompt_version": ELI5_EXPLAIN_PROMPT_VERSION,
        },
        provider=provider,
        request=LLMRequest(prompt=prompt, system=ELI5_SYSTEM, json_output=True),
    )
    # Normalise l'explication et la range dans la trace : récupérable via GET /ai/jobs/{job_id}.
    # `sources_used` = nombre de passages RAG injectés ; `lesson_id`/`lesson_title` (nullables)
    # renseignés quand un cours canonique a servi → le badge Massimo passe de « D'après ton
    # cours » à « D'après ta leçon … » (ADR-0011 §3). Contrat rétro-compatible.
    parsed = job.output_json or {}
    output: dict = {
        "title": str(parsed.get("title") or f"Comprendre {skill.name}"),
        "simple_explanation": str(parsed.get("simple_explanation") or ""),
        "analogy": str(parsed.get("analogy") or ""),
        "example": str(parsed.get("example") or ""),
        "common_mistake": str(parsed.get("common_mistake") or ""),
        "check_question": str(parsed.get("check_question") or ""),
        "next_action": str(parsed.get("next_action") or "reverse_explain"),
        "sources_used": len(ctx.chunks),
    }
    if ctx.lesson is not None:
        output["lesson_id"] = ctx.lesson.id
        output["lesson_title"] = ctx.lesson.title
    job.output_json = output
    # Journal d'activité : posé APRÈS la génération réussie — le journal enregistre les
    # explications effectivement délivrées à Massimo, pas les tentatives avortées (un échec LLM
    # remonte en erreur et n'a pas sa place dans une heatmap de travail).
    log_learning_event(
        db,
        student_id=get_default_student(db).id,
        event_type=EVENT_ELI5_REQUESTED,
        subject_id=subject.id,
        skill_id=skill.id,
        payload={"skill_id": skill.id},
    )
    db.commit()
    # Contrat API_SPEC : l'endpoint renvoie la référence du job (exécution synchrone → déjà `succeeded`).
    return {"job_id": job.id, "status": job.status}


def transcribe(db: Session, stt: SttProvider, file: UploadFile) -> dict:
    """Dictée ELI5 (ADR-0012) — Massimo parle, Whisper LOCAL transcrit.

    « Soit il écrit, soit il parle » : le texte renvoyé alimente le même textarea puis
    part en reverse-evaluate (input_mode text). 100 % local, zéro tiers (vie privée).
    Tracé dans `ai_jobs` comme toute tâche IA ; l'audio brut n'est pas conservé.
    """
    raw = file.file.read()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Audio vide.")
    if len(raw) > _MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Dictée trop longue.",
        )

    now = datetime.now(timezone.utc)
    job = AIJob(
        job_type="eli5_transcribe",
        status="running",
        input_json={"content_type": file.content_type, "bytes": len(raw)},
        created_by="child",
        created_at=now,
        started_at=now,
    )
    db.add(job)
    db.flush()

    try:
        result = stt.transcribe(SttRequest(audio=raw, mime=file.content_type))
    except SttUnavailable as exc:
        job.status = "failed"
        job.error_message = str(exc)[:1000]
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        # Dégradation propre : le frontend masque le micro sur 503 (jamais de bascule tierce).
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Dictée indisponible : {exc}",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        job.status = "failed"
        job.error_message = str(exc)[:1000]
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Transcription échouée : {exc}"
        ) from exc

    transcript = result.text.strip()
    job.status = "succeeded"
    job.output_json = {"transcript": transcript, "duration_seconds": result.duration_seconds}
    job.duration_ms = int(result.duration_seconds * 1000)
    job.finished_at = datetime.now(timezone.utc)
    db.commit()
    return {"transcript": transcript, "duration_seconds": result.duration_seconds}


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
    job = _run_traced(
        db,
        job_type="eli5_reverse",
        input_payload={"skill_id": skill.id, "prompt_version": PROMPT_VERSION},
        provider=provider,
        request=LLMRequest(prompt=prompt, system=ELI5_SYSTEM, json_output=True),
    )
    parsed = job.output_json or {}

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
            # `xp` ajouté (clé ADDITIVE, aucun lecteur existant ne s'en trouve modifié) : le
            # journal d'activité affiche l'XP de chaque ligne depuis son propre payload, sans
            # jamais croiser `xp_events`. Sans lui, une verbalisation s'afficherait à 0 XP.
            payload_json={"score": score, "interval_days": interval, "xp": XP_ELI5_REVERSE},
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
    record_mastery_transition(db, mastery, _mastery_status(score), now)

    # Une carte de révision (intervalle fixe selon le score).
    schedule_review(
        db,
        student_id=student.id,
        skill_id=skill.id,
        interval=interval,
        front=f"Réexplique : {skill.name}",
        back=req.answer_text,
    )

    # XP de verbalisation (gamification) — récompense l'effort d'explication.
    award_xp(
        db, student_id=student.id, subject_id=subject.id, amount=XP_ELI5_REVERSE, reason="eli5_reverse"
    )

    db.commit()
    return {"score": score, "feedback": feedback, "missing_points": missing, "next_action": next_action}
