"""Schémas missions — frontière serveur stricte (ADR-0017 §3).

Deux schémas, deux routers : `MissionStudentOut` (Massimo, SANS scores/facteurs/motifs) et
`MissionPilotOut` (Papa, sur-ensemble analytique). Jamais un schéma unique filtré en aval :
un champ présent dans la réponse réseau est un champ exposé, quoi qu'en fasse l'UI.
"""

from pydantic import BaseModel

# --- Frontière STUDENT (Massimo) : aucun score, aucun facteur, aucun motif de génération -----


class MissionStepStudentOut(BaseModel):
    id: int
    step_type: str
    instruction: str | None
    resource_id: int | None
    sort_order: int
    status: str


class MissionStudentOut(BaseModel):
    id: int
    subject: str
    skill_id: int | None
    skill_name: str | None
    title: str
    description: str | None
    mission_type: str
    status: str
    priority: int
    steps: list[MissionStepStudentOut]


class TodayResponse(BaseModel):
    """Contrat `/missions/today` (ADR-0017 §3) : une mission élue + sa raison, ou état serein."""

    elected: MissionStudentOut | None
    reason: str
    reason_code: str
    scoring_version: str
    alternatives: list[MissionStudentOut]  # ≤ 2


class GenerateResponse(BaseModel):
    created: int
    missions: list[MissionStudentOut]


class StepCompleteResponse(BaseModel):
    mission_status: str
    verdict: str | None  # acquired | review_later | None (mission non terminée)
    xp_awarded: int


class ValidateMissionsRequest(BaseModel):
    ids: list[int]


class ValidateMissionsResponse(BaseModel):
    validated: int


# --- Frontière PILOT (Papa) : sur-ensemble analytique -------------------------------------


class StepProofOut(BaseModel):
    """Preuve d'une étape, valeurs BRUTES (interdit côté student)."""

    label: str
    value: float | None  # score reverse / quiz ; None si non disponible
    satisfied: bool


class MissionStepPilotOut(BaseModel):
    id: int
    step_type: str
    instruction: str | None
    resource_id: int | None
    sort_order: int
    status: str
    proof: StepProofOut


class MissionPilotOut(BaseModel):
    id: int
    subject: str
    subject_id: int | None
    skill_id: int | None
    skill_name: str | None
    title: str
    description: str | None
    mission_type: str
    status: str
    validation_status: str
    priority: int
    created_by: str
    generation_reason: str
    steps: list[MissionStepPilotOut]


class ElectionFactorOut(BaseModel):
    name: str
    value: float
    weight: float
    contribution: float
    dominant: bool


class ElectionAlternativeOut(BaseModel):
    mission: MissionPilotOut
    score: float


class ElectionResponse(BaseModel):
    elected: MissionPilotOut | None
    score: float | None
    factors: list[ElectionFactorOut]
    scoring_version: str
    reason: str
    reason_code: str
    alternatives: list[ElectionAlternativeOut]


class VerdictOut(BaseModel):
    mission_id: int | None
    mission_type: str | None
    verdict: str | None
    quiz_score: float | None
    reverse_score: float | None
    xp: int | None
    effect: str | None
    skill_id: int | None
    subject_id: int | None


class PilotSummaryOut(BaseModel):
    pending: int
    pool: int  # validées planned|active
    completed_this_week: int
    acquired_rate_30d: float  # 0..1 (part de verdicts « acquise » sur 30 j)
