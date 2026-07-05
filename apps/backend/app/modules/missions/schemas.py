from pydantic import BaseModel


class MissionStepOut(BaseModel):
    id: int
    step_type: str
    instruction: str | None
    # Cible de l'étape (ADR-0017 §5) : skill à expliquer (eli5/vocal_explain) ou quiz à jouer.
    # Non secret (simple id) : sert au client à ouvrir la bonne activité.
    resource_id: int | None
    sort_order: int
    status: str


class MissionOut(BaseModel):
    id: int
    subject: str
    skill_id: int | None
    skill_name: str | None
    title: str
    description: str | None
    mission_type: str
    status: str
    priority: int
    steps: list[MissionStepOut]


class GenerateRemediationResponse(BaseModel):
    created: int
    missions: list[MissionOut]


class StepCompleteResponse(BaseModel):
    """Réponse à la complétion d'une étape. `verdict` et `xp_awarded` ne sont renseignés que
    lorsque l'étape complétée est la DERNIÈRE (fin de mission). Deux issues, toutes deux
    positives (ADR-0017 §5bis) : `acquired` (la notion est en place) ou `review_later` (on la
    reverra bientôt)."""

    mission_status: str
    verdict: str | None  # acquired | review_later | None (mission non terminée)
    xp_awarded: int


class ValidateMissionsRequest(BaseModel):
    ids: list[int]


class ValidateMissionsResponse(BaseModel):
    validated: int
