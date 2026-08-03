"""Le déclencheur automatique (ADR-0035) — ZETIS regarde, puis décide de travailler.

## Ce que ce module RÉPOND à l'objection qu'il révoque

`production_worker.py` portait `with_scheduler=False` **avec son motif** :

> « le déclenchement reste ÉVÉNEMENTIEL. Aucun cron, aucune tâche périodique — un scheduler ici
> ouvrirait la porte à *"tous les dimanches, produire quelque chose"*, qui n'a pas de sens
> pédagogique. »

**L'objection est maintenue, et satisfaite — pas contournée.** ZETIS ne produit **jamais** parce
que c'est dimanche. Il produit parce qu'un humain a écrit qu'il y avait un contrôle jeudi. Le
réveil périodique **REGARDE** ; il ne décide pas. C'est toute la différence, et elle tient dans
la séparation stricte de ce fichier et de `jobs.run_production`.

## Séparer le scan de l'exécution est un INVARIANT

Un scan qui produirait tiendrait un `AccessShareLock` pendant une heure — le défaut exact observé
le 2026-08-02, réparé par le `db.rollback()` de `massimo_is_active`. Le scan doit être **court, en
lecture**, et refermer sa transaction. Il **crée des runs** ; l'exécution reste le job existant.
"""

import logging
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import AgendaItem, StudentProfile
from app.modules.production import runner, runs

logger = logging.getLogger(__name__)

# ⚠️ `controle` SEUL déclenche. Un `devoir` reviendrait tous les jours et noierait le régulateur ;
# `rendu` reste légal et non émis, comme le vocabulaire de `trigger` lui-même.
TRIGGERING_KINDS = ("controle",)

# Les motifs de non-déclenchement, nommés. Un scan qui ne fait rien SANS DIRE POURQUOI est
# indistinguable d'un scan en panne — et il tourne la nuit, quand personne ne regarde.
SKIP_DISABLED = "Le déclenchement automatique est désarmé."
SKIP_NO_STUDENT = "Aucun profil élève."
SKIP_MASSIMO_ACTIVE = "Massimo travaille — un lot que personne n'a demandé ne lui dispute pas Ollama."
SKIP_NO_CHAPTER = "Échéance sans chapitre rattaché — rien à produire."
SKIP_ALREADY = "Un lot référence déjà cette échéance."


def eligible_items(db: Session, *, student_id: int, today: date | None = None) -> list[AgendaItem]:
    """Les échéances qui MÉRITENT un lot — les cinq conditions de l'ADR-0035 §1, sauf l'idempotence.

    L'idempotence est volontairement hors d'ici : elle se lit dans `production_runs`
    (`runs.run_exists_for`), pas dans l'agenda, qui est **co-édité par Massimo**.

    ⚠️ `chapter_id` est **nullable et rempli par un geste de Papa** (ADR-0025 §11, « posée dès
    maintenant, exploitée au Lot 3 »). Un contrôle sans chapitre ne déclenchera rien — c'est un
    fait produit, pas un bug, et la page Agenda devra le dire.
    """
    today = today or datetime.now(timezone.utc).date()
    horizon = today + timedelta(days=settings.production_auto_lookahead_days)
    return list(
        db.scalars(
            select(AgendaItem)
            .where(
                AgendaItem.student_id == student_id,
                AgendaItem.kind.in_(TRIGGERING_KINDS),
                AgendaItem.chapter_id.is_not(None),
                AgendaItem.dismissed_at.is_(None),
                AgendaItem.due_on >= today,
                AgendaItem.due_on <= horizon,
            )
            # La plus proche d'abord : si le régulateur ne laisse passer qu'un lot, autant que ce
            # soit celui du contrôle le plus urgent.
            .order_by(AgendaItem.due_on, AgendaItem.id)
        ).all()
    )


def scan_agenda(db: Session) -> dict:
    """Regarde l'agenda et crée les lots qui manquent. **Ne produit rien lui-même.**

    Renvoie un compte rendu — jamais une exception. Un scan qui remonterait son échec ferait
    tomber le job périodique et arrêterait tout le dispositif pour un contrôle mal saisi.
    """
    report: dict = {"created": [], "skipped": []}

    from app.modules.settings import service as settings_service

    if not settings_service.auto_trigger_enabled(db):
        report["skipped"].append({"item_id": None, "reason": SKIP_DISABLED})
        return report

    student = db.scalar(select(StudentProfile).order_by(StudentProfile.id))
    if student is None:
        report["skipped"].append({"item_id": None, "reason": SKIP_NO_STUDENT})
        return report

    # ⚠️ Évalué À LA CRÉATION, pas seulement entre deux notions (ADR-0035 §7). La préemption
    # existante rend la main en cours de route, ce qui suffisait pour un lot que Papa venait de
    # demander en connaissance de cause. Un lot que PERSONNE n'a demandé ne doit pas disputer
    # Ollama à la session de Massimo, fût-ce une notion.
    if runner.massimo_is_active(db, student_id=student.id):
        report["skipped"].append({"item_id": None, "reason": SKIP_MASSIMO_ACTIVE})
        return report

    for item in eligible_items(db, student_id=student.id):
        if runs.run_exists_for(db, trigger="agenda", reference_id=item.id):
            report["skipped"].append({"item_id": item.id, "reason": SKIP_ALREADY})
            continue
        try:
            run = runs.create_run(
                db,
                chapter_id=item.chapter_id,
                trigger="agenda",
                # ⚠️ LA première émission de `parent_rule` : aucun humain n'a ouvert la pièce ni
                # cliqué pour ce lot. `authority_for` fait déjà le reste — aucune ligne du runner
                # ne bouge.
                authorized_by="parent_rule",
                reference_id=item.id,
            )
        except HTTPException as exc:
            # ⚠️ `create_run` lève des `HTTPException` — juste dans une requête, absurde dans un
            # job RQ : le code de statut ne part vers personne. On le traduit en motif lisible,
            # et le lot REFUSÉ NE CONSOMME PAS LA RÉFÉRENCE : l'item redeviendra éligible au
            # réveil suivant. Un refus n'est pas une production.
            report["skipped"].append({"item_id": item.id, "reason": str(exc.detail)})
            logger.info("production: échéance %s non déclenchée — %s", item.id, exc.detail)
            continue
        report["created"].append({"item_id": item.id, "run_id": run.id})
        logger.info("production: lot %s déclenché par l'échéance %s", run.id, item.id)

    return report
