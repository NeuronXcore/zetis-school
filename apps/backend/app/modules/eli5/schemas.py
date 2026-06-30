from pydantic import BaseModel


class SkillOut(BaseModel):
    id: int
    name: str
    subject: str


class ELI5ExplainRequest(BaseModel):
    skill_id: int
    question: str | None = None
    mode: str = "simple"


class ELI5ExplainResponse(BaseModel):
    title: str
    simple_explanation: str
    analogy: str
    example: str
    common_mistake: str
    check_question: str
    next_action: str


class ELI5ReverseRequest(BaseModel):
    skill_id: int
    answer_text: str
    input_mode: str = "text"


class ELI5ReverseResponse(BaseModel):
    score: int
    feedback: str
    missing_points: list[str]
    next_action: str
