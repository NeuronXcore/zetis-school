"""Job RQ de production (ADR-0031 §3).

Le worker exécute CETTE fonction. Elle ouvre sa propre session et ses propres providers : un job
ne s'exécute dans aucune requête HTTP, donc dans aucune dépendance FastAPI.

⚠️ On enfile la **fonction**, pas une chaîne. `core/queue.py` enfile `worker-media` par nom de
tâche pour éviter un import croisé backend ↔ worker ; ici c'est le **même code des deux côtés**, et
une chaîne qui ne résout pas échoue à l'exécution — un import échoue au démarrage.
"""

import logging

logger = logging.getLogger(__name__)


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
        for created in report["created"] + report["requests"]["created"]:
            enqueue_production(created["run_id"])
        return report
    finally:
        db.close()
        from datetime import timedelta

        production_queue().enqueue_in(
            timedelta(minutes=settings.production_scan_interval_minutes), scan_triggers
        )
