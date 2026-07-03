"""Tests HTTP du référentiel — passe 2 (Lot 2 Slice A) : garde parent + CRUD leçons."""

from sqlalchemy import select

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user


def _as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def _seed_validated_chapter(Session) -> int:
    """Année 4e + matière seedée + chapitre généré VALIDÉ (éligible passe 2)."""
    with Session() as db:
        profile = db.scalars(select(m.StudentProfile)).first()
        subject = db.scalars(select(m.Subject)).first()
        year = m.SchoolYear(student_id=profile.id, label="2026-2027", level="4e")
        db.add(year)
        db.flush()
        sys_row = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject.id)
        db.add(sys_row)
        db.flush()
        chapter = m.Chapter(
            school_year_subject_id=sys_row.id,
            name="Nombres relatifs : opérations",
            sort_order=0,
            source="generated",
            validation_status="validated",
            program_version="2020",
            metadata_json={"themes": ["Nombres et calculs"]},
        )
        db.add(chapter)
        db.commit()
        return chapter.id


def test_lesson_routes_are_parent_only(client_db) -> None:
    client, Session = client_db  # conftest = rôle child
    chapter_id = _seed_validated_chapter(Session)
    assert client.post(f"/api/chapters/{chapter_id}/generate-lessons").status_code == 403
    assert client.get(f"/api/chapters/{chapter_id}/lessons").status_code == 403
    assert client.post(f"/api/chapters/{chapter_id}/lessons", json={"title": "X"}).status_code == 403
    assert client.post(
        f"/api/chapters/{chapter_id}/lessons/reorder", json={"lesson_ids": [1]}
    ).status_code == 403
    assert client.patch("/api/lessons/1", json={}).status_code == 403
    assert client.post("/api/lessons/1/validate").status_code == 403
    assert client.post("/api/lessons/1/reject").status_code == 403
    assert client.delete("/api/lessons/1").status_code == 403


def test_generate_refused_on_non_eligible_chapter(client_db) -> None:
    """Chapitre généré non validé → 409 avec message métier clair (ADR-0009 §1)."""
    client, Session = client_db
    _as_papa()
    chapter_id = _seed_validated_chapter(Session)
    client.patch(f"/api/chapters/{chapter_id}", json={"validation_action": "reject"})
    res = client.post(f"/api/chapters/{chapter_id}/generate-lessons")
    assert res.status_code == 409
    assert "valide" in res.json()["detail"].lower()


def test_generate_then_lesson_crud_flow(client_db) -> None:
    client, Session = client_db
    _as_papa()
    chapter_id = _seed_validated_chapter(Session)

    # Passe 2 : génération (FakeLLMProvider via conftest → 3 leçons déterministes).
    res = client.post(f"/api/chapters/{chapter_id}/generate-lessons")
    assert res.status_code == 201
    lessons = res.json()
    assert len(lessons) == 3
    assert all(l["created_by"] == "ai" and l["status"] == "draft" for l in lessons)
    assert all(l["program_version"] == "2020" for l in lessons)
    # Notions dépliées (intitulé + skill_id), jamais la liaison brute.
    first = lessons[0]
    assert {n["name"] for n in first["notions"]} == {"Nombres relatifs", "Règle des signes"}
    assert all(isinstance(n["skill_id"], int) for n in first["notions"])
    assert "skill_ids" not in first and "lesson_skills" not in first
    # La Skill seedée par conftest est réutilisée (même id), pas dupliquée.
    with Session() as db:
        seeded = db.scalars(select(m.Skill).where(m.Skill.name == "Nombres relatifs")).all()
        assert len(seeded) == 1

    # GET : liste ordonnée du chapitre.
    res = client.get(f"/api/chapters/{chapter_id}/lessons")
    assert res.status_code == 200
    assert [l["id"] for l in res.json()] == [l["id"] for l in lessons]

    # Création manuelle → parent + validated d'office, notions optionnelles upsertées.
    res = client.post(
        f"/api/chapters/{chapter_id}/lessons",
        json={"title": "Leçon de Papa", "summary": "Ajout manuel.", "notions": ["Règle des signes"]},
    )
    assert res.status_code == 201
    manual = res.json()
    assert manual["created_by"] == "parent"
    assert manual["status"] == "validated"
    assert manual["sort_order"] == 3  # append après les générées
    assert manual["notions"][0]["name"] == "Règle des signes"

    # Validation unitaire : draft → validated ; rejouer → 409 (draft uniquement).
    first_id = lessons[0]["id"]
    res = client.post(f"/api/lessons/{first_id}/validate")
    assert res.status_code == 200
    assert res.json()["status"] == "validated"
    assert client.post(f"/api/lessons/{first_id}/validate").status_code == 409
    # Cascade indépendante (§3) : le chapitre n'a pas bougé.
    with Session() as db:
        assert db.get(m.Chapter, chapter_id).validation_status == "validated"

    # Rejet : draft → archived.
    second_id = lessons[1]["id"]
    res = client.post(f"/api/lessons/{second_id}/reject")
    assert res.status_code == 200
    assert res.json()["status"] == "archived"

    # PATCH : édition + remplacement des notions.
    res = client.patch(
        f"/api/lessons/{first_id}", json={"title": "Renommée", "notions": ["Nombres relatifs"]}
    )
    assert res.status_code == 200
    patched = res.json()
    assert patched["title"] == "Renommée"
    assert [n["name"] for n in patched["notions"]] == ["Nombres relatifs"]

    # Reorder : liste complète inversée.
    all_ids = [l["id"] for l in client.get(f"/api/chapters/{chapter_id}/lessons").json()]
    res = client.post(
        f"/api/chapters/{chapter_id}/lessons/reorder",
        json={"lesson_ids": list(reversed(all_ids))},
    )
    assert res.status_code == 200
    assert [l["id"] for l in res.json()] == list(reversed(all_ids))

    # DELETE.
    assert client.delete(f"/api/lessons/{manual['id']}").status_code == 204
    assert len(client.get(f"/api/chapters/{chapter_id}/lessons").json()) == 3

    # 404 propres.
    assert client.post("/api/chapters/9999/generate-lessons").status_code == 404
    assert client.get("/api/chapters/9999/lessons").status_code == 404
    assert client.patch("/api/lessons/9999", json={}).status_code == 404
    assert client.delete("/api/lessons/9999").status_code == 404
