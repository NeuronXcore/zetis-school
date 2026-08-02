"""Routes d'exécution de la production (ADR-0031 §3) — `require_parent`, ÉCRITURE.

Routeur **distinct** de celui de la Couverture, et c'est délibéré : `production/router.py` est
documenté « LECTURE SEULE » et un test le garantit. Ajouter un POST là-bas aurait affaibli
l'invariant de l'ADR-0023 par simple voisinage de fichier.
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.queue import enqueue_production
from app.db.base import get_db
from app.modules.auth.deps import require_parent
from app.modules.production import runs
from app.modules.production.schemas import ProductionPreviewOut, ProductionRunOut

router = APIRouter(
    prefix="/api/production/runs", tags=["production"], dependencies=[Depends(require_parent)]
)


@router.post("", response_model=ProductionRunOut, status_code=status.HTTP_202_ACCEPTED)
def create(chapter_id: int, db: Session = Depends(get_db)) -> dict:
    """202 : le lot est ACCEPTÉ, pas exécuté. Le worker le prendra ; la page suit son état.

    409 si l'arriéré de relecture déborde — le régulateur refuse et le dit (ADR-0031 §5).
    """
    run = runs.create_run(db, chapter_id=chapter_id)
    enqueue_production(run.id)
    return runs.run_out(db, run)


# Déclarée AVANT `/{run_id}` : sinon « preview » serait capté comme un {run_id} (→ 422).
@router.get("/preview", response_model=ProductionPreviewOut)
def preview(chapter_id: int, db: Session = Depends(get_db)) -> dict:
    """Ce qu'un lot ferait, sans rien créer. Le gate doit être visible AVANT le clic."""
    return runs.preview(db, chapter_id=chapter_id)


@router.get("/{run_id}", response_model=ProductionRunOut)
def get_one(run_id: int, db: Session = Depends(get_db)) -> dict:
    return runs.run_out(db, runs.get_run(db, run_id))
