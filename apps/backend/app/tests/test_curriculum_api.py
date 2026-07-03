"""Tests HTTP du référentiel (Lot 1 Slice A) : garde rôle parent + CRUD chapitres."""

from sqlalchemy import select

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user


def _as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def _seed_year_subject(Session) -> int:
    with Session() as db:
        profile = db.scalars(select(m.StudentProfile)).first()
        subject = db.scalars(select(m.Subject)).first()
        year = m.SchoolYear(student_id=profile.id, label="2026-2027", level="4e")
        db.add(year)
        db.flush()
        sys_row = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject.id)
        db.add(sys_row)
        db.commit()
        return sys_row.id


def test_routes_are_parent_only(client_db) -> None:
    client, Session = client_db  # conftest = rôle child
    sys_id = _seed_year_subject(Session)
    assert client.post(f"/api/school-year-subjects/{sys_id}/generate-chapters").status_code == 403
    assert client.post(f"/api/school-year-subjects/{sys_id}/chapters", json={"name": "X"}).status_code == 403
    assert client.patch("/api/chapters/1", json={}).status_code == 403
    assert client.delete("/api/chapters/1").status_code == 403


def test_generate_then_crud_flow(client_db) -> None:
    client, Session = client_db
    _as_papa()
    sys_id = _seed_year_subject(Session)

    # Passe 1 : génération (FakeLLMProvider via conftest → 3 chapitres déterministes).
    res = client.post(f"/api/school-year-subjects/{sys_id}/generate-chapters")
    assert res.status_code == 201
    chapters = res.json()
    assert len(chapters) == 3
    assert all(c["source"] == "generated" and c["validation_status"] == "pending" for c in chapters)
    assert all(c["program_version"] == "2020" for c in chapters)

    # Création manuelle → validée d'office.
    res = client.post(
        f"/api/school-year-subjects/{sys_id}/chapters",
        json={"name": "Chapitre de Papa", "description": "Ajout manuel."},
    )
    assert res.status_code == 201
    manual = res.json()
    assert manual["source"] == "manual"
    assert manual["validation_status"] == "validated"
    assert manual["sort_order"] == 3  # append après les générés

    # PATCH : validation d'un chapitre généré, puis édition.
    first_id = chapters[0]["id"]
    res = client.patch(f"/api/chapters/{first_id}", json={"validation_action": "validate"})
    assert res.status_code == 200
    assert res.json()["validation_status"] == "validated"
    res = client.patch(f"/api/chapters/{first_id}", json={"name": "Renommé"})
    assert res.status_code == 200
    assert res.json()["name"] == "Renommé"

    # Reorder : liste complète inversée.
    res = client.get(f"/api/school-year-subjects/{sys_id}/chapters")
    all_ids = [c["id"] for c in res.json()]
    res = client.post(
        f"/api/school-year-subjects/{sys_id}/chapters/reorder",
        json={"chapter_ids": list(reversed(all_ids))},
    )
    assert res.status_code == 200
    assert [c["id"] for c in res.json()] == list(reversed(all_ids))

    # DELETE.
    res = client.delete(f"/api/chapters/{manual['id']}")
    assert res.status_code == 204
    res = client.get(f"/api/school-year-subjects/{sys_id}/chapters")
    assert len(res.json()) == 3

    # 404 propres.
    assert client.post("/api/school-year-subjects/9999/generate-chapters").status_code == 404
    assert client.patch("/api/chapters/9999", json={}).status_code == 404
