"""Routes HTTP du moteur de quiz (ADR-0014, Lot 1).

Deux routeurs :
- `router` (Papa, `require_parent`) : génération/régénération, inventaire, inspection avec
  clés, édition, ajout manuel, retrait, suppression ;
- `student_router` (`/api/student`, tout authentifié — filtrage serveur) : liste jouable sans
  clés, tentative, feedback immédiat, complétion.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.ai import get_embedder, get_provider
from app.modules.ai.provider import EmbeddingProvider, LLMProvider
from app.modules.auth.deps import get_current_user, require_parent
from app.modules.eli5.service import get_default_student
from app.modules.quizzes import service
from app.modules.quizzes.schemas import (
    AnswerFeedbackOut,
    CompleteOut,
    ManualQuestionCreate,
    PapaQuestionOut,
    PapaQuizDetailOut,
    QuestionPatch,
    QuizGenerateRequest,
    QuizGenerateResponse,
    QuizListItem,
    StartAttemptOut,
    StudentQuizOut,
    StudentQuizSubjectOut,
    SubmitAnswerRequest,
)

router = APIRouter(prefix="/api", tags=["quizzes"], dependencies=[Depends(require_parent)])
student_router = APIRouter(
    prefix="/api/student", tags=["quizzes-student"], dependencies=[Depends(get_current_user)]
)
# Surface de lecture de la page « Quiz — pilotage » (overview + arbre matière), Papa only.
pilotage_router = APIRouter(
    prefix="/api/quiz-pilotage", tags=["quiz-pilotage"], dependencies=[Depends(require_parent)]
)


@pilotage_router.get("/overview")
def pilotage_overview(db: Session = Depends(get_db)) -> dict:
    """KPI globaux + santé de la génération par matière (taux d'écart de l'auto-vérif)."""
    return service.pilotage_overview(db)


@pilotage_router.get("/subjects/{subject_id}")
def pilotage_subject_tree(subject_id: int, db: Session = Depends(get_db)) -> dict:
    """Leçons validées d'une matière + leurs quiz (leçons sans quiz incluses)."""
    return service.pilotage_subject_tree(db, subject_id)


# ── Papa ──────────────────────────────────────────────────────────────────────


@router.post("/lessons/{lesson_id}/quizzes/generate", response_model=QuizGenerateResponse)
def generate(
    lesson_id: int,
    req: QuizGenerateRequest,
    db: Session = Depends(get_db),
    provider: LLMProvider = Depends(get_provider),
    embedder: EmbeddingProvider = Depends(get_embedder),
) -> QuizGenerateResponse:
    """Génère un NOUVEAU quiz de fin de cours (requête longue, moteur local)."""
    quiz, counters = service.generate_quiz(
        db, provider, embedder, lesson_id=lesson_id, count=req.count, difficulty=req.difficulty
    )
    return QuizGenerateResponse(
        quiz_id=quiz.id,
        lesson_id=lesson_id,
        questions_generated=counters["questions_generated"],
        questions_discarded=counters["questions_discarded"],
    )


@router.get("/lessons/{lesson_id}/quizzes", response_model=list[QuizListItem])
def list_by_lesson(lesson_id: int, db: Session = Depends(get_db)) -> list[dict]:
    return service.list_quizzes_for_lesson(db, lesson_id)


@router.get("/subjects/{subject_slug}/quizzes", response_model=list[QuizListItem])
def list_by_subject(subject_slug: str, db: Session = Depends(get_db)) -> list[dict]:
    return service.list_quizzes_for_subject(db, subject_slug)


@router.get("/quizzes/{quiz_id}", response_model=PapaQuizDetailOut)
def get_quiz(quiz_id: int, db: Session = Depends(get_db)) -> dict:
    """Vue Papa : questions AVEC clés et explications."""
    return service.get_quiz_papa(db, quiz_id)


@router.post("/quizzes/{quiz_id}/regenerate", response_model=QuizGenerateResponse)
def regenerate(
    quiz_id: int,
    db: Session = Depends(get_db),
    provider: LLMProvider = Depends(get_provider),
    embedder: EmbeddingProvider = Depends(get_embedder),
) -> QuizGenerateResponse:
    quiz, counters = service.regenerate_quiz(db, provider, embedder, quiz_id=quiz_id)
    return QuizGenerateResponse(
        quiz_id=quiz.id,
        lesson_id=quiz.lesson_id,
        questions_generated=counters["questions_generated"],
        questions_discarded=counters["questions_discarded"],
    )


@router.patch("/quiz-questions/{question_id}", response_model=PapaQuestionOut)
def patch_question(question_id: int, patch: QuestionPatch, db: Session = Depends(get_db)) -> dict:
    """Toute édition bascule la question en `manual` (règle de service)."""
    return service.patch_question(db, question_id, patch)


@router.post("/quizzes/{quiz_id}/questions", response_model=PapaQuestionOut)
def add_question(
    quiz_id: int, payload: ManualQuestionCreate, db: Session = Depends(get_db)
) -> dict:
    return service.add_manual_question(db, quiz_id, payload)


@router.post("/quiz-questions/{question_id}/retire", response_model=PapaQuestionOut)
def retire_question(question_id: int, db: Session = Depends(get_db)) -> dict:
    return service.retire_question(db, question_id)


@router.delete("/quizzes/{quiz_id}")
def delete_quiz(quiz_id: int, db: Session = Depends(get_db)) -> dict:
    return service.delete_quiz(db, quiz_id)


# ── Élève (Massimo) ───────────────────────────────────────────────────────────


@student_router.get("/quiz-subjects", response_model=list[StudentQuizSubjectOut])
def student_quiz_subjects(db: Session = Depends(get_db)) -> list[dict]:
    """Grille « Quiz » : matières de l'année active + nombre de quiz jouables (0 → grisée)."""
    return service.student_quiz_subjects(db)


@student_router.get("/quizzes/{subject_slug}", response_model=list[StudentQuizOut])
def student_quizzes(subject_slug: str, db: Session = Depends(get_db)) -> list[dict]:
    """Quiz jouables d'une matière (leçons validées, questions actives, SANS clé)."""
    return service.list_student_quizzes(db, subject_slug)


@student_router.post("/quizzes/{quiz_id}/attempts", response_model=StartAttemptOut)
def start_attempt(quiz_id: int, db: Session = Depends(get_db)) -> dict:
    return service.start_attempt(db, get_default_student(db), quiz_id)


@student_router.post("/quiz-attempts/{attempt_id}/answers", response_model=AnswerFeedbackOut)
def submit_answer(
    attempt_id: int, req: SubmitAnswerRequest, db: Session = Depends(get_db)
) -> dict:
    """Corrige la réponse et renvoie le feedback immédiat — jamais la clé."""
    return service.submit_answer(
        db, get_default_student(db), attempt_id, req.question_id, req.answer_json
    )


@student_router.post("/quiz-attempts/{attempt_id}/complete", response_model=CompleteOut)
def complete_attempt(attempt_id: int, db: Session = Depends(get_db)) -> dict:
    return service.complete_attempt(db, get_default_student(db), attempt_id)
