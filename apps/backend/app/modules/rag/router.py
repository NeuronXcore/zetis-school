from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.base import get_db
from app.modules.ai import get_embedder
from app.modules.ai.provider import EmbeddingProvider
from app.modules.auth.deps import get_current_user
from app.modules.rag import service
from app.modules.rag.extract import extract_text
from app.modules.rag.schemas import (
    RagDocumentOut,
    RagIngestRequest,
    RagIngestResponse,
    RagSearchHit,
    RagSearchRequest,
    RagValidationOut,
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


@router.post("/upload", response_model=RagIngestResponse)
def upload(
    file: UploadFile = File(...),
    title: str | None = Form(None),
    subject_id: int | None = Form(None),
    level: str | None = Form(None),
    chapter: str | None = Form(None),
    db: Session = Depends(get_db),
    embedder: EmbeddingProvider = Depends(get_embedder),
    _: dict = Depends(get_current_user),
) -> RagIngestResponse:
    """Ingère un fichier de cours (MD/TXT/PDF) en statut `pending`.

    Une source uploadée par Papa n'alimente le RAG qu'après validation manuelle
    (cf. règle CLAUDE.md : relecture humaine des contenus scolaires)."""
    raw = file.file.read()
    try:
        text = extract_text(file.filename or "", raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    req = RagIngestRequest(
        title=(title or file.filename or "Document sans titre").strip(),
        text=text,
        subject_id=subject_id,
        source_type="papa_course",
        level=level,
        chapter=chapter,
    )
    document, chunks = service.ingest_document(db, embedder, req, validation_status="pending")
    return RagIngestResponse(document_id=document.id, chunks=chunks)


@router.post("/documents/{document_id}/validate", response_model=RagValidationOut)
def validate_document(
    document_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> RagValidationOut:
    document = service.set_validation(db, document_id, "validated")
    if document is None:
        raise HTTPException(status_code=404, detail="Document introuvable")
    return RagValidationOut(document_id=document.id, validation_status=document.validation_status)


@router.post("/documents/{document_id}/reject", response_model=RagValidationOut)
def reject_document(
    document_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> RagValidationOut:
    document = service.set_validation(db, document_id, "rejected")
    if document is None:
        raise HTTPException(status_code=404, detail="Document introuvable")
    return RagValidationOut(document_id=document.id, validation_status=document.validation_status)


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
