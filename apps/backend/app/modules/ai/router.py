from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.db.models import AIJob
from app.modules.auth.deps import get_current_user

router = APIRouter(prefix="/api/ai", tags=["ai"])


class JobOut(BaseModel):
    id: int
    job_type: str
    status: str
    output: dict | None = None
    duration_ms: int | None = None


@router.get("/jobs/{job_id}", response_model=JobOut)
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> JobOut:
    job = db.get(AIJob, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job IA introuvable")
    return JobOut(
        id=job.id,
        job_type=job.job_type,
        status=job.status,
        output=job.output_json,
        duration_ms=job.duration_ms,
    )
