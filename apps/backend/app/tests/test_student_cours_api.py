"""Tests HTTP des routes élève (page Cours de Massimo) — lecture seule, validé
uniquement, filtrage serveur (ADR-0009 §9 : rien n'atteint Massimo avant validation).

Le conftest authentifie en rôle `child` par défaut : ces routes doivent lui répondre
200 (contrairement aux routes Papa `require_parent`).
"""

from sqlalchemy import select

import app.db.models as m
from app.modules.curriculum.service import create_manual_lesson, generate_lesson_content
from app.tests.fakes import FakeLLMProvider


def _seed_referential(Session) -> dict:
    """Année active 4e + matière seedée + 2 chapitres (validé / pending) + leçons
    dans tous les états sur le chapitre validé. → ids utiles."""
    with Session() as db:
        profile = db.scalars(select(m.StudentProfile)).first()
        subject = db.scalars(select(m.Subject)).first()
        year = m.SchoolYear(student_id=profile.id, label="2026-2027", level="4e", status="active")
        db.add(year)
        db.flush()
        sys_row = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject.id)
        db.add(sys_row)
        db.flush()
        validated = m.Chapter(
            school_year_subject_id=sys_row.id,
            name="Nombres relatifs : opérations",
            description="Additionner et multiplier des relatifs.",
            sort_order=0,
            source="generated",
            validation_status="validated",
            program_version="2020",
        )
        pending = m.Chapter(
            school_year_subject_id=sys_row.id,
            name="Chapitre pas encore validé",
            sort_order=1,
            source="generated",
            validation_status="pending",
            program_version="2020",
        )
        db.add_all([validated, pending])
        db.flush()

        # Leçon validée AVEC cours (rédaction locale via fake), validée SANS cours,
        # brouillon, archivée — seules les deux premières doivent sortir.
        with_content = create_manual_lesson(db, validated.id, title="Règle des signes")
        generate_lesson_content(db, FakeLLMProvider(), with_content.id)
        # La rédaction remet la leçon en `draft` (gate du cours canonique, addendum
        # ADR-0009 §A) : Papa relit le cours puis la revalide → cours validé visible.
        with_content.status = "validated"
        without_content = create_manual_lesson(db, validated.id, title="Produits de relatifs")
        draft = create_manual_lesson(db, validated.id, title="Brouillon caché")
        draft.status = "draft"
        archived = create_manual_lesson(db, validated.id, title="Archivée cachée")
        archived.status = "archived"
        db.commit()
        return {
            "slug": subject.slug,
            "validated_chapter": validated.id,
            "with_content": with_content.id,
            "without_content": without_content.id,
            "draft": draft.id,
        }


def test_student_cours_filters_to_validated_only(client_db) -> None:
    client, Session = client_db  # rôle child (conftest) — doit passer
    ids = _seed_referential(Session)

    res = client.get(f"/api/student/cours/{ids['slug']}")
    assert res.status_code == 200
    body = res.json()
    assert body["level"] == "4e"

    # Un seul chapitre (le validé) ; le pending n'existe pas pour Massimo.
    assert [c["id"] for c in body["chapters"]] == [ids["validated_chapter"]]
    lessons = body["chapters"][0]["lessons"]
    # Seules les leçons validées, drafts/archivées invisibles.
    assert {l["title"] for l in lessons} == {"Règle des signes", "Produits de relatifs"}
    by_title = {l["title"]: l for l in lessons}
    assert by_title["Règle des signes"]["has_content"] is True
    assert by_title["Produits de relatifs"]["has_content"] is False
    # Jamais le markdown ni les champs d'atelier dans la liste.
    assert "content" not in lessons[0]
    assert "created_by" not in lessons[0] and "status" not in lessons[0]


def test_student_lesson_cours_serves_validated_content_only(client_db) -> None:
    client, Session = client_db
    ids = _seed_referential(Session)

    res = client.get(f"/api/student/lessons/{ids['with_content']}/cours")
    assert res.status_code == 200
    assert "## Mini-exercices" in res.json()["content"]

    # 404 indiscernables : sans cours, brouillon, inexistante.
    assert client.get(f"/api/student/lessons/{ids['without_content']}/cours").status_code == 404
    assert client.get(f"/api/student/lessons/{ids['draft']}/cours").status_code == 404
    assert client.get("/api/student/lessons/99999/cours").status_code == 404


def test_student_cours_404_on_unknown_subject(client_db) -> None:
    client, Session = client_db
    _seed_referential(Session)
    assert client.get("/api/student/cours/matiere-inconnue").status_code == 404
