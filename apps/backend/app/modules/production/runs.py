"""Création et lecture d'un lot de production (ADR-0031 §3-§5).

Séparé de `coverage.py`, qui reste **strictement en lecture seule** : l'invariant de l'ADR-0023
(« la Couverture ne génère, ne valide, n'écrit jamais rien ») ne doit pas s'éroder au prétexte
qu'on ajoute de l'écriture au module.
"""

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Chapter, Fiche, Mindmap, ProductionRun, StudentProfile
from app.db.models.production import EMITTED_AUTHORIZED_BY, EMITTED_TRIGGERS

# Les dérivés qui attendent une relecture de Papa — et ils ne sont que DEUX.
#
# `Quiz` n'en est pas : il n'a même pas de `validation_status`. Il est servi sans relecture **par
# doctrine** (ADR-0014 §2, provenance `system`), donc il n'est jamais en attente et ne peut pas
# grossir un arriéré. Le compter aurait fait déborder le plafond avec du contenu que personne
# n'a jamais eu à relire.
#
# `Lesson` non plus : un cours en brouillon n'est pas un arriéré de relecture, c'est une passe 1
# qui attend sa passe 2 (addendum ADR-0031). Son gate est le §7 lui-même.
_PENDING_TABLES = (Fiche, Mindmap)


def pending_backlog(db: Session) -> int:
    """Nombre de dérivés en attente de validation — la mesure du régulateur du palier 2."""
    total = 0
    for model in _PENDING_TABLES:
        total += db.scalar(
            select(func.count(model.id)).where(model.validation_status == "pending")
        ) or 0
    return total


def create_run(db: Session, *, chapter_id: int) -> ProductionRun:
    """Crée un lot `manual`/`parent_direct` sur un chapitre. Refuse si l'arriéré déborde.

    Le régulateur REFUSE et le DIT — il ne tronque pas silencieusement. Une production qui dépasse
    durablement la capacité de relecture fabrique une dette qui tue le dispositif (ADR-0023 §5).
    """
    chapter = db.get(Chapter, chapter_id)
    if chapter is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Chapitre introuvable.")

    backlog = pending_backlog(db)
    if backlog >= settings.production_max_pending:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=(
                f"{backlog} contenus attendent déjà votre relecture "
                f"(plafond : {settings.production_max_pending}). "
                "Validez-en une partie avant de lancer une nouvelle production."
            ),
        )

    student = db.scalar(select(StudentProfile).order_by(StudentProfile.id))
    if student is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Aucun profil élève.")

    run = ProductionRun(
        student_id=student.id,
        # v1 : le seul déclencheur et la seule autorité émis (ADR-0031 §4, test-verrou).
        trigger=EMITTED_TRIGGERS[0],
        authorized_by=EMITTED_AUTHORIZED_BY[0],
        status="queued",
        chapter_id=chapter_id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def run_out(db: Session, run: ProductionRun) -> dict:
    """Vue d'un run pour le suivi Papa. Aucun contenu, aucun verbatim — un état."""
    return {
        "id": run.id,
        "status": run.status,
        "trigger": run.trigger,
        "authorized_by": run.authorized_by,
        "chapter_id": run.chapter_id,
        "created_at": run.created_at,
        "finished_at": run.finished_at,
    }


def get_run(db: Session, run_id: int) -> ProductionRun:
    run = db.get(ProductionRun, run_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Lot introuvable.")
    return run
