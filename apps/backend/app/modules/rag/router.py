from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.base import get_db
from app.modules.ai import get_embedder
from app.modules.ai.provider import EmbeddingProvider
from app.modules.auth.deps import get_current_user
from app.modules.rag import service
from app.modules.rag.schemas import (
    RagDocumentOut,
    RagIngestRequest,
    RagIngestResponse,
    RagSearchHit,
    RagSearchRequest,
)

router = APIRouter(prefix="/api/rag", tags=["rag"])


@router.post("/documents", response_model=RagIngestResponse)
def ingest(
    req: RagIngestRequest,
    db: Session = Depends(get_db),
    embedder: EmbeddingProvider = Depends(get_embedder),
    _: dict = Depends(get_current_user),
) -> RagIngestResponse:
    document, chunks = service.ingest_document(db, embedder, req)
    return RagIngestResponse(document_id=document.id, chunks=chunks)


@router.get("/documents", response_model=list[RagDocumentOut])
def list_documents(
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> list[RagDocumentOut]:
    return [
        RagDocumentOut(
            id=doc.id,
            title=doc.title,
            subject_id=doc.subject_id,
            source_type=doc.source_type,
            level=doc.level,
            chapter=doc.chapter,
            validation_status=doc.validation_status,
            chunks=chunks,
        )
        for doc, chunks in service.list_documents(db)
    ]


@router.post("/search", response_model=list[RagSearchHit])
def search(
    req: RagSearchRequest,
    db: Session = Depends(get_db),
    embedder: EmbeddingProvider = Depends(get_embedder),
    _: dict = Depends(get_current_user),
) -> list[RagSearchHit]:
    hits = service.search(
        db, embedder, query=req.query, subject_id=req.subject_id, k=req.k or settings.rag_top_k
    )
    return [
        RagSearchHit(
            chunk_id=chunk.id, document_id=chunk.document_id, content=chunk.content, distance=dist
        )
        for chunk, dist in hits
    ]
