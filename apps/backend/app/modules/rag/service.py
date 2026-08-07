"""Service RAG : ingestion vectorisée + récupération sémantique (pgvector cosinus).

La récupération distingue les sources (CLAUDE.md) : seuls les chunks `validated`
ou `official` sont renvoyés. La couture `retrieve_for_skill` court-circuite sans
appeler l'embedder quand aucune source n'existe (tests hors-ligne, zéro ollama)."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import RagChunk, RagDocument, Skill
from app.modules.ai.provider import EmbeddingProvider
from app.modules.rag.chunking import chunk_text
from app.modules.rag.schemas import RagIngestRequest

# Seuls ces statuts alimentent une explication (sources fiables).
_RETRIEVABLE = ("validated", "official")


def ingest_document(
    db: Session,
    embedder: EmbeddingProvider,
    req: RagIngestRequest,
    *,
    validation_status: str = "validated",
) -> tuple[RagDocument, int]:
    """Ingère un document (texte → chunks vectorisés).

    `validation_status` par défaut `validated` (sources de confiance / officielles).
    Les fichiers uploadés par Papa passent `pending` et restent invisibles du RAG
    tant qu'ils ne sont pas validés à la main (règle CLAUDE.md)."""
    document = RagDocument(
        subject_id=req.subject_id,
        title=req.title,
        source_type=req.source_type,
        level=req.level,
        chapter=req.chapter,
        validation_status=validation_status,
        created_by="papa",
    )
    db.add(document)
    db.flush()

    pieces = chunk_text(req.text)
    vectors = embedder.embed(pieces) if pieces else []
    for index, (content, vector) in enumerate(zip(pieces, vectors)):
        db.add(
            RagChunk(
                document_id=document.id,
                subject_id=req.subject_id,
                chunk_index=index,
                content=content,
                level=req.level,
                chapter=req.chapter,
                source_type=req.source_type,
                validation_status=document.validation_status,
                embedding=vector,
            )
        )
    db.commit()
    db.refresh(document)
    return document, len(pieces)


# Statuts qu'un humain peut appliquer à une source via l'interface Papa.
_SETTABLE_STATUS = ("validated", "rejected", "pending")


def set_validation(db: Session, document_id: int, status: str) -> RagDocument | None:
    """Met à jour le statut de validation d'un document ET de ses chunks.

    Comme la récupération filtre sur le statut des chunks, les deux doivent rester
    synchronisés. Renvoie None si le document n'existe pas, lève ValueError si le
    statut est invalide."""
    if status not in _SETTABLE_STATUS:
        raise ValueError(f"Statut invalide : {status}. Attendu : {_SETTABLE_STATUS}")
    document = db.get(RagDocument, document_id)
    if document is None:
        return None
    document.validation_status = status
    for chunk in db.scalars(select(RagChunk).where(RagChunk.document_id == document_id)):
        chunk.validation_status = status
    db.commit()
    db.refresh(document)
    return document


def count_chunks(db: Session, document_id: int) -> int:
    return db.scalar(
        select(func.count()).select_from(RagChunk).where(RagChunk.document_id == document_id)
    ) or 0


def list_documents(db: Session) -> list[tuple[RagDocument, int]]:
    docs = list(db.scalars(select(RagDocument).order_by(RagDocument.id.desc())))
    return [(doc, count_chunks(db, doc.id)) for doc in docs]


def has_retrievable_chunks(db: Session, *, subject_id: int | None) -> bool:
    """Cette matière a-t-elle au moins un chunk **récupérable** (validé/officiel, vectorisé) ?

    Public depuis l'ADR-0042 : la production s'en sert pour dire **avant le clic** qu'une notion
    orpheline sans source ne pourra pas porter de quiz. Un second prédicat « qui donne le même
    résultat » serait la faute que l'addendum ADR-0024 nomme — un seul prédicat de disponibilité
    dans le dépôt.
    """
    stmt = select(func.count()).select_from(RagChunk).where(
        RagChunk.validation_status.in_(_RETRIEVABLE),
        RagChunk.embedding.isnot(None),
    )
    if subject_id is not None:
        stmt = stmt.where(RagChunk.subject_id == subject_id)
    return bool(db.scalar(stmt))


def search(
    db: Session,
    embedder: EmbeddingProvider,
    *,
    query: str,
    subject_id: int | None = None,
    k: int = 3,
) -> list[tuple[RagChunk, float]]:
    """Top-k chunks par distance cosinus (pgvector). [] si aucune source indexée."""
    if not has_retrievable_chunks(db, subject_id=subject_id):
        return []
    vector = embedder.embed([query])[0]
    distance = RagChunk.embedding.cosine_distance(vector)
    stmt = (
        select(RagChunk, distance.label("distance"))
        .where(
            RagChunk.validation_status.in_(_RETRIEVABLE),
            RagChunk.embedding.isnot(None),
        )
        .order_by(distance)
        .limit(k)
    )
    if subject_id is not None:
        stmt = stmt.where(RagChunk.subject_id == subject_id)
    return [(chunk, float(dist)) for chunk, dist in db.execute(stmt).all()]


def retrieve_for_skill(
    db: Session,
    embedder: EmbeddingProvider,
    *,
    skill_id: int,
    query: str,
    k: int = 3,
) -> list[str]:
    """Contexte RAG pour une notion : contenu des top-k chunks de sa matière.

    Renvoie [] sans toucher l'embedder si aucune source n'existe (couture explain)."""
    skill = db.get(Skill, skill_id)
    subject_id = skill.subject_id if skill is not None else None
    if not has_retrievable_chunks(db, subject_id=subject_id):
        return []
    # Sans question précise, on cherche sur le nom de la notion plutôt que sur une chaîne vide.
    effective_query = query.strip() or (skill.name if skill is not None else "")
    if not effective_query:
        return []
    hits = search(db, embedder, query=effective_query, subject_id=subject_id, k=k)
    return [chunk.content for chunk, _ in hits]
