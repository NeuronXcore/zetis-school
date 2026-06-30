from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import get_current_user
from app.modules.eli5.service import get_default_student
from app.modules.gamification import service
from app.modules.gamification.schemas import GamificationSummary

router = APIRouter(prefix="/api/gamification", tags=["gamification"])


@router.get("/summary", response_model=GamificationSummary)
def summary(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> dict:
    """Synthèse de progression de l'élève : XP, niveau, streak, badges, activité récente."""
    return service.summary(db, get_default_student(db))
