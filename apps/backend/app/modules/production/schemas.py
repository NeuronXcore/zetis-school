"""Schémas de sortie de la page « Couverture de production » (Papa uniquement)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

CellState = Literal["absent", "pending", "validated", "stale", "blocked"]
RowState = Literal["blocked_lesson", "blocked_no_course", "ready", "complete"]
# Aligné sur `provenance.ValidatedBy` — `parent_rule` y est LÉGALE et non émise (§G.1, ADR-0032).
# Le Literal doit l'accepter avant qu'une ligne la porte, sinon la matrice tomberait en 500 le jour
# de la première écriture, très loin d'ici.
ValidatedBy = Literal["parent", "parent_bulk", "parent_rule", "system"]


class CellOut(BaseModel):
    state: CellState
    derived_at: datetime | None = None
    # `NULL` se lit « provenance inconnue » (antérieure à la traçabilité), jamais « non validé » :
    # l'état est déjà porté par `state`.
    validated_by: ValidatedBy | None = None
    # Cible d'un « Régénérer » côté Papa : id du dérivé (leçon pour la colonne Cours). `None`
    # quand la cellule est `absent` ou `blocked` — il n'y a rien à régénérer.
    object_id: int | None = None


class FractionOut(BaseModel):
    """Colonne notion-centrée : une fraction, **jamais un état de fraîcheur** (§E.5)."""

    covered: int
    total: int


class NotionItemOut(BaseModel):
    """Une notion de la leçon, et ce qu'elle porte de CONSOMMABLE.

    Sert à agir depuis la matrice : sans ce détail, un clic sur une fraction générerait à
    l'aveugle. Aucun état de fraîcheur ici non plus (§E.5)."""

    skill_id: int
    name: str
    has_card: bool
    has_capsule: bool


class NotionsOut(BaseModel):
    cards: FractionOut
    capsules: FractionOut
    items: list[NotionItemOut] = []


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


class ProductionRunOut(BaseModel):
    """État d'un lot de production (ADR-0031 §3). Un ÉTAT, jamais du contenu."""

    id: int
    status: str
    trigger: str
    authorized_by: str
    chapter_id: int | None
    total_notions: int | None
    done_notions: int | None
    #: Avancement réel (0-100), calculé serveur — jamais une estimation de durée côté client.
    progress_pct: int
    created_at: datetime
    finished_at: datetime | None


class ProductionNotion(BaseModel):
    """Une notion dans l'aperçu d'un lot. Le NOM en plus de l'id : une liste d'ids ne se lit pas."""

    skill_id: int
    name: str
    reason: str | None = None


class ProductionPreviewOut(BaseModel):
    """Ce qu'un lot ferait, sans rien créer (ADR-0031 slice C).

    `blocked` n'est jamais un simple compte : chaque notion porte son motif. Une notion
    silencieusement omise se lirait comme un échec de production, alors que c'est le gate du §7
    qui fonctionne.
    """

    chapter_id: int
    eligible: list[ProductionNotion]
    blocked: list[ProductionNotion]
    pending_backlog: int
    max_pending: int


# --- Journal de production (ADR-0034) -----------------------------------------------------------

RunStatus = Literal["queued", "running", "done", "failed", "stale"]
# `stale` est RENDU, jamais stocké : un lot dont le battement a expiré (ADR-0034 §2). L'ajouter au
# Literal du rendu sans l'ajouter au vocabulaire de la table est délibéré — la base ne connaît que
# quatre statuts, l'écran en montre cinq.
PieceKind = Literal["cours", "fiche", "mindmap", "quiz", "srs"]
EventOutcome = Literal["generated", "skipped", "error", "blocked"]


class JournalEventOut(BaseModel):
    """Une ligne du détail : ce que le lot a fait d'une pièce, ou pourquoi il n'a rien fait.

    `piece = None` + `outcome = 'blocked'` porte sur la NOTION : le gate du §7 l'a écartée. Une
    notion silencieusement omise se lirait comme un échec de production.
    """

    skill_id: int | None = None
    skill_name: str | None = None
    piece: PieceKind | None = None
    outcome: EventOutcome
    detail: str | None = None
    created_at: datetime


class JournalPieceOut(BaseModel):
    """Une pièce produite par le lot, et si elle est encore rétractable."""

    kind: PieceKind
    id: int
    label: str
    # `None` pour les cartes SRS : `spaced_review_cards` n'a NI `validation_status` NI
    # `validated_by`. Se lit « aucune étape de validation n'existe », jamais « non validé ».
    validated_by: ValidatedBy | None = None
    skill_id: int | None = None
    skill_name: str | None = None
    # LA question du veto : la consommation ferme la fenêtre, pas l'horloge (§G.3).
    consumed: bool


class JournalRunOut(BaseModel):
    id: int
    status: RunStatus
    trigger: str
    authorized_by: str
    chapter_id: int | None = None
    total_notions: int | None = None
    done_notions: int | None = None
    current_skill_id: int | None = None
    current_skill_name: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    events: list[JournalEventOut] = []
    pieces: list[JournalPieceOut] = []


class JournalOut(BaseModel):
    """⚠️ Aucun total de provenance, aucun ratio ZETIS/Papa (§F.2) : la provenance est un fait,
    jamais un reproche — elle s'affiche par objet et ne se totalise pas."""

    runs: list[JournalRunOut] = []
    has_more: bool = False


class VetoPreviewOut(BaseModel):
    """Ce qu'un retrait emporterait. `removable=False` porte TOUJOURS son motif."""

    removable: bool
    reason: str | None = None
    # Ce que le retrait d'un cours emporte : le cours est la source canonique de ses dérivés.
    cascade: dict[str, list[int]] = {}


class VetoRemovalOut(BaseModel):
    removed: dict[str, int] = {}
