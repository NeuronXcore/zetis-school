from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import get_current_user
from app.modules.eli5.service import get_default_student
from app.modules.missions import service
from app.modules.missions.schemas import (
    GenerateRemediationResponse,
    MissionOut,
    StepCompleteResponse,
    ValidateMissionsRequest,
    ValidateMissionsResponse,
)

router = APIRouter(prefix="/api/missions", tags=["missions"])


@router.post("/generate-remediation", response_model=GenerateRemediationResponse)
def generate_remediation(
    db: Session = Depends(get_db), _: dict = Depends(get_current_user)
) -> GenerateRemediationResponse:
    """Papa : transforme les lacunes ouvertes en missions de remédiation (naissent `pending`)."""
    student = get_default_student(db)
    missions = service.generate_remediation(db, student)
    return GenerateRemediationResponse(created=len(missions), missions=missions)


@router.post("/validate", response_model=ValidateMissionsResponse)
def validate(
    payload: ValidateMissionsRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> dict:
    """Papa : valide en lot des missions `pending` (pilotage complet = Lot 2)."""
    return service.validate_missions(db, payload.ids)


@router.get("", response_model=list[MissionOut])
def list_missions(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> list[dict]:
    return service.list_missions(db, get_default_student(db))


@router.get("/today", response_model=list[MissionOut])
def today(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> list[dict]:
    return service.today_missions(db, get_default_student(db))


@router.post("/{mission_id}/start", response_model=MissionOut)
def start(
    mission_id: int, db: Session = Depends(get_db), _: dict = Depends(get_current_user)
) -> dict:
    """planned → active, idempotent (horodate le start, socle de la preuve des étapes)."""
    return service.start_mission(db, get_default_student(db), mission_id)


@router.post("/{mission_id}/steps/{step_id}/complete", response_model=StepCompleteResponse)
def complete_step(
    mission_id: int,
    step_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> dict:
    """Valide une étape si sa preuve existe (postérieure au start) et dans l'ordre. La dernière
    étape termine la mission : XP inconditionnel + verdict d'acquisition."""
    return service.complete_step(db, get_default_student(db), mission_id, step_id)
