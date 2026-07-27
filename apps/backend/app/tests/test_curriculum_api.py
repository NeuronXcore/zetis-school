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
    assert client.get("/api/school-years/active/subjects").status_code == 403
    assert client.post(f"/api/school-year-subjects/{sys_id}/chapters/validate-all").status_code == 403
    assert client.post("/api/school-years/active/chapters/validate-all").status_code == 403
    assert client.post(f"/api/school-year-subjects/{sys_id}/generate-chapters").status_code == 403
    assert client.post(f"/api/school-year-subjects/{sys_id}/chapters", json={"name": "X"}).status_code == 403
    assert client.patch("/api/chapters/1", json={}).status_code == 403
    assert client.delete("/api/chapters/1").status_code == 403


def test_active_school_year_subjects(client_db) -> None:
    """Lecture Slice B : année active + `school_year_subject_id` de ses matières."""
    client, Session = client_db
    _as_papa()

    # Sans année active → 404 explicite (l'UI affiche le detail).
    assert client.get("/api/school-years/active/subjects").status_code == 404

    sys_id = _seed_year_subject(Session)
    res = client.get("/api/school-years/active/subjects")
    assert res.status_code == 200
    year = res.json()
    assert year["label"] == "2026-2027"
    assert year["level"] == "4e"
    assert [s["id"] for s in year["subjects"]] == [sys_id]
    subject = year["subjects"][0]
    assert subject["subject_name"]
    assert subject["subject_slug"]


def test_validate_all_subject_batch(client_db) -> None:
    """Lot matière : `pending` → `validated` ; `rejected` et `manual` intouchés."""
    client, Session = client_db
    _as_papa()
    sys_id = _seed_year_subject(Session)

    # 3 générés pending (FakeLLMProvider) + 1 manuel (validé d'office).
    client.post(f"/api/school-year-subjects/{sys_id}/generate-chapters")
    client.post(f"/api/school-year-subjects/{sys_id}/chapters", json={"name": "Manuel"})
    chapters = client.get(f"/api/school-year-subjects/{sys_id}/chapters").json()
    # Un généré rejeté explicitement : le lot ne doit pas le repêcher.
    rejected_id = chapters[0]["id"]
    client.patch(f"/api/chapters/{rejected_id}", json={"validation_action": "reject"})

    res = client.post(f"/api/school-year-subjects/{sys_id}/chapters/validate-all")
    assert res.status_code == 200
    assert res.json() == {"validated_count": 2}  # 3 pending - 1 rejeté

    after = {c["id"]: c["validation_status"] for c in
             client.get(f"/api/school-year-subjects/{sys_id}/chapters").json()}
    assert after[rejected_id] == "rejected"
    assert sorted(after.values()) == ["rejected", "validated", "validated", "validated"]

    # Rejouer le lot : plus rien à valider. 404 propre sur matière inconnue.
    assert client.post(f"/api/school-year-subjects/{sys_id}/chapters/validate-all").json() == {
        "validated_count": 0
    }
    assert client.post("/api/school-year-subjects/9999/chapters/validate-all").status_code == 404


def test_validate_all_active_year_batch(client_db) -> None:
    """Lot année : toutes les matières de l'année active d'un coup."""
    client, Session = client_db
    _as_papa()

    # Sans année active → 404 explicite.
    assert client.post("/api/school-years/active/chapters/validate-all").status_code == 404

    sys_id = _seed_year_subject(Session)
    # Une seconde matière sur la même année, avec ses propres chapitres générés.
    with Session() as db:
        year = db.scalars(select(m.SchoolYear)).first()
        subject2 = m.Subject(name="Physique", slug="physique")
        db.add(subject2)
        db.flush()
        sys2 = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject2.id)
        db.add(sys2)
        db.commit()
        sys2_id = sys2.id
    client.post(f"/api/school-year-subjects/{sys_id}/generate-chapters")
    client.post(f"/api/school-year-subjects/{sys2_id}/generate-chapters")

    res = client.post("/api/school-years/active/chapters/validate-all")
    assert res.status_code == 200
    assert res.json() == {"validated_count": 6}  # 3 pending × 2 matières
    for sid in (sys_id, sys2_id):
        chapters = client.get(f"/api/school-year-subjects/{sid}/chapters").json()
        assert all(c["validation_status"] == "validated" for c in chapters)


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
    # 13-bis : métadonnées dépliées en premier niveau (jamais de `metadata_json` exposé),
    # et description = texte humain sans sérialisation.
    first = chapters[0]
    assert first["themes"] == ["Nombres et calculs"]
    assert first["suggested_class"] == "4e"
    assert first["repartition"] == "officielle"
    assert "metadata_json" not in first
    assert "themes" not in (first["description"] or "")

    # Création manuelle → validée d'office ; sans métadonnées → champs null, pas d'erreur.
    res = client.post(
        f"/api/school-year-subjects/{sys_id}/chapters",
        json={"name": "Chapitre de Papa", "description": "Ajout manuel."},
    )
    assert res.status_code == 201
    manual = res.json()
    assert manual["source"] == "manual"
    assert manual["validation_status"] == "validated"
    assert manual["sort_order"] == 3  # append après les générés
    assert manual["themes"] is None
    assert manual["suggested_class"] is None
    assert manual["repartition"] is None

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
