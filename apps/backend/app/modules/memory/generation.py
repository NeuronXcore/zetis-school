"""Génération et cycle de vie des cartes de révision (SRS) — ADR-0013.

Le contenu d'une carte dérive du COURS VALIDÉ de la leçon (substrat canonique, ADR-0011).
Déclencheur : la VALIDATION d'une leçon (draft → validated) rafraîchit les cartes de ses
notions ; un endpoint manuel Papa sert de secours / régénération à la demande.

Invariant central (ADR-0013 §3) : rafraîchir le CONTENU d'une carte ne touche JAMAIS sa
PLANIFICATION. Clé métier `(student_id, skill_id, card_type)`. Trois branches à l'upsert :

  A · notion toujours couverte  → update recto/verso seuls ; due_at/interval/ease INTACTS.
  B · notion nouvellement couverte → création (interval 0, due maintenant, active).
  C · notion quittée par TOUT cours validé → carte SUSPENDUE (hors session) mais ligne
      conservée avec sa planification ; RÉACTIVÉE en place si un cours revient la couvrir.

On ne supprime JAMAIS une ligne `SpacedReviewCard` (jeter l'historique = régression §Alt).
Cas dégradé (génération manuelle sans cours validé) : cartes `pending`, filtrées serveur,
activées quand un cours validé les régénère (ADR-0013 §4). 100 % local (ADR-0008).
"""

import json
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    AIJob,
    Lesson,
    LessonSkill,
    Skill,
    SpacedReviewCard,
    StudentProfile,
    Subject,
)
from app.modules.ai.canonical_context import (
    build_canonical_sections,
    resolve_canonical_context,
)
from app.modules.ai.provider import EmbeddingProvider, LLMProvider, LLMRequest
from app.prompts.srs_cards import (
    SRS_CARDS_PROMPT_V1,
    SRS_CARDS_PROMPT_VERSION,
    SRS_CARDS_SCHEMA,
    SRS_CARDS_SYSTEM,
)

MAX_CARDS_PER_SKILL = 3
MAX_SKILLS_PER_RUN = 12
ALLOWED_CARD_TYPES = ("definition", "method", "example", "error_correction")

# Cycle de vie du `status` (ADR-0013). `scheduled` = active (révisable) ; `pending` = cas
# dégradé (généré sans cours validé) ; `suspended` = orpheline (planification conservée).
STATUS_ACTIVE = "scheduled"
STATUS_PENDING = "pending"
STATUS_SUSPENDED = "suspended"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _run_traced(
    db: Session,
    *,
    job_type: str,
    input_payload: dict,
    provider: LLMProvider,
    request: LLMRequest,
) -> dict:
    """Appel IA synchrone, toujours tracé dans `ai_jobs`. Renvoie l'objet JSON parsé."""
    now = _now()
    job = AIJob(
        job_type=job_type,
        status="running",
        input_json=input_payload,
        created_by="parent",
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
        job.finished_at = _now()
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Génération IA échouée : {exc}"
        ) from exc
    job.status = "succeeded"
    job.output_json = parsed
    job.duration_ms = response.duration_ms
    job.finished_at = _now()
    return parsed


def _lesson_or_404(db: Session, lesson_id: int) -> Lesson:
    lesson = db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leçon introuvable.")
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


def _active_students(db: Session) -> list[StudentProfile]:
    """Tous les profils élèves (le mécanisme ne présume pas le mono-élève, ADR-0013 §1)."""
    return list(db.scalars(select(StudentProfile).order_by(StudentProfile.id)))


def _llm_cards(
    db: Session,
    provider: LLMProvider,
    embedder: EmbeddingProvider,
    *,
    skill: Skill,
    lesson_id: int,
) -> tuple[list[dict], bool]:
    """1-3 cartes d'une notion, ancrées sur son cours canonique. → (specs dédupliqués, has_course)."""
    subject = db.get(Subject, skill.subject_id)
    ctx = resolve_canonical_context(db, embedder, skill_id=skill.id)
    prompt = SRS_CARDS_PROMPT_V1.format(
        level=skill.level or "4e",
        subject=subject.name if subject else "cette matière",
        skill=skill.name,
        context_block=build_canonical_sections(ctx),
    )
    parsed = _run_traced(
        db,
        job_type="srs_cards_generate",
        input_payload={
            "lesson_id": lesson_id,
            "lesson_title": ctx.lesson.title if ctx.lesson else None,
            "skill_id": skill.id,
            "prompt_version": SRS_CARDS_PROMPT_VERSION,
            "has_course": ctx.has_course,
        },
        provider=provider,
        request=LLMRequest(system=SRS_CARDS_SYSTEM, prompt=prompt, fmt=SRS_CARDS_SCHEMA),
    )
    raw = parsed.get("cards")
    specs: list[dict] = []
    seen_types: set[str] = set()
    if isinstance(raw, list):
        for item in raw:
            if len(specs) >= MAX_CARDS_PER_SKILL or not isinstance(item, dict):
                continue
            front = str(item.get("front_markdown") or "").strip()
            back = str(item.get("back_markdown") or "").strip()
            if not front or not back:
                continue
            card_type = item.get("card_type")
            if card_type not in ALLOWED_CARD_TYPES:
                card_type = "definition"
            # Clé (student, skill, card_type) unique : on ne garde qu'une carte par type.
            if card_type in seen_types:
                continue
            seen_types.add(card_type)
            specs.append({"card_type": card_type, "front": front, "back": back})
    return specs, ctx.has_course


def refresh_cards_for_lesson(
    db: Session,
    provider: LLMProvider,
    embedder: EmbeddingProvider,
    *,
    lesson_id: int,
) -> dict:
    """Génère/rafraîchit les cartes des notions d'une leçon (upsert 3 branches, ADR-0013 §3)."""
    _lesson_or_404(db, lesson_id)
    students = _active_students(db)
    result = {"created": 0, "updated": 0, "reactivated": 0, "pending": 0}
    now = _now()

    for skill in _lesson_skills(db, lesson_id)[:MAX_SKILLS_PER_RUN]:
        specs, has_course = _llm_cards(db, provider, embedder, skill=skill, lesson_id=lesson_id)
        if not specs:
            continue
        target = STATUS_ACTIVE if has_course else STATUS_PENDING
        for student in students:
            for spec in specs:
                existing = db.scalar(
                    select(SpacedReviewCard).where(
                        SpacedReviewCard.student_id == student.id,
                        SpacedReviewCard.skill_id == skill.id,
                        SpacedReviewCard.card_type == spec["card_type"],
                    )
                )
                if existing is None:
                    # Branche B — notion nouvellement couverte (ou cas dégradé → pending).
                    db.add(
                        SpacedReviewCard(
                            student_id=student.id,
                            skill_id=skill.id,
                            front_markdown=spec["front"],
                            back_markdown=spec["back"],
                            card_type=spec["card_type"],
                            interval_days=0,
                            ease_factor=2.5,
                            due_at=now if target == STATUS_ACTIVE else None,
                            status=target,
                        )
                    )
                    result["created" if target == STATUS_ACTIVE else "pending"] += 1
                    continue
                # Branche A — la carte existe : on réécrit le CONTENU, jamais la planification.
                existing.front_markdown = spec["front"]
                existing.back_markdown = spec["back"]
                if has_course and existing.status in (STATUS_PENDING, STATUS_SUSPENDED):
                    # Réactivation en place : une carte suspendue garde son due_at/intervalle
                    # (planification acquise) ; une carte `pending` n'en avait pas → due now.
                    existing.status = STATUS_ACTIVE
                    if existing.due_at is None:
                        existing.due_at = now
                        existing.interval_days = 0
                    result["reactivated"] += 1
                else:
                    result["updated"] += 1

    db.commit()
    return result


def reconcile_orphans(db: Session, embedder: EmbeddingProvider, *, skill_ids: list[int]) -> int:
    """Branche C : suspend les cartes actives des notions que PLUS AUCUN cours validé ne couvre.

    La condition n'est pas « absente d'une leçon » (LessonSkill est N-N) mais « aucune leçon
    validée ne couvre la skill » — c'est le résolveur ADR-0011 qui répond. Planification
    conservée, jamais de suppression : la carte est réactivable en place plus tard.
    """
    suspended = 0
    for skill_id in dict.fromkeys(skill_ids):  # dédup, ordre stable
        ctx = resolve_canonical_context(db, embedder, skill_id=skill_id)
        if ctx.has_course:
            continue  # toujours couverte → pas orpheline
        cards = db.scalars(
            select(SpacedReviewCard).where(
                SpacedReviewCard.skill_id == skill_id,
                SpacedReviewCard.status == STATUS_ACTIVE,
            )
        ).all()
        for card in cards:
            card.status = STATUS_SUSPENDED  # due_at / interval_days INTACTS
            suspended += 1
    db.commit()
    return suspended


def run_lesson_card_generation(lesson_id: int) -> dict:
    """Point d'entrée du worker (async) : ouvre sa propre session + providers locaux.

    Enfilé par `enqueue_generate_cards` à la validation d'une leçon. Isolé de FastAPI pour
    être appelable par `worker-ai` (par nom de tâche, sans import croisé côté worker)."""
    from app.db.base import SessionLocal
    from app.modules.ai import get_embedder, get_provider

    db = SessionLocal()
    try:
        return refresh_cards_for_lesson(db, get_provider(), get_embedder(), lesson_id=lesson_id)
    finally:
        db.close()
