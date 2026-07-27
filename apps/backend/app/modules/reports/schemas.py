"""Schémas du Conseil de classe IA (ADR-0020).

`CouncilReportSpec` = miroir Pydantic **strict** (`extra="forbid"`) de la sortie LLM : la
garantie dure (patron ADR-0007/0015). Le service revalide en plus chaque `skill_id`/`subject_id`
contre l'évidence (ancrage anti-hallucination). Les schémas `*Out` sont la surface Papa
(`MissionPilotOut`-like) — aucune donnée n'atteint Massimo (rapport Papa-only)."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# --- Sortie LLM (validée dur) --------------------------------------------------------------


class CouncilRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    skill_ids: list[int]
    mission_type: Literal["manual"] = "manual"
    template_hint: str | None = None
    justification: str


class CouncilSubjectEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject_id: int
    subject_name: str
    strengths: str
    to_reinforce: str
    recent_evolution: str
    recommendations: list[CouncilRecommendation] = Field(default_factory=list)


class CouncilReportSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    global_summary: str
    subjects: list[CouncilSubjectEntry] = Field(default_factory=list)


def generation_schema() -> dict:
    """Schéma JSON pour la sortie structurée ollama (identique à `CouncilReportSpec`)."""
    return CouncilReportSpec.model_json_schema()


# --- Requêtes Papa -------------------------------------------------------------------------


class GenerateCouncilRequest(BaseModel):
    """`POST /api/reports/class-council` : génère + persiste un rapport."""

    model_config = ConfigDict(extra="forbid")

    period: str | None = None


class EquipNotionRequest(BaseModel):
    """`POST /api/reports/class-council/equip-notion` : génère + auto-valide le kit d'UNE notion."""

    model_config = ConfigDict(extra="forbid")

    skill_id: int


class EquipPieceError(BaseModel):
    piece: str
    message: str


class EquipNotionResult(BaseModel):
    skill_id: int
    skill_name: str
    has_lesson: bool
    generated: list[str] = Field(default_factory=list)
    skipped: list[str] = Field(default_factory=list)
    errors: list[EquipPieceError] = Field(default_factory=list)
    reason: str | None = None


class CreateMissionsFromRecoRequest(BaseModel):
    """`POST /api/reports/class-council/create-missions` : une recommandation → missions
    mono-notion via le flux Commander (ADR-0018). La validation Papa = ce clic."""

    model_config = ConfigDict(extra="forbid")

    skill_ids: list[int]
    due_date: date | None = None
    force_priority: bool = False


class CreateChampionRequest(BaseModel):
    """`POST /api/reports/class-council/create-champion` (ADR-0022 §8) : une recommandation croisée
    → UNE mission `champion` multi-matières. Les notions sont déjà équipées (boucle `equip-notion`)."""

    model_config = ConfigDict(extra="forbid")

    skill_ids: list[int]
    flavor: str = "consolidation"


# --- Réponses (surface Papa) ---------------------------------------------------------------


class CouncilRecommendationOut(BaseModel):
    skill_ids: list[int]
    skill_names: list[str]
    mission_type: str
    template_hint: str | None = None
    justification: str


class CouncilSubjectOut(BaseModel):
    subject_id: int
    subject_name: str
    strengths: str
    to_reinforce: str
    recent_evolution: str
    recommendations: list[CouncilRecommendationOut] = Field(default_factory=list)


class CouncilReportOut(BaseModel):
    id: int
    period: str
    global_summary: str
    subjects: list[CouncilSubjectOut] = Field(default_factory=list)
    prompt_version: str
    created_at: datetime | None = None


class CouncilReportListItem(BaseModel):
    id: int
    period: str
    subjects_count: int
    created_at: datetime | None = None
