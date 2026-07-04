from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.ai import get_embedder, get_provider
from app.modules.ai.provider import EmbeddingProvider, LLMProvider
from app.modules.auth.deps import get_current_user, require_parent
from app.modules.eli5.service import get_default_student
from app.modules.memory import generation
from app.modules.memory.schemas import (
    AttemptRequest,
    AttemptResult,
    CardContent,
    CardsOverview,
    DeleteCardsResult,
    ReactivateResult,
    ReviewCard,
    ReviewsSummary,
    SessionRequest,
    SkillGenerateResult,
    SubjectCardsTree,
    SubjectDeck,
    SubjectGenerateResult,
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


# --- Pilotage PAPA de la génération des cartes (/api/memory/cards/*, ADR-0013) ---
# `require_parent` partout (page « Cartes SRS ») — à ne pas confondre avec les routes élève
# `/api/student/reviews/*`. Génération LOCALE (Ollama) ancrée sur le cours validé.
parent_router = APIRouter(
    prefix="/api/memory/cards", tags=["srs-cards"], dependencies=[Depends(require_parent)]
)


@parent_router.get("/overview", response_model=CardsOverview)
def cards_overview(db: Session = Depends(get_db)) -> dict:
    return generation.overview(db)


@parent_router.get("/subjects/{subject_id}", response_model=SubjectCardsTree)
def subject_cards_tree(subject_id: int, db: Session = Depends(get_db)) -> dict:
    return generation.subject_tree(db, subject_id)


@parent_router.post("/subjects/{subject_id}/generate", response_model=SubjectGenerateResult)
def generate_subject(
    subject_id: int,
    db: Session = Depends(get_db),
    provider: LLMProvider = Depends(get_provider),
    embedder: EmbeddingProvider = Depends(get_embedder),
) -> dict:
    return generation.reconcile_cards_for_subject(db, provider, embedder, subject_id=subject_id)


@parent_router.post("/skills/{skill_id}/generate", response_model=SkillGenerateResult)
def generate_skill(
    skill_id: int,
    db: Session = Depends(get_db),
    provider: LLMProvider = Depends(get_provider),
    embedder: EmbeddingProvider = Depends(get_embedder),
) -> dict:
    return generation.generate_cards_for_skill(db, provider, embedder, skill_id=skill_id)


@parent_router.get("/skills/{skill_id}/cards", response_model=list[CardContent])
def skill_cards(skill_id: int, db: Session = Depends(get_db)) -> list[dict]:
    return generation.skill_cards(db, skill_id)


@parent_router.post("/skills/{skill_id}/reactivate", response_model=ReactivateResult)
def reactivate_skill(skill_id: int, db: Session = Depends(get_db)) -> dict:
    return generation.reactivate_skill(db, skill_id)


@parent_router.delete("/skills/{skill_id}", response_model=DeleteCardsResult)
def delete_skill_cards(skill_id: int, db: Session = Depends(get_db)) -> dict:
    # SEULE suppression de cartes (§5) — l'UI confirmera (supprime cartes + historique).
    return generation.delete_skill_cards(db, skill_id)
