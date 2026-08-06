"""L'activité de production — ce qui attend, ce qui tourne, ce qui a échoué (ADR-0041 §2).

**Une lecture, deux modèles.** `ProductionRun` reste le lot pédagogique (paliers gravés, gate,
journal, progression réelle) ; `AIJob` est le travail unitaire de file. On ne les fusionne pas —
on les NORMALISE ici, pour que la barre du header et les barres de page lisent la même chose.
Patron ADR-0011 §1 : un service à plusieurs consommateurs ne vit pas chez l'un d'eux.

## Les deux règles que ce module porte, et qui ne se négocient pas

🔴 **`pct = None`, JAMAIS `0`.** `runs.run_out()` émet déjà `progress_pct: 0` sur un lot en file
(`else (100 if status == "done" else 0)`), et c'est `useRunProgress` qui rattrapait côté client.
Cet endpoint étant la source unique, réutiliser ce `0` déplacerait le mensonge vers le serveur,
là où plus personne ne le rattrape. Zéro n'est pas une valeur basse, c'est une absence de mesure.

🔴 **`pct_is_measured` distingue deux régimes de vérité** (§6). Un lot de 31 notions sait dire
« 7 sur 31 ». Un appel LLM n'a **aucun grain interne** : il n'y a rien à sonder pendant les 32 s
d'une fiche. Les rendre identiques uniformiserait un mensonge — l'écran écrit `7 / 31 · 23 %`
dans un cas, `≈ 40 %` dans l'autre.

⚠️ **L'origine est DÉRIVÉE, jamais stockée** (§3.2) : un lot porte son `trigger` depuis
l'ADR-0031 ; un travail hors lot est manuel **par construction**, puisque les deux scans
automatiques passent tous deux par `create_run`.

⚠️ Les `AIJob` créés en TRACE par les cinq générateurs (`_run_traced`, `flush()` sans commit) ne
peuvent pas apparaître ici : hors de leur transaction, ils n'existent qu'une fois `succeeded`.
Aucun filtre à écrire — c'est le statut qui les exclut.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AIJob, Skill
from app.db.models.school import Chapter
from app.db.models.production import ProductionRun
from app.modules.production import journal, runs

# Ce qui « se passe maintenant ». `stale` n'en fait pas partie : c'est une lecture dérivée de
# `running` (`journal.run_status`), pas une valeur stockée.
ACTIF = ("queued", "running")

# Le mot que Papa lit, par type de travail. Un `job_type` inconnu se rend par son propre nom :
# un mot technique vaut mieux qu'une barre anonyme.
LIBELLE_JOB = {"equip_notion": "Équipement"}

# Le mot que Papa lit, par pièce d'un lot-pièce.
LIBELLE_PIECE = {
    "cours": "Cours",
    "fiche": "Fiche",
    "srs": "Cartes de révision",
    "quiz": "Quiz",
    "mindmap": "Carte mentale",
}


def _noms_de_notions(db: Session, ids: list[int]) -> dict[int, str]:
    if not ids:
        return {}
    return dict(db.execute(select(Skill.id, Skill.name).where(Skill.id.in_(ids))).all())


def _titres_de_chapitres(db: Session, ids: list[int]) -> dict[int, str]:
    if not ids:
        return {}
    return dict(db.execute(select(Chapter.id, Chapter.title).where(Chapter.id.in_(ids))).all())


def _lot(run: ProductionRun, notions: dict[int, str], chapitres: dict[int, str]) -> dict:
    statut = journal.run_status(run)
    # Mesuré seulement quand le serveur a une vraie granularité. Un lot-PIÈCE n'a qu'une notion :
    # il vaudrait 0 % du début à la fin — c'est l'écran qui estime, ancré sur `started_at`.
    mesure = statut == "running" and (run.total_notions or 0) > 1
    if run.scope_skill_id is not None:
        libelle = (
            f"{LIBELLE_PIECE.get(run.scope_kind or '', run.scope_kind or 'Production')} · "
            f"{notions.get(run.scope_skill_id, f'notion {run.scope_skill_id}')}"
        )
    else:
        titre = chapitres.get(run.chapter_id or 0)
        libelle = f"Équipement · {titre}" if titre else "Équipement d'un chapitre"
    return {
        "kind": "run",
        "id": run.id,
        "label": libelle,
        "status": statut,
        "pct": (
            round(100 * (run.done_notions or 0) / run.total_notions) if mesure else None
        ),
        "pct_is_measured": mesure,
        "started_at": run.started_at,
        "trigger": run.trigger,
        "error": None,
    }


def _travail(job: AIJob, notions: dict[int, str]) -> dict:
    charge = job.input_json if isinstance(job.input_json, dict) else {}
    skill_id = charge.get("skill_id")
    nom = notions.get(skill_id) if isinstance(skill_id, int) else None
    tete = LIBELLE_JOB.get(job.job_type, job.job_type)
    return {
        "kind": "job",
        "id": job.id,
        "label": f"{tete} · {nom}" if nom else tete,
        "status": job.status,
        # Un appel LLM n'a aucun grain : l'écran estime, ancré sur `started_at`. Jamais 0.
        "pct": None,
        "pct_is_measured": False,
        "started_at": job.started_at,
        # Hors lot ⇒ manuel, par construction (§3.2).
        "trigger": "manual",
        "error": job.error_message,
    }


def _skill_ids_des_travaux(jobs: list[AIJob]) -> list[int]:
    out = []
    for job in jobs:
        charge = job.input_json if isinstance(job.input_json, dict) else {}
        if isinstance(charge.get("skill_id"), int):
            out.append(charge["skill_id"])
    return out


def read(db: Session, *, worker_alive: bool | None = None) -> dict:
    """L'activité complète, en un nombre CONSTANT de requêtes (jamais un N+1).

    `worker_alive` est passé par la route — ce module ne parle pas à Redis. `None` veut dire
    « la question n'a pas été posée », ce qui ne se confond pas avec `False` : le client teste
    `=== false`, jamais la falsité.
    """
    lots = list(
        db.scalars(
            select(ProductionRun)
            .where(ProductionRun.status.in_(ACTIF))
            .order_by(ProductionRun.id.desc())
        ).all()
    )
    travaux = list(
        db.scalars(
            select(AIJob).where(AIJob.status.in_(ACTIF)).order_by(AIJob.id.desc())
        ).all()
    )
    lots_echoues = list(
        db.scalars(
            select(ProductionRun)
            .where(ProductionRun.status == "failed", ProductionRun.acknowledged_at.is_(None))
            .order_by(ProductionRun.id.desc())
            .limit(20)
        ).all()
    )
    travaux_echoues = list(
        db.scalars(
            select(AIJob)
            .where(AIJob.status == "failed", AIJob.acknowledged_at.is_(None))
            .order_by(AIJob.id.desc())
            .limit(20)
        ).all()
    )

    notions = _noms_de_notions(
        db,
        [r.scope_skill_id for r in lots + lots_echoues if r.scope_skill_id]
        + _skill_ids_des_travaux(travaux + travaux_echoues),
    )
    chapitres = _titres_de_chapitres(
        db, [r.chapter_id for r in lots + lots_echoues if r.chapter_id]
    )

    actifs = [_lot(r, notions, chapitres) for r in lots] + [
        _travail(j, notions) for j in travaux
    ]
    # Ce qui TOURNE passe devant ce qui attend ; à égalité, le plus ancien démarré d'abord —
    # c'est l'ordre dans lequel la file sera servie.
    actifs.sort(key=lambda a: (a["status"] != "running", a["started_at"] or _loin()))

    echecs = [_lot(r, notions, chapitres) for r in lots_echoues] + [
        _travail(j, notions) for j in travaux_echoues
    ]
    for e, source in zip(echecs, list(lots_echoues) + list(travaux_echoues)):
        e["status"] = "failed"
        if e["error"] is None:
            e["error"] = _dernier_motif(db, source) if isinstance(source, ProductionRun) else None

    return {
        "current": actifs[0] if actifs else None,
        # Profondeur de file, jamais un arriéré (§7) : il retombe à zéro tout seul et ne dit rien
        # de ce que Papa aurait dû faire.
        "queued_count": max(0, len(actifs) - 1),
        "failed": echecs,
        "worker_alive": worker_alive,
    }


def _loin() -> datetime:
    """Un instant très postérieur : trie les travaux sans `started_at` APRÈS ceux qui en ont."""
    return datetime.max.replace(tzinfo=timezone.utc)


def _dernier_motif(db: Session, run: ProductionRun) -> str | None:
    """Le motif d'échec d'un lot vit dans son journal, pas sur le lot lui-même."""
    from app.db.models.production import ProductionEvent

    return db.scalar(
        select(ProductionEvent.detail)
        .where(ProductionEvent.run_id == run.id, ProductionEvent.outcome == "error")
        .order_by(ProductionEvent.id.desc())
        .limit(1)
    )


def acknowledge(db: Session, *, kind: str, item_id: int) -> None:
    """Papa a vu l'échec. Il ne revient plus — ni au rechargement, ni sur un autre appareil."""
    from fastapi import HTTPException, status as http

    modele = {"run": ProductionRun, "job": AIJob}.get(kind)
    if modele is None:
        raise HTTPException(http.HTTP_422_UNPROCESSABLE_CONTENT, detail=f"Type inconnu : {kind}")
    objet = db.get(modele, item_id)
    if objet is None:
        raise HTTPException(http.HTTP_404_NOT_FOUND, detail="Travail introuvable.")
    objet.acknowledged_at = datetime.now(timezone.utc)
    db.commit()


__all__ = ["read", "acknowledge", "runs"]
