"""Schémas HTTP de la révision espacée (page Massimo « Révision », /revision).

Miroir Pydantic des types partagés `packages/types/src/reviews.ts` (règle CLAUDE.md n°8).
Le payload servi à l'élève n'expose AUCUNE donnée de planification (`due_at`,
`interval_days`, `ease_factor`) : la mécanique SRS est invisible côté Massimo.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class SubjectDue(BaseModel):
    slug: str
    name: str
    due_count: int


class ReviewsSummary(BaseModel):
    subjects: list[SubjectDue]
    total_due: int
    flash_size: int


class SubjectDeck(BaseModel):
    """Deck ciblé sur une matière : `{"subject": "<slug>"}`."""

    subject: str


class SessionRequest(BaseModel):
    # "mix_day"/"mix_flash" = mélanges ; objet {subject} = deck matière.
    deck: Literal["mix_day", "mix_flash"] | SubjectDeck


class ReviewCard(BaseModel):
    card_id: int
    subject_slug: str
    front_markdown: str
    back_markdown: str


class AttemptRequest(BaseModel):
    rating: Literal["again", "hard", "good", "easy"]


class AttemptResult(BaseModel):
    next_due_at: datetime | None
    xp_awarded: int
    is_consolidation: bool
