from pydantic import BaseModel


class MissionStepOut(BaseModel):
    id: int
    step_type: str
    instruction: str | None
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


class MissionCompleteResponse(BaseModel):
    id: int
    status: str
    gap_resolved: bool
    xp_awarded: int
