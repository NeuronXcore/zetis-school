from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.ai import get_provider
from app.modules.ai.provider import LLMProvider
from app.modules.auth.deps import get_current_user
from app.modules.diagnostics import service
from app.modules.diagnostics.schemas import (
    DiagnosticGenerateRequest,
    DiagnosticGenerateResponse,
    DiagnosticQuizListItem,
    DiagnosticQuizOut,
    DiagnosticResultOut,
    DiagnosticResultSummary,
    DiagnosticSubmitRequest,
    SubjectOut,
)
from app.modules.eli5.service import get_default_student

router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"])


@router.get("/subjects", response_model=list[SubjectOut])
def subjects(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> list[dict]:
    return [{"id": s.id, "name": s.name} for s in service.list_subjects(db)]


@router.post("/generate", response_model=DiagnosticGenerateResponse)
def generate(
    req: DiagnosticGenerateRequest,
    db: Session = Depends(get_db),
    provider: LLMProvider = Depends(get_provider),
    _: dict = Depends(get_current_user),
) -> DiagnosticGenerateResponse:
    """Papa lance un diagnostic : génère un quiz de QCM par notion (trace ai_jobs)."""
    quiz, subject_name, count = service.generate_diagnostic(db, provider, req.subject_id, req.level)
    return DiagnosticGenerateResponse(quiz_id=quiz.id, subject=subject_name, questions_count=count)


@router.get("/quizzes", response_model=list[DiagnosticQuizListItem])
def quizzes(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> list[dict]:
    student = get_default_student(db)
    return service.list_diagnostics(db, student)


@router.get("/quizzes/{quiz_id}", response_model=DiagnosticQuizOut)
def quiz_questions(
    quiz_id: int, db: Session = Depends(get_db), _: dict = Depends(get_current_user)
) -> dict:
    return service.get_quiz_for_taking(db, quiz_id)


@router.post("/quizzes/{quiz_id}/submit", response_model=DiagnosticResultOut)
def submit(
    quiz_id: int,
    req: DiagnosticSubmitRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> dict:
    student = get_default_student(db)
    return service.submit(db, student, quiz_id, req.answers)


@router.get("/results", response_model=list[DiagnosticResultSummary])
def results(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> list[dict]:
    student = get_default_student(db)
    return service.latest_results(db, student)
