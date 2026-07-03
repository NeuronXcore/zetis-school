"""Routes HTTP du cadre temporel « Années scolaires » (ADR-0009 §9, Lot E) — Papa
uniquement.

Volontairement SANS route DELETE : l'historique pédagogique (chapitres, missions,
progression) référence les années par FK. La lecture de l'année active pour la page
Programme reste `GET /api/school-years/active/subjects` (module curriculum) — non
dupliquée ici.
"""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import require_parent
from app.modules.school import service
from app.modules.school.schemas import SchoolYearCreate, SchoolYearOut, SchoolYearPatch

router = APIRouter(
    prefix="/api/school-years", tags=["school-years"], dependencies=[Depends(require_parent)]
)


@router.get("", response_model=list[SchoolYearOut])
def list_school_years(db: Session = Depends(get_db)) -> list[dict]:
    """Liste complète (active + historique), plus récente d'abord."""
    return service.list_years(db)


@router.post("", response_model=SchoolYearOut, status_code=status.HTTP_201_CREATED)
def create_school_year(payload: SchoolYearCreate, db: Session = Depends(get_db)) -> dict:
    """Création en `draft` — l'activation passe par le PATCH (une seule année active)."""
    return service.create_year(db, payload)


@router.patch("/{year_id}", response_model=SchoolYearOut)
def update_school_year(
    year_id: int, payload: SchoolYearPatch, db: Session = Depends(get_db)
) -> dict:
    """Édition (libellé, dates, statut). Passer `status='active'` archive l'ancienne
    active dans la même transaction ; `level` est immuable (422 via le schéma)."""
    return service.update_year(db, year_id, payload)
