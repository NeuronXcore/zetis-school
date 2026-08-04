"""Tests du module subjects (Matières & programmes Papa) : Subject → Theme → Chapter."""

from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from fastapi.testclient import TestClient

import app.db.models as m


def _annee_active_avec(db, subject_id: int):
    """Une année active où CETTE matière est au programme.

    ⚠️ Précondition NOUVELLE depuis l'addendum ADR-0034 (« le trou trouvé en chemin ») : un chapitre
    créé sous un thème reçoit désormais AUSSI sa matière d'année. Sans elle, il n'aurait aucun chemin
    vers une année scolaire et serait invisible de la production, de la galaxie et de
    `canonical_context` — silencieusement.
    """
    etudiant = db.scalar(select(m.StudentProfile))
    annee = m.SchoolYear(
        student_id=etudiant.id, label="2026-2027", level="4e", status="active"
    )
    db.add(annee)
    db.flush()
    sys_row = m.SchoolYearSubject(school_year_id=annee.id, subject_id=subject_id)
    db.add(sys_row)
    db.commit()
    return annee, sys_row


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
    client, Session = client_db
    subject_id = client.post("/api/subjects", json={"name": "Physique-Chimie"}).json()["id"]
    with Session() as db:
        _annee_active_avec(db, subject_id)

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


# --- L'ancrage d'un chapitre créé sous un thème (addendum ADR-0034) -----------------------------
#
# ⚠️ Le défaut que ces trois verrous ferment n'était pas dans la DONNÉE, il était dans la PORTE :
# ce bouton fabriquait des chapitres sans matière d'année, `create_manual_lesson` acceptait
# n'importe quel `chapter_id`, et tout l'aval les ignorait EN SILENCE — aucune erreur, aucun test
# rouge, du contenu que personne n'atteint.


def test_un_chapitre_cree_sous_un_theme_est_ATTEIGNABLE(
    client_db: tuple[TestClient, sessionmaker],
) -> None:
    """🔒 LE verrou : pas « le chapitre existe », mais « le résolveur canonique le voit ».

    Vérifier `school_year_subject_id is not None` serait un test de colonne. Ce qui compte est que
    `lessons_by_skill` (ADR-0037) rende une leçon de ce chapitre : c'est lui qui décide ce que la
    production, la galaxie et `canonical_context` peuvent atteindre.
    """
    from app.modules.lesson_resolution import lessons_by_skill

    client, Session = client_db
    subject_id = client.post("/api/subjects", json={"name": "Physique-Chimie"}).json()["id"]
    with Session() as db:
        _annee_active_avec(db, subject_id)

    theme_id = client.post(
        f"/api/subjects/{subject_id}/themes", json={"name": "Le rythme"}
    ).json()["id"]
    chapitre = client.post(
        f"/api/subjects/themes/{theme_id}/chapters", json={"name": "La pulsation"}
    )
    assert chapitre.status_code == 201
    chapter_id = chapitre.json()["id"]

    with Session() as db:
        # Le chapitre doit être VALIDÉ pour entrer dans le périmètre du résolveur — c'est le cas
        # par défaut d'un chapitre écrit par Papa.
        chapitre_db = db.get(m.Chapter, chapter_id)
        chapitre_db.validation_status = "validated"
        lecon = m.Lesson(
            chapter_id=chapter_id,
            title="Battre la mesure",
            status="validated",
            created_by="parent",
        )
        db.add(lecon)
        db.flush()
        notion = m.Skill(subject_id=subject_id, name="Repérer la pulsation", level="4e")
        db.add(notion)
        db.flush()
        db.add(m.LessonSkill(lesson_id=lecon.id, skill_id=notion.id))
        db.commit()

        atteintes = lessons_by_skill(db, [notion.id])

    assert [l.id for l in atteintes.get(notion.id, [])] == [lecon.id], (
        "le chapitre est créé mais INVISIBLE du résolveur canonique — c'est le défaut silencieux"
    )


def test_sans_annee_active_la_creation_REFUSE_et_dit_quoi_faire(
    client_db: tuple[TestClient, sessionmaker],
) -> None:
    """Un 201 qui rend un objet que rien n'atteindra est pire qu'un refus."""
    client, _ = client_db
    subject_id = client.post("/api/subjects", json={"name": "Latin"}).json()["id"]
    theme_id = client.post(f"/api/subjects/{subject_id}/themes", json={"name": "Rome"}).json()["id"]

    refus = client.post(f"/api/subjects/themes/{theme_id}/chapters", json={"name": "La République"})
    assert refus.status_code == 422
    assert "année scolaire" in refus.json()["detail"]


def test_matiere_hors_programme_de_l_annee_REFUSE_et_la_nomme(
    client_db: tuple[TestClient, sessionmaker],
) -> None:
    """L'année existe, mais pas cette matière-là : le motif doit la NOMMER, sinon Papa cherche."""
    client, Session = client_db
    au_programme = client.post("/api/subjects", json={"name": "Physique-Chimie"}).json()["id"]
    hors = client.post("/api/subjects", json={"name": "Latin"}).json()["id"]
    with Session() as db:
        _annee_active_avec(db, au_programme)

    theme_id = client.post(f"/api/subjects/{hors}/themes", json={"name": "Rome"}).json()["id"]
    refus = client.post(f"/api/subjects/themes/{theme_id}/chapters", json={"name": "La République"})

    assert refus.status_code == 422
    assert "Latin" in refus.json()["detail"]
