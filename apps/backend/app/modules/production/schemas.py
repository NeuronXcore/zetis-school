"""Schémas de sortie de la page « Couverture de production » (Papa uniquement)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

CellState = Literal["absent", "pending", "validated", "stale", "blocked"]
RowState = Literal["blocked_lesson", "blocked_no_course", "ready", "complete"]
ValidatedBy = Literal["parent", "parent_bulk", "system"]


class CellOut(BaseModel):
    state: CellState
    derived_at: datetime | None = None
    # `NULL` se lit « provenance inconnue » (antérieure à la traçabilité), jamais « non validé » :
    # l'état est déjà porté par `state`.
    validated_by: ValidatedBy | None = None


class FractionOut(BaseModel):
    """Colonne notion-centrée : une fraction, **jamais un état de fraîcheur** (§E.5)."""

    covered: int
    total: int


class NotionsOut(BaseModel):
    cards: FractionOut
    capsules: FractionOut


class CellsOut(BaseModel):
    cours: CellOut
    quiz: CellOut
    fiche: CellOut
    mindmap: CellOut


class LessonRowOut(BaseModel):
    id: int
    title: str
    row_state: RowState
    cells: CellsOut
    notions: NotionsOut


class ChapterOut(BaseModel):
    id: int
    title: str
    lessons: list[LessonRowOut]


class SubjectCoverageOut(BaseModel):
    id: int
    name: str
    slug: str
    chapters: list[ChapterOut]


class SchoolYearOut(BaseModel):
    id: int
    label: str
    level: str


class TotalsOut(BaseModel):
    """Aucun agrégat de PROVENANCE ici (§F.2) : pas de « N objets validés en lot », pas de
    compteur, pas d'alerte. La provenance s'affiche par objet et ne se totalise jamais — un
    compteur qui reproche à Papa une tâche qu'il a choisi de ne pas faire n'est pas un outil."""

    lessons: int
    lessons_validated: int
    courses_written: int
    # Porte sur quiz · fiche · mindmap UNIQUEMENT — le cours en est la condition, pas un dérivé.
    derivatives_percent: int
    pending_count: int
    stale_count: int
    orphan_count: int


class CoverageOut(BaseModel):
    school_year: SchoolYearOut | None
    totals: TotalsOut
    subjects: list[SubjectCoverageOut]


class OrphanOut(BaseModel):
    type: Literal["fiche", "mindmap", "quiz"]
    id: int
    title: str
    subject: str | None = None
    archived_at: datetime | None = None
    # Vrai → l'UI désactive la suppression : un score n'a plus de sens sans l'objet qui l'a
    # produit, mais on n'efface pas l'histoire de Massimo pour faire propre.
    has_history: bool
