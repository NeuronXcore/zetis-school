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
from app.modules.missions import command, pilot, service
from app.modules.missions.schemas import (
    CommandConfirmRequest,
    CommandPreviewRequest,
    CommandPreviewResponse,
    ElectionResponse,
    GenerateResponse,
    MissionPatchRequest,
    MissionPilotOut,
    MissionStepOptionsOut,
    MissionStudentOut,
    PilotSummaryOut,
    SetMissionStepsRequest,
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


# --- Commander une mission (ADR-0018) : preview/confirm sans état, Papa uniquement -----------


@pilot_router.post("/command/preview", response_model=CommandPreviewResponse)
def command_preview(
    payload: CommandPreviewRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> dict:
    """Résout un chapitre en notions fragiles (proposées cochées) — n'écrit rien."""
    return command.resolve_chapter_notions(db, get_default_student(db), payload.chapter_id)


@pilot_router.post("/command/confirm", response_model=list[MissionPilotOut])
def command_confirm(
    payload: CommandConfirmRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> list[dict]:
    """Crée une mission `manual` mono-skill par notion cochée (fan-out atomique, validated)."""
    return command.create_command_missions(
        db,
        get_default_student(db),
        skill_ids=payload.skill_ids,
        due_date=payload.due_date,
        force_priority=payload.force_priority,
    )


# --- Cycle de vie d'une mission (Papa) : delete / regenerate / patch / éditeur de parcours ---


@pilot_router.delete("/{mission_id}")
def delete_mission(
    mission_id: int, db: Session = Depends(get_db), _: dict = Depends(get_current_user)
) -> dict:
    """Suppression dure (mission + étapes) — distincte de `reject`."""
    return service.delete_mission(db, get_default_student(db), mission_id)


@pilot_router.post("/{mission_id}/regenerate", response_model=MissionPilotOut)
def regenerate_mission(
    mission_id: int, db: Session = Depends(get_db), _: dict = Depends(get_current_user)
) -> dict:
    """Reconstruit le parcours (déterministe, planned only)."""
    mission = service.regenerate_mission(db, get_default_student(db), mission_id)
    return pilot._to_pilot_out(db, mission)


@pilot_router.patch("/{mission_id}", response_model=MissionPilotOut)
def patch_mission(
    mission_id: int,
    payload: MissionPatchRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> dict:
    """Édite les métadonnées sûres d'une mission."""
    mission = service.patch_mission(
        db, get_default_student(db), mission_id, payload.model_dump(exclude_unset=True)
    )
    return pilot._to_pilot_out(db, mission)


@pilot_router.get("/{mission_id}/step-options", response_model=MissionStepOptionsOut)
def step_options(
    mission_id: int, db: Session = Depends(get_db), _: dict = Depends(get_current_user)
) -> dict:
    """Palette d'étapes disponibles + parcours courant (éditeur de parcours)."""
    return service.mission_step_options(db, get_default_student(db), mission_id)


@pilot_router.put("/{mission_id}/steps", response_model=MissionPilotOut)
def set_steps(
    mission_id: int,
    payload: SetMissionStepsRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> dict:
    """Impose la liste ordonnée des étapes (planned only)."""
    mission = service.set_mission_steps(db, get_default_student(db), mission_id, payload.step_types)
    return pilot._to_pilot_out(db, mission)
