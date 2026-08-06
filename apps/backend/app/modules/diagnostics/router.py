from fastapi import APIRouter, Depends, status
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
from app.modules.ai import travaux
from app.modules.ai.schemas import TravailAccepteOut

router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"])


@router.get("/subjects", response_model=list[SubjectOut])
def subjects(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> list[dict]:
    return [{"id": s.id, "name": s.name} for s in service.list_subjects(db)]


@router.post(
    "/generate", response_model=TravailAccepteOut, status_code=status.HTTP_202_ACCEPTED
)
def generate(
    req: DiagnosticGenerateRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> dict:
    """Papa lance un diagnostic. **202 — accepté, pas exécuté** (ADR-0041 §4).

    `quiz_id`, `subject` et `questions_count` se lisent dans `output` quand le travail est
    `succeeded` — le contrat de `DiagnosticGenerateResponse` y est déplacé tel quel.

    🔴 **Le `404` est rejoué ICI, avant d'enfiler, et c'est une correction trouvée par un test.**
    La file diffère le TRAVAIL, jamais le VERDICT sur la demande : une matière inconnue doit être
    refusée au clic, pas rapportée deux minutes plus tard comme un travail en échec. Le contrôle
    coûte une lecture indexée, et le service le refait de son côté — le monde a pu changer entre
    le clic et l'exécution.
    """
    service._subject_or_404(db, req.subject_id)
    return travaux.enfiler(
        db,
        job_type="diagnostic_generate",
        payload={"subject_id": req.subject_id, "level": req.level},
    )


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
