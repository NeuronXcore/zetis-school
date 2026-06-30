from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.base import get_db
from app.modules.ai import get_embedder, get_provider
from app.modules.ai.provider import EmbeddingProvider, LLMProvider
from app.modules.auth.deps import get_current_user
from app.modules.eli5 import service
from app.modules.eli5.schemas import (
    ELI5ExplainJobResponse,
    ELI5ExplainRequest,
    ELI5ReverseRequest,
    ELI5ReverseResponse,
    SkillOut,
)
from app.modules.rag import service as rag_service

router = APIRouter(prefix="/api/ai/eli5", tags=["ai"])


@router.get("/skills", response_model=list[SkillOut])
def skills(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> list[dict]:
    return service.list_skills(db)


@router.post("/explain", response_model=ELI5ExplainJobResponse)
def explain(
    req: ELI5ExplainRequest,
    db: Session = Depends(get_db),
    provider: LLMProvider = Depends(get_provider),
    embedder: EmbeddingProvider = Depends(get_embedder),
    _: dict = Depends(get_current_user),
) -> dict:
    # RAG (Étape 11) : on récupère le contexte de cours de la matière. Renvoie []
    # — sans appel embeddings — si aucune source n'est indexée (comportement identique
    # à l'ancien stub). Renvoie {job_id, status} ; explication lue via GET /ai/jobs/{job_id}.
    context = rag_service.retrieve_for_skill(
        db,
        embedder,
        skill_id=req.skill_id,
        query=req.question or "",
        k=settings.rag_top_k,
    )
    return service.explain(db, provider, req, context=context)


@router.post("/reverse-evaluate", response_model=ELI5ReverseResponse)
def reverse_evaluate(
    req: ELI5ReverseRequest,
    db: Session = Depends(get_db),
    provider: LLMProvider = Depends(get_provider),
    _: dict = Depends(get_current_user),
) -> dict:
    return service.reverse_evaluate(db, provider, req)
