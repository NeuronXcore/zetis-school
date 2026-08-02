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
from app.db.models import Chapter, Fiche, Mindmap, ProductionRun, Skill, StudentProfile
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
        "total_notions": run.total_notions,
        "done_notions": run.done_notions,
        # Pourcentage RÉEL, calculé serveur. L'estimation client (`KIT_MS_PER_NOTION`) mentait
        # d'un facteur 2 — mesuré le 2026-08-02 : 69 s par notion contre 150 s estimées. Une barre
        # qui progresse au vrai rythme vaut mieux qu'une barre qui devine.
        "progress_pct": (
            round(100 * (run.done_notions or 0) / run.total_notions)
            if run.total_notions
            else (100 if run.status == "done" else 0)
        ),
        "created_at": run.created_at,
        "finished_at": run.finished_at,
    }


def get_run(db: Session, run_id: int) -> ProductionRun:
    run = db.get(ProductionRun, run_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Lot introuvable.")
    return run


def preview(db: Session, *, chapter_id: int) -> dict:
    """Ce qu'un lot ferait sur ce chapitre, SANS rien créer (ADR-0031 slice C).

    Le gate doit être visible **avant** le clic. Sans cet aperçu, Papa presse un bouton et reçoit
    « rien produit » sur un chapitre neuf : il lirait un échec là où il y a un gate qui fonctionne.

    Lecture pure — `scope.plan` + `runner.select_notions`, déjà écrits et testés. Rien n'est
    réimplémenté ici, et surtout aucun run n'est créé.
    """
    from app.modules.production import runner, scope

    chapter = db.get(Chapter, chapter_id)
    if chapter is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Chapitre introuvable.")

    eligible_ids, blocked = runner.select_notions(db, scope.plan(db, chapter_id=chapter_id))

    # Le NOM en plus de l'id : une liste d'ids ne se lit pas.
    names = dict(
        db.execute(
            select(Skill.id, Skill.name).where(
                Skill.id.in_(eligible_ids + [b["skill_id"] for b in blocked])
            )
        ).all()
    )
    backlog = pending_backlog(db)
    return {
        "chapter_id": chapter_id,
        "eligible": [{"skill_id": i, "name": names.get(i, f"notion {i}")} for i in eligible_ids],
        "blocked": [
            {"skill_id": b["skill_id"], "name": names.get(b["skill_id"], ""), "reason": b["reason"]}
            for b in blocked
        ],
        # Pour que le bouton puisse dire POURQUOI il refuse, avant d'essayer.
        "pending_backlog": backlog,
        "max_pending": settings.production_max_pending,
    }


def active_run(db: Session) -> ProductionRun | None:
    """Le lot en cours, s'il y en a un. `None` sinon.

    ⚠️ Rend un **processus**, jamais un **stock**. L'indicateur qui le consomme ne doit à aucun
    moment devenir un compteur d'arriéré : « 12 contenus non contrôlés » affiché en permanence est
    exactement ce que l'addendum ADR-0011 §F.2 interdit — la provenance est un fait, jamais un
    reproche, et elle ne se totalise pas. Ici on dit « ça travaille », pas « vous êtes en retard ».
    """
    return db.scalar(
        select(ProductionRun)
        .where(ProductionRun.status.in_(("queued", "running")))
        .order_by(ProductionRun.id.desc())
        .limit(1)
    )
