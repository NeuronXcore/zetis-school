from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from sqlalchemy.orm import Session

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
    ELI5TranscribeResponse,
    SkillOut,
)
from app.modules.notions import service as notions_service
from app.modules.notions.schemas import NotionRequestCreate, NotionRequestOut
from app.modules.stt import get_stt
from app.modules.stt.provider import SttProvider

router = APIRouter(prefix="/api/ai/eli5", tags=["ai"])


@router.get("/skills", response_model=list[SkillOut])
def skills(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> list[dict]:
    return service.list_skills(db)


@router.post("/skills/{skill_id}/seen", status_code=status.HTTP_204_NO_CONTENT)
def skill_seen(
    skill_id: int, db: Session = Depends(get_db), _: dict = Depends(get_current_user)
) -> Response:
    """Massimo a ouvert cette notion en ELI5 — le témoin de navigation retombe.

    Route explicite plutôt qu'un marquage caché dans `POST /explain` : elle est visible au contrat
    d'API et testable seule. L'alternative (le précédent de `mark_lesson_seen` dans
    `GET /lessons/{id}/cours`) est consignée comme écartée dans l'addendum.

    Idempotente : rejouer le geste ne change rien.
    """
    service.mark_skill_seen(db, service.get_default_student(db).id, skill_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/explain", response_model=ELI5ExplainJobResponse)
def explain(
    req: ELI5ExplainRequest,
    db: Session = Depends(get_db),
    provider: LLMProvider = Depends(get_provider),
    embedder: EmbeddingProvider = Depends(get_embedder),
    _: dict = Depends(get_current_user),
) -> dict:
    # ELI5 v2 (ADR-0011) : la résolution du contexte (cours validé d'abord, RAG en
    # complément) vit désormais dans le substrat partagé, appelé par le service.
    # Renvoie {job_id, status} ; explication lue via GET /ai/jobs/{job_id}.
    return service.explain(db, provider, embedder, req)


@router.post("/reverse-evaluate", response_model=ELI5ReverseResponse)
def reverse_evaluate(
    req: ELI5ReverseRequest,
    db: Session = Depends(get_db),
    provider: LLMProvider = Depends(get_provider),
    _: dict = Depends(get_current_user),
) -> dict:
    return service.reverse_evaluate(db, provider, req)


@router.post("/transcribe", response_model=ELI5TranscribeResponse)
def transcribe(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    stt: SttProvider = Depends(get_stt),
    _: dict = Depends(get_current_user),
) -> dict:
    # Dictée ELI5 (ADR-0012) : audio → texte, transcrit en LOCAL. Le texte remplira le même
    # textarea puis partira en reverse-evaluate (input_mode text). STT indisponible → 503.
    return service.transcribe(db, stt, file)


@router.post("/request-notion", response_model=NotionRequestOut)
def request_notion(
    req: NotionRequestCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> dict:
    # L'enfant demande une notion hors de son programme → on la trace pour Papa (dédup
    # idempotente). Papa l'ajoute ensuite via le skills-backfill. Pas de skill_id ici.
    student = service.get_default_student(db)
    return notions_service.create_request(db, student, req.text)
