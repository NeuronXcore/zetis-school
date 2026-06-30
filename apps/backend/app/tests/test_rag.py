"""Tests RAG hors-ligne (SQLite + embedder factice).

La recherche cosinus (`<=>`) est spécifique à Postgres/pgvector et n'est pas
exécutée ici ; elle est vérifiée en intégration live. Ces tests couvrent le
découpage, l'ingestion vectorisée, les endpoints, et la couture explain (qui
doit rester [] sans source — zéro appel embeddings)."""

from sqlalchemy import func, select

import app.db.models as m
from app.modules.rag.chunking import chunk_text


def test_chunk_text_groups_and_splits() -> None:
    text = "Para un.\n\nPara deux.\n\n" + ("x" * 1000)
    chunks = chunk_text(text, max_chars=800)
    assert len(chunks) >= 2
    assert all(len(c) <= 800 for c in chunks)
    assert "Para un." in chunks[0]


def test_ingest_creates_document_and_chunks(client_db) -> None:
    client, _ = client_db
    # Deux paragraphes courts → fusionnés en 1 chunk ; un long → 2nd chunk.
    body = {
        "title": "Cours nombres relatifs",
        "text": "Les nombres relatifs sont positifs ou négatifs.\n\n" + ("Détail. " * 200),
        "subject_id": 1,
        "level": "4e",
        "chapter": "Nombres relatifs",
    }
    res = client.post("/api/rag/documents", json=body)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["document_id"] > 0
    assert data["chunks"] >= 2

    listed = client.get("/api/rag/documents").json()
    assert listed[0]["title"] == "Cours nombres relatifs"
    assert listed[0]["chunks"] == data["chunks"]
    assert listed[0]["validation_status"] == "validated"


def test_ingested_chunks_have_embeddings(client_db) -> None:
    client, Session = client_db
    client.post(
        "/api/rag/documents",
        json={"title": "C", "text": "Un paragraphe.", "subject_id": 1},
    )
    with Session() as db:
        chunk = db.scalar(select(m.RagChunk))
        assert chunk is not None
        assert chunk.embedding is not None
        assert chunk.subject_id == 1


def test_explain_without_sources_still_returns_job(client_db) -> None:
    # Aucune source RAG : le contexte est [] (sans appel embeddings) et le contrat tient.
    client, Session = client_db
    res = client.post("/api/ai/eli5/explain", json={"skill_id": 1})
    assert res.status_code == 200, res.text
    payload = res.json()
    assert "job_id" in payload and payload["status"] == "succeeded"
    with Session() as db:
        assert db.scalar(select(func.count()).select_from(m.RagChunk)) == 0
