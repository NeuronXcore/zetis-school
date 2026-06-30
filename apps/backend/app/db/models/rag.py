from pgvector.sqlalchemy import Vector
from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

# Dimension du modèle d'embeddings (nomic-embed-text → 768). Doit rester
# alignée avec settings.embed_dim et la colonne vector de la migration.
EMBED_DIM = 768


class RagDocument(Base, TimestampMixin):
    """Document de cours ingéré (source du RAG). Conserve la provenance et le
    statut de validation imposés par CLAUDE.md (sources officielles vs cours Papa…)."""

    __tablename__ = "rag_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(300))
    # source_type : official | papa_course | generated | massimo | quiz | diagnostic
    source_type: Mapped[str] = mapped_column(String(30), default="papa_course")
    level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    chapter: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # validation_status : validated | pending | rejected (seuls validated/official sont récupérés)
    validation_status: Mapped[str] = mapped_column(String(20), default="validated")
    created_by: Mapped[str] = mapped_column(String(20), default="papa")


class RagChunk(Base, TimestampMixin):
    """Fragment vectorisé d'un document. Chaque chunk porte ses métadonnées de
    récupération (matière, niveau, chapitre, type) — cf. règles RAG CLAUDE.md."""

    __tablename__ = "rag_chunks"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("rag_documents.id", ondelete="CASCADE"), index=True
    )
    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.id"), nullable=True)
    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    content: Mapped[str] = mapped_column(Text)
    level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    chapter: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source_type: Mapped[str] = mapped_column(String(30), default="papa_course")
    validation_status: Mapped[str] = mapped_column(String(20), default="validated")
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBED_DIM), nullable=True)


# Index ANN cosinus (ivfflat) — créé via migration sur Postgres ; ignoré sur SQLite (tests).
Index(
    "ix_rag_chunks_embedding_cosine",
    RagChunk.embedding,
    postgresql_using="ivfflat",
    postgresql_with={"lists": 100},
    postgresql_ops={"embedding": "vector_cosine_ops"},
)
