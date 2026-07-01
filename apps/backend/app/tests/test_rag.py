"""Tests RAG hors-ligne (SQLite + embedder factice).

La recherche cosinus (`<=>`) est spécifique à Postgres/pgvector et n'est pas
exécutée ici ; elle est vérifiée en intégration live. Ces tests couvrent le
découpage, l'ingestion vectorisée, les endpoints, et la couture explain (qui
doit rester [] sans source — zéro appel embeddings)."""

import pytest
from sqlalchemy import func, select

import app.db.models as m
from app.main import app
from app.modules.rag.chunking import chunk_text
from app.modules.rag.extract import extract_text
from app.modules.rag.transcript import get_transcript_fetcher, validate_video_url
from app.tests.fakes import FakeTranscriptFetcher


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


def test_clip_lands_pending_and_keeps_provenance(client_db) -> None:
    # Une capture web (extension zetis-clip) reste `pending` : relecture Papa obligatoire.
    client, Session = client_db
    res = client.post(
        "/api/rag/clip",
        json={
            "title": "Théorème de Pythagore — Wikipédia",
            "text": "Dans un triangle rectangle, le carré de l'hypoténuse...",
            "source_url": "https://fr.wikipedia.org/wiki/Theoreme_de_Pythagore",
            "subject_id": 1,
            "chapter": "Géométrie",
        },
    )
    assert res.status_code == 200, res.text
    doc_id = res.json()["document_id"]
    assert res.json()["chunks"] >= 1

    listed = client.get("/api/rag/documents").json()
    assert listed[0]["validation_status"] == "pending"
    assert listed[0]["source_type"] == "web_clip"
    with Session() as db:
        chunk = db.scalar(select(m.RagChunk).where(m.RagChunk.document_id == doc_id))
        assert chunk is not None
        assert chunk.validation_status == "pending"
        # La provenance (URL) est conservée dans le contenu, sans colonne dédiée.
        assert "fr.wikipedia.org" in chunk.content


def test_clip_rejects_empty_text(client_db) -> None:
    client, _ = client_db
    res = client.post("/api/rag/clip", json={"title": "Vide", "text": "   "})
    assert res.status_code == 400, res.text


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


def test_validate_video_url_extracts_id_and_rejects_bad_hosts() -> None:
    assert validate_video_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert validate_video_url("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    with pytest.raises(ValueError):
        validate_video_url("https://vimeo.com/12345")  # hôte hors allowlist
    with pytest.raises(ValueError):
        validate_video_url("ftp://youtube.com/watch?v=x")  # schéma non http(s)
    with pytest.raises(ValueError):
        validate_video_url("http://127.0.0.1/watch?v=x")  # IP littérale hors allowlist


def test_clip_url_ingests_transcript_pending(client_db) -> None:
    # Transcription (récupérateur mocké) → ingestion `pending`, langue conservée.
    client, Session = client_db
    res = client.post(
        "/api/rag/clip-url",
        json={
            "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "title": "Cours d'anglais — present perfect",
            "subject_id": 1,
            "chapter": "Present perfect",
        },
    )
    assert res.status_code == 200, res.text
    doc_id = res.json()["document_id"]
    assert res.json()["chunks"] >= 1

    listed = client.get("/api/rag/documents").json()
    assert listed[0]["source_type"] == "video_transcript"
    assert listed[0]["validation_status"] == "pending"
    with Session() as db:
        chunk = db.scalar(select(m.RagChunk).where(m.RagChunk.document_id == doc_id))
        assert chunk is not None
        assert chunk.validation_status == "pending"
        assert "youtube.com" in chunk.content  # provenance
        assert "Langue : en" in chunk.content  # langue d'origine (pas de traduction)


def test_clip_url_rejects_non_allowlisted_host(client_db) -> None:
    client, _ = client_db
    res = client.post("/api/rag/clip-url", json={"url": "https://vimeo.com/12345"})
    assert res.status_code == 400, res.text
    assert res.json()["detail"]["code"] == "unsupported_url"


def test_clip_url_reports_unavailable_transcript(client_db) -> None:
    # Transcription désactivée → 400 code `transcript_unavailable` (déclenche le repli client).
    client, _ = client_db
    app.dependency_overrides[get_transcript_fetcher] = lambda: FakeTranscriptFetcher(available=False)
    res = client.post("/api/rag/clip-url", json={"url": "https://youtu.be/dQw4w9WgXcQ"})
    assert res.status_code == 400, res.text
    assert res.json()["detail"]["code"] == "transcript_unavailable"


def test_explain_without_sources_still_returns_job(client_db) -> None:
    # Aucune source RAG : le contexte est [] (sans appel embeddings) et le contrat tient.
    client, Session = client_db
    res = client.post("/api/ai/eli5/explain", json={"skill_id": 1})
    assert res.status_code == 200, res.text
    payload = res.json()
    assert "job_id" in payload and payload["status"] == "succeeded"
    with Session() as db:
        assert db.scalar(select(func.count()).select_from(m.RagChunk)) == 0
