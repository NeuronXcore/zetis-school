"""Routes Conseil de classe IA (ADR-0020) — Papa-only (`require_parent`), 100 % local.

Aucune surface élève : le conseil est un artefact d'analyse pour Papa. Le pont
« créer ces missions » réutilise le flux Commander (missions `manual` validées par le clic)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.ai import get_embedder, get_provider
from app.modules.ai.provider import EmbeddingProvider, LLMProvider
from app.modules.auth.deps import require_parent
from app.modules.eli5.service import get_default_student
from app.modules.missions.schemas import MissionPilotOut
from app.modules.reports import service
from app.modules.reports.schemas import (
    CouncilReportListItem,
    CouncilReportOut,
    CreateMissionsFromRecoRequest,
    EquipNotionRequest,
    EquipNotionResult,
    GenerateCouncilRequest,
)

router = APIRouter(prefix="/api/reports", tags=["reports"], dependencies=[Depends(require_parent)])


@router.post("/class-council", response_model=CouncilReportOut)
def generate_council(
    payload: GenerateCouncilRequest,
    db: Session = Depends(get_db),
    provider: LLMProvider = Depends(get_provider),
) -> dict:
    try:
        return service.generate_council_report(
            db, get_default_student(db), provider, period=payload.period
        )
    except service.CouncilGenerationError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail=f"Conseil de classe indisponible : {exc}",
        ) from exc


@router.get("/class-council", response_model=list[CouncilReportListItem])
def list_council(period: str | None = None, db: Session = Depends(get_db)) -> list[dict]:
    return service.list_reports(db, get_default_student(db), period=period)


@router.post("/class-council/equip-notion", response_model=EquipNotionResult)
def equip_notion(
    payload: EquipNotionRequest,
    db: Session = Depends(get_db),
    provider: LLMProvider = Depends(get_provider),
    embedder: EmbeddingProvider = Depends(get_embedder),
) -> dict:
    """Génère + auto-valide le kit pédagogique d'une notion (ADR-0021), avant création mission."""
    return service.equip_notion(db, skill_id=payload.skill_id, llm=provider, embedder=embedder)


@router.post("/class-council/create-missions", response_model=list[MissionPilotOut])
def create_missions(
    payload: CreateMissionsFromRecoRequest, db: Session = Depends(get_db)
) -> list[dict]:
    return service.create_missions_from_reco(
        db,
        get_default_student(db),
        skill_ids=payload.skill_ids,
        due_date=payload.due_date,
        force_priority=payload.force_priority,
    )


@router.get("/class-council/{report_id}", response_model=CouncilReportOut)
def get_council(report_id: int, db: Session = Depends(get_db)) -> dict:
    return service.get_report(db, get_default_student(db), report_id)
