from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import get_current_user
from app.modules.eli5.service import get_default_student
from app.modules.gamification import service
from app.modules.gamification.schemas import GamificationSummary
from app.modules.motivation import service as motivation_service

router = APIRouter(prefix="/api/gamification", tags=["gamification"])


@router.get("/summary", response_model=GamificationSummary)
def summary(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> dict:
    """Synthèse de progression de l'élève : XP, niveau, badges, activité récente, régularité.

    La régularité est composée ICI et non dans `gamification.service` : ce service est le grand
    livre de l'économie XP (bas niveau), `motivation` lit tout le reste (haut niveau). Faire
    dépendre le premier du second inversait le sens des dépendances et créait un cycle
    `motivation → memory → gamification → motivation`. Le routeur, lui, est la racine de
    composition : il a le droit de connaître les deux."""
    student = get_default_student(db)
    return {
        **service.summary(db, student),
        "regularity": motivation_service.week_engagement(db, student_id=student.id),
    }
