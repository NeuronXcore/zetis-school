from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import get_current_user
from app.modules.eli5.service import get_default_student
from app.modules.memory.schemas import (
    AttemptRequest,
    AttemptResult,
    ReviewCard,
    ReviewsSummary,
    SessionRequest,
    SubjectDeck,
)
from app.modules.memory.service import (
    build_session,
    get_due_cards,
    get_reviews_summary,
    record_attempt,
)

router = APIRouter(prefix="/api/memory", tags=["memory"])


class DueCard(BaseModel):
    id: int
    skill_id: int
    front_markdown: str
    interval_days: int


@router.get("/reviews/due", response_model=list[DueCard])
def reviews_due(
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> list[DueCard]:
    student = get_default_student(db)
    cards = get_due_cards(db, student_id=student.id)
    return [
        DueCard(
            id=c.id, skill_id=c.skill_id, front_markdown=c.front_markdown, interval_days=c.interval_days
        )
        for c in cards
    ]


# --- Routes élève de la page « Révision » (/api/student/reviews/*) ---
# `get_current_user` seul : le rôle `child` passe (contrairement aux routes Papa
# `require_parent`). Résolution de l'élève par `get_default_student` (MVP mono-enfant),
# comme les autres routes élève. La mécanique SRS n'est jamais exposée dans les réponses.
student_router = APIRouter(prefix="/api/student/reviews", tags=["reviews"])


@student_router.get("/summary", response_model=ReviewsSummary)
def reviews_summary(
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> ReviewsSummary:
    student = get_default_student(db)
    return ReviewsSummary(**get_reviews_summary(db, student))


@student_router.post("/session", response_model=list[ReviewCard])
def reviews_session(
    body: SessionRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> list[ReviewCard]:
    student = get_default_student(db)
    if isinstance(body.deck, SubjectDeck):
        cards = build_session(db, student, deck="subject", subject_slug=body.deck.subject)
    else:
        cards = build_session(db, student, deck=body.deck)
    return [ReviewCard(**c) for c in cards]


@student_router.post("/cards/{card_id}/attempt", response_model=AttemptResult)
def reviews_attempt(
    card_id: int,
    body: AttemptRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> AttemptResult:
    student = get_default_student(db)
    return AttemptResult(**record_attempt(db, student, card_id, body.rating))
