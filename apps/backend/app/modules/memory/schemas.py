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


# --- Génération de cartes (endpoint manuel Papa, ADR-0013) ---
# Les cartes héritent de la validation de leur leçon source (pas de file de relecture par
# carte). L'endpoint manuel renvoie un simple compte-rendu de la réconciliation.


class CardGenerationResult(BaseModel):
    """Compte-rendu de `refresh_cards_for_lesson` : upsert 3 branches (ADR-0013 §3)."""

    created: int  # branche B — cartes créées (actives, dues maintenant)
    updated: int  # branche A — contenu réécrit, planification préservée
    reactivated: int  # branche C inverse — carte suspendue/pending réactivée en place
    pending: int  # cas dégradé — générée sans cours validé (non servie)
