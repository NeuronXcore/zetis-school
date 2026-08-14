from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.ai import get_embedder, get_provider, travaux
from app.modules.ai.schemas import TravailAccepteOut
from app.modules.ai.provider import EmbeddingProvider, LLMProvider
from app.modules.auth.deps import get_current_user, require_parent
from app.modules.eli5.service import get_default_student
from app.modules.memory import generation
from app.modules.memory.schemas import (
    AttemptRequest,
    AttemptResult,
    CardContent,
    CardsOverview,
    ChapterDeck,
    ChapterDue,
    DeleteCardResult,
    DeleteCardsResult,
    ReactivateResult,
    ReviewCard,
    ReviewsSummary,
    SessionRequest,
    SkillGenerateResult,
    SubjectCardsTree,
    SubjectDeck,
    SubjectGenerateResult,
    UpdateCardRequest,
)
from app.modules.memory.service import (
    build_session,
    get_due_cards,
    get_reviews_summary,
    record_attempt,
    servable_chapters,
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


@student_router.get("/chapters", response_model=list[ChapterDue])
def reviews_chapters(
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> list[ChapterDue]:
    """Les chapitres offrables, toutes matières (ADR-0057, slice Révision).

    Listing **séparé** de `/summary`, et non un enrichissement : `summary` est aussi consommé par
    l'**Accueil** (`useAccueil.ts`), qui n'a que faire des chapitres. Même geste que les trois
    slices précédentes du motif (`/api/student/quizzes`, `/fiche-tiles`, `/mindmaps`).
    """
    student = get_default_student(db)
    return [ChapterDue(**row) for row in servable_chapters(db, student.id)]


@student_router.post("/session", response_model=list[ReviewCard])
def reviews_session(
    body: SessionRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> list[ReviewCard]:
    student = get_default_student(db)
    if isinstance(body.deck, SubjectDeck):
        cards = build_session(db, student, deck="subject", subject_slug=body.deck.subject)
    elif isinstance(body.deck, ChapterDeck):
        cards = build_session(db, student, deck="chapter", chapter_id=body.deck.chapter)
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
    return AttemptResult(
        **record_attempt(
            db,
            student,
            card_id,
            body.rating,
            # Contexte proposé, revalidé serveur — cf. `record_attempt` (ADR-0049 Décision 4).
            chapter_id=body.deck.chapter if body.deck else None,
        )
    )


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


@parent_router.post(
    "/subjects/{subject_id}/generate",
    response_model=TravailAccepteOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def generate_subject(subject_id: int, db: Session = Depends(get_db)) -> dict:
    """Papa : demande les cartes d'une matière. **202 — acceptée, pas exécutée** (ADR-0041 §4).

    Le compte-rendu (`created`, `skipped`…) se lit dans `output` quand le travail est `succeeded`.
    """
    return travaux.enfiler(db, job_type="srs_cards_generate", payload={"subject_id": subject_id})


@parent_router.post(
    "/skills/{skill_id}/generate",
    response_model=TravailAccepteOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def generate_skill(skill_id: int, db: Session = Depends(get_db)) -> dict:
    """202 — voir `generate_subject`. Même `job_type` : c'est le même travail, à une granularité
    près, et deux types auraient coupé en deux l'historique qui sert à en mesurer la durée."""
    return travaux.enfiler(db, job_type="srs_cards_generate", payload={"skill_id": skill_id})


@parent_router.get("/skills/{skill_id}/cards", response_model=list[CardContent])
def skill_cards(skill_id: int, db: Session = Depends(get_db)) -> list[dict]:
    return generation.skill_cards(db, skill_id)


@parent_router.post("/skills/{skill_id}/reactivate", response_model=ReactivateResult)
def reactivate_skill(skill_id: int, db: Session = Depends(get_db)) -> dict:
    return generation.reactivate_skill(db, skill_id)


@parent_router.delete("/skills/{skill_id}", response_model=DeleteCardsResult)
def delete_skill_cards(skill_id: int, db: Session = Depends(get_db)) -> dict:
    # Retrait de toutes les cartes d'une notion (§5) — l'UI confirme (cartes + historique).
    return generation.delete_skill_cards(db, skill_id)


# Édition / suppression à la carte (correction manuelle). Chemins à UN segment
# (`/{card_id}`) : pas de collision avec les routes `/skills/...` / `/subjects/...` (2 segments).
@parent_router.patch("/{card_id}", response_model=CardContent)
def update_card(card_id: int, body: UpdateCardRequest, db: Session = Depends(get_db)) -> dict:
    return generation.update_card(
        db, card_id, front_markdown=body.front_markdown, back_markdown=body.back_markdown
    )


@parent_router.delete("/{card_id}", response_model=DeleteCardResult)
def delete_card(card_id: int, db: Session = Depends(get_db)) -> dict:
    return generation.delete_card(db, card_id)
