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
    assert client.post(f"/api/chapters/{chapter_id}/extend-lessons").status_code == 403
    assert client.get(f"/api/chapters/{chapter_id}/lessons").status_code == 403
    assert client.post(f"/api/chapters/{chapter_id}/lessons", json={"title": "X"}).status_code == 403
    assert client.post(
        f"/api/chapters/{chapter_id}/lessons/reorder", json={"lesson_ids": [1]}
    ).status_code == 403
    assert client.patch("/api/lessons/1", json={}).status_code == 403
    assert client.post("/api/lessons/1/validate").status_code == 403
    assert client.post("/api/lessons/1/reject").status_code == 403
    assert client.post("/api/lessons/1/generate-content").status_code == 403
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


def test_generate_lesson_content_flow(client_db) -> None:
    """Rédaction du cours : `content` null → rempli (moteur local via conftest) ;
    409 sur leçon archivée ; 404 sur leçon inconnue."""
    client, Session = client_db
    _as_papa()
    chapter_id = _seed_validated_chapter(Session)
    lessons = client.post(f"/api/chapters/{chapter_id}/generate-lessons").json()
    first_id = lessons[0]["id"]
    assert lessons[0]["content"] is None  # la passe 2 ne rédige pas le cours

    res = client.post(f"/api/lessons/{first_id}/generate-content")
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == first_id
    assert body["content"] and "## Mini-exercices" in body["content"]
    assert body["status"] == "draft"  # la rédaction ne valide pas la leçon

    # Le GET liste transporte désormais le cours.
    listed = client.get(f"/api/chapters/{chapter_id}/lessons").json()
    assert next(l for l in listed if l["id"] == first_id)["content"] == body["content"]

    # Leçon archivée : hors du flux → 409.
    second_id = lessons[1]["id"]
    client.post(f"/api/lessons/{second_id}/reject")
    assert client.post(f"/api/lessons/{second_id}/generate-content").status_code == 409

    assert client.post("/api/lessons/9999/generate-content").status_code == 404


def test_extend_lessons_appends_without_touching_existing(client_db) -> None:
    """Extension : rien n'est supprimé (brouillons inclus), les nouvelles s'ajoutent
    APRÈS l'existant, et les doublons de titre sont écartés (filet anti-doublon)."""
    client, Session = client_db
    _as_papa()
    chapter_id = _seed_validated_chapter(Session)

    # Chapitre avec UNE leçon manuelle : l'extension ajoute les 3 leçons du fake après.
    manual = client.post(
        f"/api/chapters/{chapter_id}/lessons", json={"title": "Leçon de Papa"}
    ).json()
    res = client.post(f"/api/chapters/{chapter_id}/extend-lessons")
    assert res.status_code == 201
    extended = res.json()
    assert len(extended) == 4
    assert extended[0]["id"] == manual["id"]  # l'existant garde sa place
    assert all(l["created_by"] == "ai" and l["status"] == "draft" for l in extended[1:])

    # Ré-extension avec la même sortie fake : titres tous déjà présents → AUCUN ajout,
    # AUCUNE suppression (mêmes ids — les brouillons ne sont pas remplacés, ≠ passe 2).
    res = client.post(f"/api/chapters/{chapter_id}/extend-lessons")
    assert res.status_code == 201
    again = res.json()
    assert [l["id"] for l in again] == [l["id"] for l in extended]

    # Même précondition que la passe 2 : chapitre ni validé ni manuel → 409.
    with Session() as db:
        chapter = db.get(m.Chapter, chapter_id)
        chapter.validation_status = "pending"
        db.commit()
    assert client.post(f"/api/chapters/{chapter_id}/extend-lessons").status_code == 409
    # Garde parent (conftest = child par défaut sur une nouvelle app… ici déjà papa) :
    # couverte par test_lesson_routes_are_parent_only pour les routes leçons.


def test_content_audit_and_manual_edit_flow(client_db) -> None:
    """Provenance du cours : 'ai' au premier write IA, 'parent' sur édition Papa ;
    `created_*` posés une fois, `updated_*` à chaque write ; le statut de la leçon
    ne bouge jamais sur une édition de cours (Papa est l'autorité de validation)."""
    client, Session = client_db
    _as_papa()
    chapter_id = _seed_validated_chapter(Session)
    lessons = client.post(f"/api/chapters/{chapter_id}/generate-lessons").json()
    first_id = lessons[0]["id"]
    assert lessons[0]["content_created_at"] is None  # pas encore de cours

    # Rédaction IA : audit 'ai' posé (created + updated).
    body = client.post(f"/api/lessons/{first_id}/generate-content").json()
    assert body["content_created_by"] == "ai"
    assert body["content_updated_by"] == "ai"
    assert body["content_created_at"] and body["content_updated_at"]
    ai_created_at = body["content_created_at"]

    # Édition manuelle : même scrub que la rédaction IA, created conservé ('ai'),
    # updated repris par 'parent'.
    res = client.patch(
        f"/api/lessons/{first_id}",
        json={"content": "# Mon cours\n\nAvant<br>après <div>bloc</div> et x<y intact."},
    )
    assert res.status_code == 200
    patched = res.json()
    assert "<br>" not in patched["content"] and "<div>" not in patched["content"]
    assert "x<y intact" in patched["content"]  # liste fermée : les maths survivent
    assert patched["content_created_by"] == "ai"
    assert patched["content_created_at"] == ai_created_at
    assert patched["content_updated_by"] == "parent"
    assert patched["status"] == "draft"  # l'édition ne (dé)valide pas

    # Leçon validée : l'édition manuelle du cours ne change pas le statut.
    client.post(f"/api/lessons/{first_id}/validate")
    res = client.patch(f"/api/lessons/{first_id}", json={"content": "# V2"})
    assert res.status_code == 200
    assert res.json()["status"] == "validated"

    # PATCH sans `content` : cours et provenance intacts.
    res = client.patch(f"/api/lessons/{first_id}", json={"title": "Renommée"})
    assert res.json()["content"] == "# V2"
    assert res.json()["content_updated_by"] == "parent"

    # Régénération IA après édition manuelle : created conservé, updated repasse à 'ai'.
    regen = client.post(f"/api/lessons/{first_id}/generate-content").json()
    assert regen["content_created_by"] == "ai"
    assert regen["content_created_at"] == ai_created_at
    assert regen["content_updated_by"] == "ai"

    # Écriture manuelle d'un cours inexistant : created = 'parent'.
    third_id = lessons[2]["id"]
    res = client.patch(f"/api/lessons/{third_id}", json={"content": "Cours écrit à la main."})
    assert res.status_code == 200
    assert res.json()["content_created_by"] == "parent"
    assert res.json()["content_updated_by"] == "parent"

    # Cours vide : refusé (min_length pydantic, puis vide après scrub).
    assert client.patch(f"/api/lessons/{first_id}", json={"content": ""}).status_code == 422
    assert (
        client.patch(f"/api/lessons/{first_id}", json={"content": "<div></div>"}).status_code
        == 422
    )
