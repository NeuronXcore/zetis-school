"""Tests du module subjects (Matières & programmes Papa) : Subject → Theme → Chapter."""

from sqlalchemy.orm import sessionmaker

from fastapi.testclient import TestClient


def test_create_subject_generates_slug_and_lists(
    client_db: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_db
    res = client.post("/api/subjects", json={"name": "Éducation Musicale", "icon": "🎵"})
    assert res.status_code == 201
    body = res.json()
    assert body["slug"] == "education-musicale"  # accents retirés, espaces -> tirets
    assert body["theme_count"] == 0 and body["chapter_count"] == 0

    listing = client.get("/api/subjects").json()
    assert any(s["slug"] == "education-musicale" for s in listing)


def test_slug_uniqueness_on_duplicate_name(
    client_db: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_db
    first = client.post("/api/subjects", json={"name": "Latin"}).json()
    second = client.post("/api/subjects", json={"name": "Latin"}).json()
    assert first["slug"] == "latin"
    assert second["slug"] == "latin-2"  # collision -> suffixe


def test_theme_and_chapter_flow_with_counts(
    client_db: tuple[TestClient, sessionmaker],
) -> None:
    client, _ = client_db
    subject_id = client.post("/api/subjects", json={"name": "Physique-Chimie"}).json()["id"]

    theme = client.post(f"/api/subjects/{subject_id}/themes", json={"name": "Le rythme"})
    assert theme.status_code == 201
    theme_id = theme.json()["id"]

    chapter = client.post(
        f"/api/subjects/themes/{theme_id}/chapters",
        json={"name": "La pulsation", "period": "Trimestre 1"},
    )
    assert chapter.status_code == 201
    assert chapter.json()["status"] == "planned"

    detail = client.get(f"/api/subjects/{subject_id}").json()
    assert detail["theme_count"] == 1 and detail["chapter_count"] == 1
    assert detail["themes"][0]["chapters"][0]["name"] == "La pulsation"


def test_missing_parents_return_404(client_db: tuple[TestClient, sessionmaker]) -> None:
    client, _ = client_db
    assert client.get("/api/subjects/999999").status_code == 404
    assert client.post("/api/subjects/999999/themes", json={"name": "x"}).status_code == 404
    assert (
        client.post("/api/subjects/themes/999999/chapters", json={"name": "x"}).status_code == 404
    )
