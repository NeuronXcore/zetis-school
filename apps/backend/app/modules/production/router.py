"""Routes de la page Papa « Couverture de production » — `require_parent`, LECTURE SEULE.

Rien de ces routes n'atteint Massimo : aucune donnée, aucun composant partagé avec
`frontend-massimo`. Elles ne génèrent ni ne valident rien — les actions de la page passent par
les endpoints existants de chaque module (ADR-0023 : aucun nouvel endpoint de génération ici).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import require_parent
from app.modules.production import coverage as service
from app.modules.production.schemas import CoverageOut, OrphanOut

router = APIRouter(
    prefix="/api/production", tags=["production"], dependencies=[Depends(require_parent)]
)


@router.get("/coverage", response_model=CoverageOut)
def get_coverage(subject_id: int | None = None, db: Session = Depends(get_db)) -> dict:
    """Matrice matière → chapitre → leçon. `subject_id` absent → toutes les matières de l'année."""
    return service.coverage(db, subject_id)


@router.get("/orphans", response_model=list[OrphanOut])
def get_orphans(db: Session = Depends(get_db)) -> list[dict]:
    """Dérivés dont la leçon a été archivée, + `has_history`. Ne supprime ni ne réattache rien."""
    return service.orphans(db)
