"""Ponts « demande de notion hors-programme → programme » (addendum ADR-0027).

Papa traite une `notion_request` depuis l'inbox : soit il AJOUTE la notion (Skill), soit il CRÉE la
leçon (Skill + Lesson + lien). Réutilise `_upsert_skills` / `create_manual_lesson`. Couvre : création
de la Skill + statut `added` ; création de la leçon (validée, cours à écrire) + Skill liée + `added` ;
garde parent.
"""

from sqlalchemy import select

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user


def _as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def _seed_year_and_chapter(Session) -> tuple[int, int]:
    """Année active + Mathématiques rattachée + 1 chapitre. Renvoie (subject_id, chapter_id)."""
    db = Session()
    student_id = db.scalar(select(m.StudentProfile.id).order_by(m.StudentProfile.id))
    subject = db.scalar(select(m.Subject).where(m.Subject.slug == "mathematiques"))
    year = m.SchoolYear(student_id=student_id, label="2026-2027", level="4e", status="active")
    db.add(year)
    db.flush()
    sys_row = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject.id)
    db.add(sys_row)
    db.flush()
    chapter = m.Chapter(
        school_year_subject_id=sys_row.id, name="Géométrie", sort_order=1,
        validation_status="validated",
    )
    db.add(chapter)
    db.commit()
    ids = (subject.id, chapter.id)
    db.close()
    return ids


def _make_request(client, text: str) -> int:
    return client.post("/api/ai/eli5/request-notion", json={"text": text}).json()["id"]


def test_add_to_program_creates_skill_and_marks_added(client_db) -> None:
    client, Session = client_db
    subject_id, _ = _seed_year_and_chapter(Session)
    req_id = _make_request(client, "Théorème de Pythagore")

    _as_papa()
    resp = client.post(
        f"/api/notion-requests/{req_id}/add-to-program", json={"subject_id": subject_id}
    )
    assert resp.status_code == 200
    assert resp.json()["skill_created"] == 1 and resp.json()["status"] == "added"

    db = Session()
    skill = db.scalar(select(m.Skill).where(m.Skill.name == "Théorème de Pythagore"))
    assert skill is not None and skill.subject_id == subject_id and skill.level == "4e"
    req = db.get(m.NotionRequest, req_id)
    assert req.status == "added" and req.subject_id == subject_id
    db.close()


def test_add_to_program_dit_que_rien_ne_sera_produit_sans_lecon(client_db) -> None:
    """⚠️ « + Programme » crée une notion ORPHELINE — et le bouton se lit « traité ».

    Constat du 2026-08-03 : sans leçon rattachée, `equip_notion` renvoie `has_lesson=False` et
    **ZETIS ne produira JAMAIS rien** pour cette notion. L'état est légitime et documenté (« la
    leçon/le cours suivent via les outils habituels ») ; ce qui manquait, c'est de le dire.

    On ne fusionne pas « + Programme » et « Créer la leçon » : Papa peut vouloir rattacher la
    notion à une leçon existante. Le défaut n'était pas l'orpheline, c'était le silence.
    """
    client, Session = client_db
    subject_id, _ = _seed_year_and_chapter(Session)
    req_id = _make_request(client, "Théorème de Thalès")

    _as_papa()
    body = client.post(
        f"/api/notion-requests/{req_id}/add-to-program", json={"subject_id": subject_id}
    ).json()
    assert body["needs_lesson"] is True, "l'orpheline n'est pas signalée"
    assert body["skill_id"] is not None, "sans id, l'écran ne peut proposer aucun pont"


def test_add_to_program_ne_crie_pas_au_loup_si_la_notion_a_deja_une_lecon(client_db) -> None:
    """Le signal est CALCULÉ, jamais supposé.

    `_upsert_skills` est idempotent : si la notion existait déjà et portait une leçon, il n'y a
    rien à signaler. Fabriquer un avertissement pour un problème absent apprend à les ignorer.
    """
    from app.modules.curriculum.service import create_manual_lesson

    client, Session = client_db
    subject_id, chapter_id = _seed_year_and_chapter(Session)

    # ⚠️ La leçon est posée DIRECTEMENT, pas via une seconde `notion_request`. Une première version
    # de ce test créait deux demandes au texte presque identique en croyant qu'elles seraient
    # distinctes : `create_request` les déduplique, si bien que le test empruntait la branche
    # `already_processed` et passait quoi qu'il arrive. La contre-épreuve l'a démasqué.
    db = Session()
    create_manual_lesson(db, chapter_id, title="Angles", notions=["Somme des angles"])
    db.close()

    req_id = _make_request(client, "Somme des angles")
    _as_papa()
    body = client.post(
        f"/api/notion-requests/{req_id}/add-to-program", json={"subject_id": subject_id}
    ).json()
    assert body["needs_lesson"] is False, "avertissement émis alors qu'une leçon porte la notion"


def test_create_lesson_scaffolds_lesson_and_skill(client_db) -> None:
    client, Session = client_db
    _, chapter_id = _seed_year_and_chapter(Session)
    req_id = _make_request(client, "Théorème de Pythagore")

    _as_papa()
    resp = client.post(
        f"/api/notion-requests/{req_id}/create-lesson",
        json={"chapter_id": chapter_id, "generate_course": False},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "added" and body["course_written"] is False
    assert body["lesson_status"] == "validated"  # sans cours généré → validée d'office

    db = Session()
    lesson = db.get(m.Lesson, body["lesson_id"])
    assert lesson.title == "Théorème de Pythagore" and lesson.chapter_id == chapter_id
    # La notion Skill a été créée ET liée à la leçon.
    link = db.scalar(select(m.LessonSkill).where(m.LessonSkill.lesson_id == lesson.id))
    assert link is not None
    skill = db.get(m.Skill, link.skill_id)
    assert skill.name == "Théorème de Pythagore"
    assert db.get(m.NotionRequest, req_id).status == "added"
    db.close()


def test_orphan_notions_surface_added_skill(client_db) -> None:
    """« Ajouter au programme » crée une Skill SANS leçon → elle doit apparaître dans les notions
    orphelines de la matière (sinon invisible dans la page Programme, leçon-centrée)."""
    client, Session = client_db
    subject_id, _ = _seed_year_and_chapter(Session)
    req_id = _make_request(client, "Théorème de Pythagore")
    _as_papa()
    client.post(f"/api/notion-requests/{req_id}/add-to-program", json={"subject_id": subject_id})
    orphans = client.get(f"/api/subjects/{subject_id}/orphan-notions").json()["notions"]
    assert any(n["name"] == "Théorème de Pythagore" for n in orphans)


def test_create_lesson_notion_is_not_orphan(client_db) -> None:
    """« Créer la leçon » lie la notion à une leçon → elle N'EST PAS orpheline."""
    client, Session = client_db
    subject_id, chapter_id = _seed_year_and_chapter(Session)
    req_id = _make_request(client, "Aire du triangle")
    _as_papa()
    client.post(
        f"/api/notion-requests/{req_id}/create-lesson",
        json={"chapter_id": chapter_id, "generate_course": False},
    )
    orphans = client.get(f"/api/subjects/{subject_id}/orphan-notions").json()["notions"]
    assert not any(n["name"] == "Aire du triangle" for n in orphans)


def test_delete_orphan_notion_removes_it(client_db) -> None:
    """Une notion orpheline ajoutée par erreur se supprime ; refuse si rattachée à une leçon."""
    client, Session = client_db
    subject_id, chapter_id = _seed_year_and_chapter(Session)
    # orpheline (add-to-program) → supprimable
    orphan_id = _make_request(client, "Nombres complexes")
    _as_papa()
    client.post(f"/api/notion-requests/{orphan_id}/add-to-program", json={"subject_id": subject_id})
    db = Session()
    skill = db.scalar(select(m.Skill).where(m.Skill.name == "Nombres complexes"))
    orphan_skill_id = skill.id
    db.close()
    assert client.delete(f"/api/skills/{orphan_skill_id}").status_code == 200
    db = Session()
    assert db.get(m.Skill, orphan_skill_id) is None
    db.close()

    # rattachée à une leçon → 409
    lesson_req = _make_request(client, "Aire du triangle")
    client.post(
        f"/api/notion-requests/{lesson_req}/create-lesson",
        json={"chapter_id": chapter_id, "generate_course": False},
    )
    db = Session()
    linked = db.scalar(select(m.Skill).where(m.Skill.name == "Aire du triangle"))
    linked_id = linked.id
    db.close()
    assert client.delete(f"/api/skills/{linked_id}").status_code == 409


def test_create_lesson_is_idempotent_after_course_failure(client_db, monkeypatch) -> None:
    """Anti-régression (review) : la rédaction du cours est longue et faillible (panne Ollama). Si
    elle échoue, la leçon est DÉJÀ committée — la demande doit quand même passer `added`, et un
    retry de Papa ne doit PAS créer une deuxième leçon du même titre."""
    from app.modules.curriculum import service as curriculum_service

    client, Session = client_db
    _, chapter_id = _seed_year_and_chapter(Session)
    req_id = _make_request(client, "Théorème de Pythagore")

    def _ollama_down(db, llm, lesson_id):
        raise curriculum_service.CurriculumGenerationError("Ollama indisponible")

    monkeypatch.setattr(curriculum_service, "generate_lesson_content", _ollama_down)
    _as_papa()
    first = client.post(
        f"/api/notion-requests/{req_id}/create-lesson",
        json={"chapter_id": chapter_id, "generate_course": True},
    )
    # La leçon existe, la demande est traitée, l'échec du cours est REMONTÉ (pas un 500 muet).
    assert first.status_code == 200
    assert first.json()["status"] == "added" and first.json()["course_written"] is False
    assert "Ollama" in (first.json()["course_error"] or "")

    # Retry de Papa → aucun doublon.
    second = client.post(
        f"/api/notion-requests/{req_id}/create-lesson",
        json={"chapter_id": chapter_id, "generate_course": False},
    )
    assert second.status_code == 200 and second.json()["already_processed"] is True
    db = Session()
    lessons = db.query(m.Lesson).filter(m.Lesson.title == "Théorème de Pythagore").all()
    assert len(lessons) == 1  # ← une seule leçon, jamais deux
    db.close()


def test_add_to_program_is_idempotent(client_db) -> None:
    """Anti-régression (review) : un retry ne doit pas réécrire `subject_id` avec une autre matière."""
    client, Session = client_db
    subject_id, _ = _seed_year_and_chapter(Session)
    req_id = _make_request(client, "Nombres premiers")
    _as_papa()
    client.post(f"/api/notion-requests/{req_id}/add-to-program", json={"subject_id": subject_id})
    again = client.post(
        f"/api/notion-requests/{req_id}/add-to-program", json={"subject_id": 999999}
    )
    assert again.json()["already_processed"] is True
    db = Session()
    assert db.get(m.NotionRequest, req_id).subject_id == subject_id  # matière d'origine préservée
    db.close()


def test_bridges_require_parent(client_db) -> None:
    """Le rôle child (conftest) est refusé sur les ponts."""
    client, Session = client_db
    subject_id, chapter_id = _seed_year_and_chapter(Session)
    assert client.post(
        "/api/notion-requests/1/add-to-program", json={"subject_id": subject_id}
    ).status_code == 403
    assert client.post(
        "/api/notion-requests/1/create-lesson", json={"chapter_id": chapter_id}
    ).status_code == 403
