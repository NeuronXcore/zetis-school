"""Tests RAG hors-ligne (SQLite + embedder factice).

La recherche cosinus (`<=>`) est spécifique à Postgres/pgvector et n'est pas
exécutée ici ; elle est vérifiée en intégration live. Ces tests couvrent le
découpage, l'ingestion vectorisée, les endpoints, et la couture explain (qui
doit rester [] sans source — zéro appel embeddings)."""

import pytest
from sqlalchemy import func, select

import app.db.models as m
from app.modules.rag.chunking import chunk_text
from app.modules.rag.extract import extract_text


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


def test_extract_text_decodes_md_and_rejects_unknown() -> None:
    assert "Chapitre 1" in extract_text("cours.md", b"# Chapitre 1\n\nTexte")
    assert "brut" in extract_text("notes.txt", "texte brut".encode("utf-8"))
    with pytest.raises(ValueError):
        extract_text("image.png", b"\x89PNG")
    with pytest.raises(ValueError):
        extract_text("vide.txt", b"   ")


def test_upload_lands_pending_and_is_not_retrievable(client_db) -> None:
    # Un fichier uploadé par Papa reste `pending` : invisible du RAG tant que non validé.
    client, Session = client_db
    res = client.post(
        "/api/rag/upload",
        files={"file": ("cours.md", b"# Nombres relatifs\n\nUn entier signe.", "text/markdown")},
        data={"subject_id": "1", "level": "4e"},
    )
    assert res.status_code == 200, res.text
    doc_id = res.json()["document_id"]

    listed = client.get("/api/rag/documents").json()
    assert listed[0]["validation_status"] == "pending"
    with Session() as db:
        statuses = {
            c.validation_status for c in db.scalars(select(m.RagChunk).where(m.RagChunk.document_id == doc_id))
        }
        assert statuses == {"pending"}


def test_validate_then_reject_syncs_document_and_chunks(client_db) -> None:
    client, Session = client_db
    doc_id = client.post(
        "/api/rag/upload",
        files={"file": ("c.txt", b"Une notion de cours.", "text/plain")},
    ).json()["document_id"]

    validated = client.post(f"/api/rag/documents/{doc_id}/validate")
    assert validated.status_code == 200
    assert validated.json()["validation_status"] == "validated"
    with Session() as db:
        assert all(
            c.validation_status == "validated"
            for c in db.scalars(select(m.RagChunk).where(m.RagChunk.document_id == doc_id))
        )

    rejected = client.post(f"/api/rag/documents/{doc_id}/reject")
    assert rejected.json()["validation_status"] == "rejected"

    missing = client.post("/api/rag/documents/9999/validate")
    assert missing.status_code == 404


def test_explain_without_sources_still_returns_job(client_db) -> None:
    # Aucune source RAG : le contexte est [] (sans appel embeddings) et le contrat tient.
    client, Session = client_db
    res = client.post("/api/ai/eli5/explain", json={"skill_id": 1})
    assert res.status_code == 200, res.text
    payload = res.json()
    assert "job_id" in payload and payload["status"] == "succeeded"
    with Session() as db:
        assert db.scalar(select(func.count()).select_from(m.RagChunk)) == 0
