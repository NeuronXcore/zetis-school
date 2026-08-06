"""Routes d'exécution de la production (ADR-0031 §3) — `require_parent`, ÉCRITURE.

Routeur **distinct** de celui de la Couverture, et c'est délibéré : `production/router.py` est
documenté « LECTURE SEULE » et un test le garantit. Ajouter un POST là-bas aurait affaibli
l'invariant de l'ADR-0023 par simple voisinage de fichier.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.queue import MESSAGE_FILE_INJOIGNABLE, QueueUnavailable, production_worker_alive
from app.db.base import get_db
from app.modules.auth.deps import require_parent
from app.modules.production import runs
from app.modules.production.schemas import (
    ActiveProductionRunOut,
    ProductionPreviewOut,
    ProductionRunOut,
)

router = APIRouter(
    prefix="/api/production/runs", tags=["production"], dependencies=[Depends(require_parent)]
)


@router.post("", response_model=ProductionRunOut, status_code=status.HTTP_202_ACCEPTED)
def create(chapter_id: int, db: Session = Depends(get_db)) -> dict:
    """202 : le lot est ACCEPTÉ, pas exécuté. Le worker le prendra ; la page suit son état.

    409 si l'arriéré de relecture déborde — le régulateur refuse et le dit (ADR-0031 §5).
    503 si la file est injoignable : **aucun lot n'est laissé en base** (ADR-0041 §10.1).
    """
    run = runs.create_run(db, chapter_id=chapter_id)
    try:
        runs.enqueue_or_cancel(db, run)
    except QueueUnavailable as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, detail=MESSAGE_FILE_INJOIGNABLE
        ) from exc
    return runs.run_out(db, run)


@router.post("/from-request", response_model=ProductionRunOut, status_code=status.HTTP_202_ACCEPTED)
def create_from_request(request_id: int, db: Session = Depends(get_db)) -> dict:
    """Produit la pièce qu'une demande de Massimo réclame — **sur un clic de Papa** (ADR-0036 §6).

    Ce bouton manquait : la page Demandes n'offrait qu'un lien vers la Couverture, où Papa devait
    retrouver la notion, relancer la génération à la main, puis revenir cliquer « Fait ».

    ⚠️ **`trigger='manual'`, pas `'request'`**, et ce n'est pas un détail de nommage. Le `trigger`
    dit **qui a décidé** : ici c'est Papa qui clique, donc aucun régulateur ne s'applique (le geste
    EST le régulateur, ADR-0032 §5) et aucun régime n'est requis. `'request'` est réservé au lot
    que **personne** n'a demandé, né du scan sous les deux conditions du §1.

    ⚠️ **Conséquence assumée : le lot ne porte AUCUN `content_request_id`** — la contrainte
    l'interdit pour `manual`, à juste titre. La demande n'en est pas perdue de vue pour autant :
    c'est la DISPONIBILITÉ qui la referme (§4), pas le lien vers le lot. C'est exactement pourquoi
    l'ADR-0031 §4 a refusé de dériver le scope de la référence.
    """
    from app.db.models import ContentRequest
    from app.db.models.production import REQUEST_KIND_TO_PIECE

    req = db.get(ContentRequest, request_id)
    if req is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Demande introuvable.")
    piece = REQUEST_KIND_TO_PIECE.get(req.content_kind)
    if piece is None:
        # Le même refus que le scan, dit ici aussi : l'écran ne devrait pas offrir ce bouton, mais
        # une route qui compte sur son client pour se protéger n'est pas protégée.
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                f"ZETIS ne produit pas « {req.content_kind} » tout seul — "
                "ce contenu se crée depuis sa propre page."
            ),
        )
    run = runs.create_run(db, scope_skill_id=req.skill_id, scope_kind=piece)
    try:
        runs.enqueue_or_cancel(db, run)
    except QueueUnavailable as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, detail=MESSAGE_FILE_INJOIGNABLE
        ) from exc
    return runs.run_out(db, run)


# Déclarées AVANT `/{run_id}` : sinon « preview » / « active » seraient captés comme des
# {run_id} (→ 422). Même piège que `/mindmaps/summary`.
@router.get("/active", response_model=ActiveProductionRunOut | None)
def get_active(db: Session = Depends(get_db)) -> dict | None:
    """Le lot en cours, ou `null`. Alimente l'indicateur d'en-tête — un PROCESSUS, pas un stock.

    ⚠️ **La question du worker n'est posée que s'il y a un lot en file.** Un lot `running` a
    forcément quelqu'un qui l'exécute — le demander à Redis serait un aller-retour pour une
    réponse connue. Et sans lot du tout, personne ne regarde : l'absence de worker n'est un
    problème que quand quelque chose attend.
    """
    run = runs.active_run(db)
    if run is None:
        return None
    return {
        **runs.run_out(db, run),
        "worker_alive": production_worker_alive() if run.status == "queued" else True,
    }



@router.get("/preview", response_model=ProductionPreviewOut)
def preview(chapter_id: int, db: Session = Depends(get_db)) -> dict:
    """Ce qu'un lot ferait, sans rien créer. Le gate doit être visible AVANT le clic."""
    return runs.preview(db, chapter_id=chapter_id)


@router.get("/{run_id}", response_model=ProductionRunOut)
def get_one(run_id: int, db: Session = Depends(get_db)) -> dict:
    return runs.run_out(db, runs.get_run(db, run_id))
