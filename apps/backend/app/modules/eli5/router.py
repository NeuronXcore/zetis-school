from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.ai import get_provider
from app.modules.ai.provider import LLMProvider
from app.modules.auth.deps import get_current_user
from app.modules.eli5 import service
from app.modules.eli5.schemas import (
    ELI5ExplainRequest,
    ELI5ExplainResponse,
    ELI5ReverseRequest,
    ELI5ReverseResponse,
    SkillOut,
)

router = APIRouter(prefix="/api/ai/eli5", tags=["ai"])


@router.get("/skills", response_model=list[SkillOut])
def skills(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> list[dict]:
    return service.list_skills(db)


@router.post("/explain", response_model=ELI5ExplainResponse)
def explain(
    req: ELI5ExplainRequest,
    db: Session = Depends(get_db),
    provider: LLMProvider = Depends(get_provider),
    _: dict = Depends(get_current_user),
) -> dict:
    # context laissé vide pour l'instant (couture RAG prête côté service).
    return service.explain(db, provider, req, context=None)


@router.post("/reverse-evaluate", response_model=ELI5ReverseResponse)
def reverse_evaluate(
    req: ELI5ReverseRequest,
    db: Session = Depends(get_db),
    provider: LLMProvider = Depends(get_provider),
    _: dict = Depends(get_current_user),
) -> dict:
    return service.reverse_evaluate(db, provider, req)
