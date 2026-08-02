"""Exécution d'un lot de production (ADR-0031 §3, addendum « le gate vit dans la sélection »).

Ce module est ce que le worker exécute. Il ne génère rien lui-même : il **sélectionne**, appelle
`equipment.equip_notion` notion par notion, et tient le journal.

Trois règles, et ce sont trois refus :

1. **Le gate du §7 est une SÉLECTION.** On n'équipe que les notions dont la leçon est déjà
   `validated` ET porte un contenu. Les autres sont rendues **bloquées avec leur motif**, jamais
   omises en silence. `equip_notion` n'est pas modifié : ses deux chemins d'auto-validation du
   cours deviennent simplement inatteignables depuis un lot.
2. **« Massimo passe devant » se décide ENTRE deux notions.** Un appel LLM en cours n'est pas
   préemptible — prétendre l'interrompre serait un mensonge d'architecture. Le grain de la
   préemption est la notion.
3. **L'ordre suit la priorité d'évidence.** C'est ce qui rend un lot interrompu à 60 % utile : les
   60 % faits sont les notions les plus fragiles. La dégradation n'est pas un ajout, c'est l'ordre.
"""

import logging
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import (
    Fiche,
    LearningEvent,
    Lesson,
    LessonSkill,
    Mindmap,
    ProductionRun,
    Quiz,
    SpacedReviewCard,
)
from app.modules.activity.events import NON_ACTIVITY_EVENTS
from app.modules.ai.provider import EmbeddingProvider, LLMProvider

logger = logging.getLogger(__name__)

# Les tables que l'équipement écrit. Sert au tamponnage `production_run_id` par filigrane d'id :
# tout ce qui naît pendant l'équipement d'une notion appartient à ce run. C'est exact, et ça évite
# de toucher `equip_notion` — que l'addendum interdit de modifier.
_PRODUCED = (Lesson, Fiche, Mindmap, Quiz, SpacedReviewCard)

BLOCKED_NO_LESSON = "Aucune leçon rattachée à cette notion."
BLOCKED_COURSE_PENDING = "Cours à valider — ZETIS ne valide pas les cours à votre place."


def _max_ids(db: Session) -> dict[str, int]:
    """Filigrane : le dernier id de chaque table produite, avant d'équiper."""
    return {
        model.__tablename__: (db.scalar(select(func.max(model.id))) or 0) for model in _PRODUCED
    }


def _stamp(db: Session, watermark: dict[str, int], run_id: int) -> int:
    """Attribue au run tout ce qui est né depuis le filigrane. Renvoie le nombre de pièces."""
    stamped = 0
    for model in _PRODUCED:
        rows = db.scalars(
            select(model).where(model.id > watermark[model.__tablename__])
        ).all()
        for row in rows:
            row.production_run_id = run_id
            stamped += 1
    return stamped


def massimo_is_active(db: Session, *, student_id: int) -> bool:
    """Massimo a-t-il une activité PÉDAGOGIQUE récente ?

    `NON_ACTIVITY_EVENTS` est exclu : cocher une case d'agenda n'est pas une session de travail
    (ADR-0025 §3). Sans cette exclusion, un geste déclaratif suffirait à suspendre une production.
    """
    since = datetime.now(timezone.utc) - timedelta(
        minutes=settings.production_pause_if_active_minutes
    )
    return bool(
        db.scalar(
            select(LearningEvent.id)
            .where(
                LearningEvent.student_id == student_id,
                LearningEvent.created_at >= since,
                LearningEvent.event_type.not_in(tuple(NON_ACTIVITY_EVENTS)),
            )
            .limit(1)
        )
    )


def _wait_for_massimo(db: Session, *, student_id: int) -> None:
    """Attend que Massimo ait fini, dans une borne. Appelé ENTRE deux notions, jamais pendant.

    Bornée : sans ça, une longue session laisserait un run « running » indéfiniment. Passé le
    plafond, le lot reprend — on préfère un lot qui finit à un lot qui attend pour toujours.
    """
    deadline = time.monotonic() + settings.production_max_wait_minutes * 60
    while massimo_is_active(db, student_id=student_id):
        if time.monotonic() >= deadline:
            logger.info("production: attente de Massimo bornée atteinte, le lot reprend")
            return
        time.sleep(20)
        db.expire_all()  # sans ça, la session relirait son cache et n'verrait jamais la fin


def select_notions(db: Session, skill_ids: list[int]) -> tuple[list[int], list[dict]]:
    """LE GATE DU §7 (addendum ADR-0031). Sépare ce qui est équipable de ce qui est bloqué.

    Équipable = la notion a une leçon `validated` AVEC contenu. Tout le reste est **rendu**, avec
    son motif : une notion silencieusement omise se lirait comme un échec de production, alors que
    c'est un gate qui fonctionne.
    """
    eligible: list[int] = []
    blocked: list[dict] = []
    for skill_id in skill_ids:
        lesson = db.scalar(
            select(Lesson)
            .join(LessonSkill, LessonSkill.lesson_id == Lesson.id)
            .where(LessonSkill.skill_id == skill_id, Lesson.status != "archived")
            .order_by(Lesson.id.desc())
            .limit(1)
        )
        if lesson is None:
            blocked.append({"skill_id": skill_id, "reason": BLOCKED_NO_LESSON})
        elif not (lesson.status == "validated" and lesson.content_markdown):
            blocked.append({"skill_id": skill_id, "reason": BLOCKED_COURSE_PENDING})
        else:
            eligible.append(skill_id)
    return eligible, blocked


def execute(
    db: Session, *, run_id: int, llm: LLMProvider, embedder: EmbeddingProvider
) -> dict:
    """Exécute un lot : sélection, équipement notion par notion, journal tenu à jour."""
    from app.modules.production import equipment, scope

    run = db.get(ProductionRun, run_id)
    if run is None:
        raise ValueError(f"production_run {run_id} introuvable")

    run.status = "running"
    db.commit()

    notions = scope.plan(db, chapter_id=run.chapter_id)
    eligible, blocked = select_notions(db, notions)
    results: list[dict] = []

    try:
        for skill_id in eligible:
            # Entre deux notions — le grain de la préemption (ADR-0031 §3).
            _wait_for_massimo(db, student_id=run.student_id)

            watermark = _max_ids(db)
            result = equipment.equip_notion(
                db, skill_id=skill_id, llm=llm, embedder=embedder
            )
            result["pieces_stamped"] = _stamp(db, watermark, run_id)
            db.commit()
            results.append(result)
        run.status = "done"
    except Exception:  # noqa: BLE001 — un lot qui échoue doit le DIRE, pas disparaître
        logger.exception("production: lot %s interrompu", run_id)
        run.status = "failed"
        raise
    finally:
        run.finished_at = datetime.now(timezone.utc)
        db.commit()

    return {"run_id": run_id, "equipped": results, "blocked": blocked}
