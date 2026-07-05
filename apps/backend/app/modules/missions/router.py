"""Routers missions — frontière stricte (ADR-0017 §3) : deux routers, deux schémas, gate en requête.

`router` sert Massimo (`MissionStudentOut`, aucun score). `pilot_router` sert Papa
(`MissionPilotOut`, sur-ensemble analytique). Même préfixe `/api/missions` : les chemins
littéraux (`/pending`, `/pilot`, `/election/today`…) ne collisionnent avec aucune route
dynamique `/{mission_id}/…` (suffixes distincts)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import get_current_user
from app.modules.eli5.service import get_default_student
from app.modules.missions import pilot, service
from app.modules.missions.schemas import (
    ElectionResponse,
    GenerateResponse,
    MissionPilotOut,
    MissionStudentOut,
    PilotSummaryOut,
    StepCompleteResponse,
    TodayResponse,
    ValidateMissionsRequest,
    ValidateMissionsResponse,
    VerdictOut,
)

router = APIRouter(prefix="/api/missions", tags=["missions"])
pilot_router = APIRouter(prefix="/api/missions", tags=["missions-pilot"])


# ============================ Student (Massimo) ============================


@router.get("", response_model=list[MissionStudentOut])
def list_missions(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> list[dict]:
    return service.list_missions(db, get_default_student(db))


@router.get("/today", response_model=TodayResponse)
def today(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> dict:
    """Mission du jour ÉLUE + raison (contrat ADR-0017 §3), ou état serein si rien d'obligatoire."""
    return service.today_election(db, get_default_student(db))


@router.post("/{mission_id}/start", response_model=MissionStudentOut)
def start(
    mission_id: int, db: Session = Depends(get_db), _: dict = Depends(get_current_user)
) -> dict:
    return service.start_mission(db, get_default_student(db), mission_id)


@router.post("/{mission_id}/steps/{step_id}/complete", response_model=StepCompleteResponse)
def complete_step(
    mission_id: int,
    step_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> dict:
    return service.complete_step(db, get_default_student(db), mission_id, step_id)


# ============================ Pilotage (Papa) ============================


@pilot_router.post("/generate-remediation", response_model=GenerateResponse)
def generate_remediation(
    db: Session = Depends(get_db), _: dict = Depends(get_current_user)
) -> GenerateResponse:
    missions = service.generate_remediation(db, get_default_student(db))
    return GenerateResponse(created=len(missions), missions=missions)


@pilot_router.post("/generate-revision", response_model=GenerateResponse)
def generate_revision(
    db: Session = Depends(get_db), _: dict = Depends(get_current_user)
) -> GenerateResponse:
    missions = service.generate_revision(db, get_default_student(db))
    return GenerateResponse(created=len(missions), missions=missions)


@pilot_router.post("/generate-progression", response_model=GenerateResponse)
def generate_progression(
    db: Session = Depends(get_db), _: dict = Depends(get_current_user)
) -> GenerateResponse:
    missions = service.generate_progression(db, get_default_student(db))
    return GenerateResponse(created=len(missions), missions=missions)


@pilot_router.get("/pending", response_model=list[MissionPilotOut])
def pending(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> list[dict]:
    return pilot.pending(db, get_default_student(db))


@pilot_router.post("/validate", response_model=ValidateMissionsResponse)
def validate(
    payload: ValidateMissionsRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> dict:
    return service.validate_missions(db, payload.ids)


@pilot_router.post("/{mission_id}/reject")
def reject(
    mission_id: int, db: Session = Depends(get_db), _: dict = Depends(get_current_user)
) -> dict:
    return pilot.reject(db, get_default_student(db), mission_id)


@pilot_router.get("/election/today", response_model=ElectionResponse)
def election_today(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> dict:
    """Recalcule l'élection (déterministe) : élue + facteurs + alternatives + version de scoring."""
    return pilot.election_today(db, get_default_student(db))


@pilot_router.get("/pilot", response_model=list[MissionPilotOut])
def pilot_list(
    type: str | None = None,
    subject: str | None = None,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> list[dict]:
    return pilot.pilot_list(db, get_default_student(db), mission_type=type, subject=subject)


@pilot_router.get("/verdicts/recent", response_model=list[VerdictOut])
def verdicts_recent(
    db: Session = Depends(get_db), _: dict = Depends(get_current_user)
) -> list[dict]:
    return pilot.verdicts_recent(db, get_default_student(db))


@pilot_router.get("/pilot/summary", response_model=PilotSummaryOut)
def pilot_summary(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> dict:
    return pilot.pilot_summary(db, get_default_student(db))
