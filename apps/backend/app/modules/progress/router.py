"""Routes de progression (Papa) : détail des lacunes ouvertes et des notions consolidées.

Ces deux lectures servent le DÉTAIL des KPI correspondants du dashboard, dont les compteurs
vivent dans le payload `/api/parent/dashboard`. Réservées à Papa : ce sont des analyses
parentales, jamais servies à Massimo (CLAUDE.md §séparation des domaines).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import require_parent
from app.modules.eli5.service import get_default_student
from app.modules.progress import service
from app.modules.progress.schemas import ConsolidatedSkillOut, OpenGapOut

router = APIRouter(
    prefix="/api/parent/progress", tags=["progress"], dependencies=[Depends(require_parent)]
)


@router.get("/gaps", response_model=list[OpenGapOut])
def open_gaps(db: Session = Depends(get_db)) -> list[dict]:
    """Lacunes ouvertes, les plus sévères d'abord (« notions à renforcer » côté UI)."""
    return service.open_gaps(db, student_id=get_default_student(db).id)


@router.get("/consolidated", response_model=list[ConsolidatedSkillOut])
def consolidated_skills(db: Session = Depends(get_db)) -> list[dict]:
    """Notions consolidées (`mastered`, score ≥ 90), la maîtrise la plus haute d'abord."""
    return service.consolidated_skills(db, student_id=get_default_student(db).id)
