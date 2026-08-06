"""Routes Conseil de classe IA (ADR-0020) — Papa-only (`require_parent`), 100 % local.

Aucune surface élève : le conseil est un artefact d'analyse pour Papa. Le pont
« créer ces missions » réutilise le flux Commander (missions `manual` validées par le clic)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.ai import get_provider
from app.modules.ai.provider import LLMProvider
from app.modules.auth.deps import require_parent
from app.modules.eli5.service import get_default_student
from app.modules.missions.schemas import MissionPilotOut
from app.modules.reports import service
from app.modules.reports.schemas import (
    CouncilReportListItem,
    CouncilReportOut,
    CreateChampionRequest,
    CreateMissionsFromRecoRequest,
    EquipNotionRequest,
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
            db,
            get_default_student(db),
            provider,
            period=payload.period,
            # `None` = conseil global, comportement historique. Une valeur restreint l'évidence,
            # l'ancrage et le rapport figé à cette seule matière.
            subject_id=payload.subject_id,
        )
    except service.CouncilGenerationError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail=f"Conseil de classe indisponible : {exc}",
        ) from exc


@router.get("/class-council", response_model=list[CouncilReportListItem])
def list_council(
    period: str | None = None,
    # ⚠️ ABSENT = tout, globaux et ciblés confondus — c'est ce qui garde le client existant intact.
    subject_id: int | None = None,
    db: Session = Depends(get_db),
) -> list[dict]:
    return service.list_reports(db, get_default_student(db), period=period, subject_id=subject_id)


@router.post("/class-council/equip-notion", status_code=status.HTTP_202_ACCEPTED)
def equip_notion(payload: EquipNotionRequest, db: Session = Depends(get_db)) -> dict:
    """**202 : l'équipement est ACCEPTÉ, pas exécuté** (ADR-0041 §4).

    Cette route tenait jusqu'ici la requête HTTP pendant **cinq générations LLM locales** —
    ~69 s par notion, mesuré le 2026-08-02. Deux écrans affichaient une barre pilotée par deux
    constantes indépendantes (`EQUIP_MS`), et cette barre n'a jamais été vue tourner une seule
    fois. Elle rend désormais la main tout de suite ; l'avancement se lit dans
    `GET /api/production/activity`, avec tout le reste de ce que ZETIS fabrique.

    ⚠️ **Le travail est commité AVANT d'être enfilé** (§3). Sans cela, le worker pourrait le
    prendre avant que la ligne soit visible — et la barre ne pourrait pas l'annoncer « en file »
    dès le retour de cette route.

    ⚠️ Aucun `trigger` n'est écrit : un travail hors lot est manuel **par construction** (§3.2).
    C'est ce qui l'envoie sur la file prioritaire, devant les lots automatiques.

    503 si la file est injoignable, et **le travail est effacé** (ADR-0041 §10.1) : il vient d'être
    commité pour que le worker puisse le lire, donc son absence d'enfilement doit se défaire
    explicitement. Sans ça, la barre annoncerait « en file d'attente » sur un travail que rien
    n'exécutera jamais — le mensonge exact que ce chantier ferme.
    """
    from datetime import datetime, timezone

    from app.core.queue import MESSAGE_FILE_INJOIGNABLE, QueueUnavailable, enqueue_ai_job
    from app.db.models import AIJob

    job = AIJob(
        job_type="equip_notion",
        status="queued",
        input_json={"skill_id": payload.skill_id},
        created_by="parent",
        created_at=datetime.now(timezone.utc),
    )
    db.add(job)
    db.commit()
    try:
        enqueue_ai_job(job.id)
    except QueueUnavailable as exc:
        db.delete(job)
        db.commit()
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, detail=MESSAGE_FILE_INJOIGNABLE
        ) from exc
    return {"job_id": job.id, "status": job.status}


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


@router.post("/class-council/create-champion", response_model=MissionPilotOut)
def create_champion(payload: CreateChampionRequest, db: Session = Depends(get_db)) -> dict:
    """Recommandation croisée → UNE mission `champion` (ADR-0022 §8). Compose seul : la page a déjà
    équipé chaque notion via `equip-notion` (mêmes barres de progression que « Créer ces missions »)."""
    return service.create_champion_from_reco(
        db, get_default_student(db), skill_ids=payload.skill_ids, flavor=payload.flavor
    )


@router.get("/class-council/{report_id}", response_model=CouncilReportOut)
def get_council(report_id: int, db: Session = Depends(get_db)) -> dict:
    return service.get_report(db, get_default_student(db), report_id)
