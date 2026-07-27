"""Schémas du CRUD années scolaires (ADR-0009 §9, Lot E de FRONTEND_ROADMAP).

`mode` (colonne dépréciée, ADR-0009 §4 : jamais lue) n'apparaît dans AUCUN schéma —
ni en réponse ni en requête (`extra="forbid"` le rejette en 422). Même mécanisme pour
`level` en PATCH : immuable après création (les FK pédagogiques et la résolution
niveau → cycle en dépendent).
Miroir TypeScript : `packages/types/src/school.ts` (règle CLAUDE.md n°8).
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SchoolYearStatus = Literal["draft", "active", "archived"]


class SchoolYearOut(BaseModel):
    id: int
    label: str
    level: str
    starts_on: date | None
    ends_on: date | None
    status: str
    # Version déclarative du programme portée par les chapitres générés de l'année
    # (ADR-0009 §5) — dérivée en lecture, null tant qu'aucun chapitre généré n'existe.
    # La page Années scolaires l'affiche en résolution informative, jamais en paramétrage.
    program_version: str | None


class SchoolYearCreate(BaseModel):
    """`POST /api/school-years` — statut initial `draft` (spec page-annees-scolaires.md) :
    l'activation est un geste séparé (PATCH), qui archive l'ancienne année active."""

    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1, max_length=40)  # ex: 2027-2028
    level: str = Field(min_length=1, max_length=20)  # ex: 4e
    starts_on: date | None = None
    ends_on: date | None = None


class SchoolYearPatch(BaseModel):
    """`PATCH /api/school-years/{id}` — libellé, dates, statut. `level` est ABSENT
    à dessein : toute tentative de le modifier est rejetée en 422 (`extra="forbid"`)."""

    model_config = ConfigDict(extra="forbid")

    label: str | None = Field(default=None, min_length=1, max_length=40)
    # Dates nullables : distinguer « non fourni » de « effacer » se fait via
    # `model_fields_set` dans le service.
    starts_on: date | None = None
    ends_on: date | None = None
    status: SchoolYearStatus | None = None
