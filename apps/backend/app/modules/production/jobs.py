"""Job RQ de production (ADR-0031 §3).

Le worker exécute CETTE fonction. Elle ouvre sa propre session et ses propres providers : un job
ne s'exécute dans aucune requête HTTP, donc dans aucune dépendance FastAPI.

⚠️ On enfile la **fonction**, pas une chaîne. `core/queue.py` enfile `worker-media` par nom de
tâche pour éviter un import croisé backend ↔ worker ; ici c'est le **même code des deux côtés**, et
une chaîne qui ne résout pas échoue à l'exécution — un import échoue au démarrage.
"""

import logging
from typing import Iterable

logger = logging.getLogger(__name__)

# Nom qualifié du job périodique, tel que RQ le stocke (`job.func_name`). Écrit une fois ici :
# le comparer à une chaîne recopiée ailleurs le ferait diverger au premier renommage de module.
SCAN_JOB_NAME = "app.modules.production.jobs.scan_triggers"


def _contains_scan(jobs: Iterable) -> bool:
    """Cette liste de jobs contient-elle un réveil du scan ? (fonction pure, testable)"""
    return any(getattr(job, "func_name", None) == SCAN_JOB_NAME for job in jobs if job is not None)


def scan_already_planned(queue) -> bool:
    """Un réveil du scan est-il DÉJÀ prévu — en file ou planifié ? (correctif du 2026-08-03)

    ## Le défaut que cette fonction ferme

    Deux mécanismes justes séparément, faux ensemble :

    - `production_worker.py` **amorce** `scan_triggers` au démarrage — sans quoi une file vide ne
      se remplirait jamais ;
    - `scan_triggers` **se replanifie lui-même** en `finally` — sans quoi un scan qui échoue
      arrêterait le dispositif définitivement et en silence.

    Résultat : **chaque redémarrage du worker ajoutait une récurrence permanente**. Constaté en
    vrai le 2026-08-03 — quatre réveils planifiés après quatre démarrages dans la journée. Bénin en
    dev ; pas en production, où un worker redémarre à chaque déploiement, crash ou OOM.

    ⚠️ **Ni l'un ni l'autre mécanisme n'est supprimé** : ils répondent chacun à un mode de panne
    réel. On ajoute seulement la question qui manquait — *« y a-t-il déjà un réveil de prévu ? »*.

    ⚠️ **Et surtout pas un `job_id` fixe.** C'était le correctif évident, et il est piégeux : le job
    se replanifierait sous **son propre identifiant** pendant qu'il tourne, et RQ efface le hash du
    job terminé après son `finally` — l'entrée planifiée pointerait vers un job mort.

    Les deux registres sont interrogés parce qu'un réveil peut être dans l'un **ou** l'autre : en
    file quand son heure est venue, planifié le reste du temps. N'en lire qu'un rouvrirait le
    défaut une fois sur deux.
    """
    from rq.registry import ScheduledJobRegistry

    registre = ScheduledJobRegistry(queue=queue)
    planifies = [queue.fetch_job(job_id) for job_id in registre.get_job_ids()]
    return _contains_scan(planifies) or _contains_scan(queue.jobs)


def run_production(run_id: int) -> dict:
    """Point d'entrée du job : équipe le scope du run et tient son journal."""
    from app.db.base import SessionLocal
    from app.modules.ai import get_embedder, get_provider
    from app.modules.production import runner

    db = SessionLocal()
    try:
        return runner.execute(db, run_id=run_id, llm=get_provider(), embedder=get_embedder())
    finally:
        db.close()


def _now():
    from datetime import datetime, timezone

    return datetime.now(timezone.utc)


def _equip_notion(db, payload: dict, llm, embedder) -> dict:
    from app.modules.production import equipment

    return equipment.equip_notion(
        db, skill_id=int(payload["skill_id"]), llm=llm, embedder=embedder
    )


# `job_type` → l'exécutant, qui reçoit `input_json`. **Un seul producteur migré en slice A**
# (ADR-0041 §4) : les autres restent synchrones et n'apparaissent donc pas dans la file. La table
# grandit en slice C — elle ne change pas de forme.
_EXECUTANTS = {"equip_notion": _equip_notion}


def run_ai_job(job_id: int) -> dict:
    """Exécute un TRAVAIL unitaire déjà enfilé (ADR-0041 §3).

    ⚠️ **Le passage en `running` est COMMITÉ à part, avant le travail.** C'est lui qui fait
    basculer la barre de « en file d'attente » à « en cours » ; le garder dans la transaction du
    travail le rendrait invisible jusqu'à la fin, c'est-à-dire inutile.

    ⚠️ **L'échec relit le job après `rollback()`** : la session est cassée par l'exception, et
    l'objet chargé avant ne peut plus être écrit. Puis on **relance** — RQ doit voir le job échoué,
    comme le fait déjà `worker_media.jobs.render_capsule`.
    """
    from app.db.base import SessionLocal
    from app.db.models import AIJob
    from app.modules.ai import get_embedder, get_provider

    db = SessionLocal()
    try:
        job = db.get(AIJob, job_id)
        if job is None:
            logger.warning("run_ai_job: travail %s introuvable", job_id)
            return {"error": "introuvable"}

        executant = _EXECUTANTS.get(job.job_type)
        if executant is None:
            job.status = "failed"
            job.error_message = f"Aucun exécutant pour « {job.job_type} »."
            job.finished_at = _now()
            db.commit()
            return {"error": job.error_message}

        debut = _now()
        job.status = "running"
        job.started_at = debut
        db.commit()

        payload = job.input_json if isinstance(job.input_json, dict) else {}
        try:
            sortie = executant(db, payload, get_provider(), get_embedder())
        except Exception as exc:  # noqa: BLE001 — on trace, on marque `failed`, puis on relance.
            db.rollback()
            echoue = db.get(AIJob, job_id)
            if echoue is not None:
                echoue.status = "failed"
                echoue.error_message = str(exc)[:1000]
                echoue.finished_at = _now()
                db.commit()
            raise

        fin = _now()
        job = db.get(AIJob, job_id)
        job.status = "succeeded"
        job.output_json = sortie if isinstance(sortie, dict) else {"result": sortie}
        job.duration_ms = int((fin - debut).total_seconds() * 1000)
        job.finished_at = fin
        db.commit()
        return job.output_json
    finally:
        db.close()


def scan_triggers() -> dict:
    """Job PÉRIODIQUE du déclencheur automatique (ADR-0035 §2) — il REGARDE, il ne produit pas.

    Il lit l'agenda **et la file des demandes** (ADR-0036 §1), applique les conditions propres à
    chacun, crée les runs — et **se replanifie lui-même**. Les
    lots créés partent dans la même file et sont exécutés par `run_production`, comme ceux que
    Papa lance : **un seul chemin d'exécution**, quelle que soit l'origine.

    ⚠️ **La replanification est en `finally`.** Un scan qui échouerait sans se replanifier
    arrêterait le dispositif **définitivement et en silence** — le pire mode de panne pour une
    tâche de fond que personne ne regarde.
    """
    from app.core.queue import enqueue_production, production_queue
    from app.core.config import settings
    from app.db.base import SessionLocal
    from app.modules.production import triggers

    db = SessionLocal()
    try:
        # DEUX scans, un par source (ADR-0036 §1). Séparés parce que leurs conditions le sont :
        # l'agenda demande un déclencheur armé, les demandes exigent EN PLUS le régime *Autonome*.
        # Un scan unique aurait dû porter les deux jeux de conditions et le dire dans un seul
        # compte rendu — c'est-à-dire rendre illisible pourquoi il n'a rien fait.
        report = triggers.scan_agenda(db)
        report["requests"] = triggers.scan_requests(db)
        # ⚠️ Le `trigger` est passé EXPLICITEMENT et par source (ADR-0041 §5) : il choisit la file.
        # Un lot né du scan n'est attendu devant aucun écran — il ne double personne.
        for created in report["created"]:
            enqueue_production(created["run_id"], trigger="agenda")
        for created in report["requests"]["created"]:
            enqueue_production(created["run_id"], trigger="request")
        return report
    finally:
        db.close()
        from datetime import timedelta

        production_queue().enqueue_in(
            timedelta(minutes=settings.production_scan_interval_minutes), scan_triggers
        )
