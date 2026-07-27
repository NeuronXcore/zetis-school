from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.db.models import Quiz
from app.modules.activity.events import EVENT_QUIZ_ATTEMPTED, log_learning_event
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
    result = service.submit(db, student, quiz_id, req.answers)
    # Journal d'activité : une tentative de quiz, saveur « diagnostic ». Pas de dédupe — refaire
    # un diagnostic EST une activité, contrairement à un rafraîchissement de page.
    log_learning_event(
        db,
        student_id=student.id,
        event_type=EVENT_QUIZ_ATTEMPTED,
        subject_id=db.get(Quiz, quiz_id).subject_id,
        payload={
            "quiz_id": quiz_id,
            "quiz_type": "diagnostic",
            "score_percent": result["score_percent"],
        },
    )
    db.commit()
    return result


@router.get("/results", response_model=list[DiagnosticResultSummary])
def results(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> list[dict]:
    student = get_default_student(db)
    return service.latest_results(db, student)
