from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import get_current_user
from app.modules.eli5.service import get_default_student
from app.modules.missions import service
from app.modules.missions.schemas import (
    GenerateRemediationResponse,
    MissionCompleteResponse,
    MissionOut,
)

router = APIRouter(prefix="/api/missions", tags=["missions"])


@router.post("/generate-remediation", response_model=GenerateRemediationResponse)
def generate_remediation(
    db: Session = Depends(get_db), _: dict = Depends(get_current_user)
) -> GenerateRemediationResponse:
    """Papa : transforme les lacunes ouvertes en missions de remédiation."""
    student = get_default_student(db)
    missions = service.generate_remediation(db, student)
    return GenerateRemediationResponse(created=len(missions), missions=missions)


@router.get("", response_model=list[MissionOut])
def list_missions(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> list[dict]:
    return service.list_missions(db, get_default_student(db))


@router.get("/today", response_model=list[MissionOut])
def today(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> list[dict]:
    return service.today_missions(db, get_default_student(db))


@router.post("/{mission_id}/complete", response_model=MissionCompleteResponse)
def complete(
    mission_id: int, db: Session = Depends(get_db), _: dict = Depends(get_current_user)
) -> dict:
    return service.complete_mission(db, get_default_student(db), mission_id)
