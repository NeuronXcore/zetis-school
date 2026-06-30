from pydantic import BaseModel


class SkillOut(BaseModel):
    id: int
    name: str
    subject: str


class ELI5ExplainRequest(BaseModel):
    skill_id: int
    question: str | None = None
    mode: str = "simple"


class ELI5ExplainJobResponse(BaseModel):
    """Contrat API_SPEC : explain crée un ai_jobs et renvoie sa référence (exécution synchrone)."""

    job_id: int
    status: str


class ELI5ExplainResponse(BaseModel):
    """Forme de l'explication stockée dans `ai_jobs.output_json` (lue via GET /ai/jobs/{job_id})."""

    title: str
    simple_explanation: str
    analogy: str
    example: str
    common_mistake: str
    check_question: str
    next_action: str
    # Nombre de passages de cours (RAG) injectés ; >0 → explication appuyée sur une source validée.
    sources_used: int = 0


class ELI5ReverseRequest(BaseModel):
    skill_id: int
    answer_text: str
    input_mode: str = "text"


class ELI5ReverseResponse(BaseModel):
    score: int
    feedback: str
    missing_points: list[str]
    next_action: str
