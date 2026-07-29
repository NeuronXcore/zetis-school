"""Schémas agenda — frontière serveur stricte (ADR-0025 §2, patron `MissionStudentOut`/`Pilot`).

Deux schémas, deux routers : `AgendaItemStudentOut` (Massimo, SANS `parent_note`) et
`AgendaItemPilotOut` (Papa, sur-ensemble). Jamais un schéma unique filtré en aval : un champ
présent dans la réponse réseau est un champ exposé, quoi qu'en fasse l'UI. Un test-verrou
l'assert sur le JSON sérialisé, pas sur la définition du schéma.
"""

from datetime import date, datetime

from pydantic import BaseModel, Field

from app.db.models.agenda import AGENDA_KINDS

_KIND_PATTERN = "^(" + "|".join(AGENDA_KINDS) + ")$"


class SubjectRef(BaseModel):
    """Matière d'un item, telle qu'affichée. `None` sur un item saisi sans matière."""

    id: int
    slug: str
    name: str
    color: str | None = None


# --- Frontière STUDENT (Massimo) ---------------------------------------------------------------


class AgendaItemStudentOut(BaseModel):
    id: int
    label: str
    subject: SubjectRef | None
    due_on: date
    kind: str
    done: bool
    created_by: str
    # Marqueur « complété par papa » (§2a) : booléen DÉRIVÉ de `edited_by_parent_at`. L'instant
    # exact reste pilot-only — Massimo a besoin de savoir QUE l'item a bougé, pas QUAND.
    edited_by_parent: bool
    # AUCUN `parent_note`, AUCUN `dismissed_at`, AUCUN horodatage. Jamais.


class AgendaDayOut(BaseModel):
    """Un jour de la bande glissante. L'asymétrie passé/futur est calculée SERVEUR (§6)."""

    date: date
    # Décalage en jours par rapport à l'ancre : -3..+3. Le client n'a aucun calcul de date à faire.
    offset: int
    # Jours PASSÉS (et aujourd'hui) uniquement, `null` sinon — jamais `0` sur un jour à venir :
    # un jour qui n'est pas encore arrivé n'a pas de case vide (§7, ADR-0024 §5).
    # `traces = 0` et « journée sans donnée » sont LE MÊME état côté contrat.
    traces: int | None
    # Jours à VENIR (et aujourd'hui) uniquement, `[]` sinon : un jour passé n'a plus d'échéance
    # à annoncer.
    fixed_items: list[AgendaItemStudentOut]
    # Toujours `[]` en Lot 1 — champ présent au contrat, rempli par le plan de préparation (§8).
    plan_steps: list[dict] = []


class AgendaWeekOut(BaseModel):
    anchor: date
    days: list[AgendaDayOut]


class UpcomingItemOut(BaseModel):
    """« Ce qui arrive » : contrôles et rendus SEULEMENT (§6).

    `days_left` est un décompte SUBI, pas fabriqué (§1) — il porte une échéance qui existe déjà
    dans le monde de Massimo. Aucune jauge, aucune couleur d'approche : le seul signal
    d'approche est l'apparition du plan de préparation.
    """

    id: int
    label: str
    subject: SubjectRef | None
    due_on: date
    days_left: int
    has_plan: bool  # `false` en Lot 1


class AgendaItemStudentCreate(BaseModel):
    """Saisie élève (phase 1 seulement — 403 tant que le verrou est fermé).

    `created_by` n'est PAS un champ : il est forcé côté serveur, jamais lu du corps.
    """

    label: str = Field(min_length=1, max_length=300)
    due_on: date
    subject_id: int | None = None
    kind: str = Field(default="devoir", pattern=_KIND_PATTERN)


class AgendaItemStudentPatch(BaseModel):
    """Édition par Massimo de SES propres items (403 sur un item de Papa)."""

    label: str | None = Field(default=None, min_length=1, max_length=300)
    due_on: date | None = None
    subject_id: int | None = None
    kind: str | None = Field(default=None, pattern=_KIND_PATTERN)


# --- Frontière PILOT (Papa) --------------------------------------------------------------------


class AgendaItemPilotOut(BaseModel):
    id: int
    label: str
    subject: SubjectRef | None
    subject_id: int | None
    chapter_id: int | None
    due_on: date
    kind: str
    created_by: str
    parent_note: str | None
    done_at: datetime | None
    dismissed_at: datetime | None
    edited_by_parent_at: datetime | None
    created_at: datetime | None
    updated_at: datetime | None


class AgendaItemParentCreate(BaseModel):
    label: str = Field(min_length=1, max_length=300)
    due_on: date
    subject_id: int | None = None
    chapter_id: int | None = None
    kind: str = Field(default="devoir", pattern=_KIND_PATTERN)
    parent_note: str | None = None


class AgendaItemsParentCreate(BaseModel):
    """Saisie EN LOT (§9) : le mode d'usage réel est « je relève l'ENT du dimanche soir », pas
    « j'ajoute un devoir »."""

    items: list[AgendaItemParentCreate] = Field(min_length=1)


class AgendaItemParentPatch(BaseModel):
    """Champs éditables par Papa.

    `done_at` est déclaré ICI **exprès**, alors qu'il n'est pas éditable : sans lui, Pydantic
    l'écarterait en silence et Papa croirait avoir coché. Le service refuse explicitement en
    **403** — un refus d'AUTORITÉ, pas de validation (§2b). Une règle qui se contente d'ignorer
    n'enseigne rien à celui qui la franchit.
    """

    label: str | None = Field(default=None, min_length=1, max_length=300)
    due_on: date | None = None
    subject_id: int | None = None
    chapter_id: int | None = None
    kind: str | None = Field(default=None, pattern=_KIND_PATTERN)
    done_at: datetime | None = None  # piège volontaire → 403, cf. docstring.


class AgendaNoteRequest(BaseModel):
    """Note privée de Papa — jamais servie à Massimo."""

    parent_note: str | None = None


class AgendaSettingsOut(BaseModel):
    """Réglages de l'agenda, Papa-only. Un seul aujourd'hui : le verrou de phase (§10)."""

    student_entry_enabled: bool


class AgendaSettingsRequest(BaseModel):
    student_entry_enabled: bool
