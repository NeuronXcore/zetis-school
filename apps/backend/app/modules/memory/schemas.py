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
    new_count: int = 0  # cartes dues jamais révisées (fraîchement générées) de cette matière
    has_cards: bool = True  # False → aucune carte active : matière grisée (« pas encore de cartes »)


class ReviewsSummary(BaseModel):
    subjects: list[SubjectDue]
    total_due: int
    flash_size: int
    new_count: int = 0  # total de cartes « nouvelles » (badge Massimo)


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


# --- Pilotage des cartes (page Papa « Cartes SRS », ADR-0013) ---
# Types de PILOTAGE Papa, distincts des types élève ci-dessus. Miroir de
# `packages/types/src/reviews.ts` (section Papa).

NotionState = Literal["ok", "to_generate", "failed", "suspended"]


class SkillGenerateResult(BaseModel):
    """Compte-rendu d'une génération unitaire (upsert 3 branches, ADR-0013 §3)."""

    created: int  # branche B — cartes créées (actives, dues maintenant)
    updated: int  # branche A — contenu réécrit, planification préservée
    reactivated: int  # carte suspendue/pending réactivée en place
    pending: int  # cas dégradé — générée sans cours validé (non servie)


class SubjectGenerateResult(SkillGenerateResult):
    """Compte-rendu d'une réconciliation par matière : + orphelines suspendues + échecs."""

    subject_id: int
    suspended: int  # branche C — notions orphelines suspendues
    failed_skills: list[int]  # notions dont la génération a échoué (le reste a réussi)


class OverviewSubject(BaseModel):
    subject_id: int
    name: str
    active_cards: int
    to_generate: int
    suspended: int


class OverviewTotals(BaseModel):
    covered: int  # notions couvertes par une leçon validée
    active: int
    to_generate: int
    suspended: int


class CardsOverview(BaseModel):
    subjects: list[OverviewSubject]
    totals: OverviewTotals


class NotionOut(BaseModel):
    skill_id: int
    name: str
    state: NotionState
    card_count: int


class TreeLesson(BaseModel):
    lesson_id: int
    title: str
    notions: list[NotionOut]


class TreeChapter(BaseModel):
    chapter_id: int
    name: str
    lessons: list[TreeLesson]


class SubjectCardsTree(BaseModel):
    subject_id: int
    name: str
    chapters: list[TreeChapter]
    suspended: list[NotionOut]


class CardContent(BaseModel):
    id: int
    card_type: str
    front_markdown: str
    back_markdown: str
    status: str


class ReactivateResult(BaseModel):
    skill_id: int
    reactivated: int


class DeleteCardsResult(BaseModel):
    skill_id: int
    deleted: int


class UpdateCardRequest(BaseModel):
    """Édition manuelle d'une carte (recto/verso) — planification préservée côté service."""

    front_markdown: str
    back_markdown: str


class DeleteCardResult(BaseModel):
    id: int
    deleted: int
