"""Couverture de production — fraîcheur (§E), provenance (§F), modèle de lecture.

Le test qui compte le plus ici est `test_no_false_positive_on_non_content_edits` : il protège
la crédibilité de la page. Sans lui, un renommage de leçon marquerait périmés tous ses dérivés,
et Papa abandonnerait la page dès le premier badge affiché à tort.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

import app.db.models as m
from app.db.base import get_db
from app.main import app
from app.modules.ai.canonical_context import is_stale
from app.modules.auth.deps import get_current_user
from app.modules.capsules import service as capsule_service
from app.modules.production.coverage import cell_state, row_state

_FICHE_SPEC = {
    "title": "Leçon",
    "subject": "Mathématiques",
    "level": "4e",
    "essentiel": "L'essentiel de la leçon.",
}

PAPA = {"username": "papa", "role": "papa"}
CHILD = {"username": "massimo", "role": "child"}


def _as(role: dict) -> None:
    app.dependency_overrides[get_current_user] = lambda: role


def _t(minutes: int) -> datetime:
    """Horodatage de fixture, volontairement dans le PASSÉ : les tests qui déclenchent une
    vraie écriture (`content_updated_at = now()`) doivent obtenir une valeur postérieure."""
    return datetime(2020, 1, 1, 10, 0, tzinfo=timezone.utc) + timedelta(minutes=minutes)


# --- §E.1 — la fonction pure de fraîcheur --------------------------------------------------


def test_is_stale_truth_table() -> None:
    assert is_stale(None, None) is False
    assert is_stale(_t(0), None) is False, "pas de cours → rien n'a pu changer"
    assert is_stale(None, _t(0)) is False, "pas de dérivé → rien à périmer"
    assert is_stale(_t(0), _t(0)) is False, "égalité stricte : produit avec son cours, frais"
    assert is_stale(_t(0), _t(1)) is True, "cours réécrit APRÈS le dérivé → périmé"
    assert is_stale(_t(1), _t(0)) is False, "dérivé postérieur au cours → frais"


# --- §3a/§3b — états de cellule et de ligne, fonctions pures --------------------------------


def _cell(**kwargs):
    base = {
        "lesson_servable": True,
        "exists": True,
        "derived_at": _t(0),
        "validation_status": "validated",
        "content_updated_at": _t(0),
    }
    return cell_state(**{**base, **kwargs})


def test_cell_state_truth_table() -> None:
    assert _cell(lesson_servable=False) == "blocked"
    assert _cell(exists=False, derived_at=None) == "absent"
    assert _cell(validation_status="pending") == "pending"
    assert _cell() == "validated"
    assert _cell(content_updated_at=_t(5)) == "stale"
    # `blocked` domine : une leçon non servable n'a pas de dérivé générable, quoi qu'il existe.
    assert _cell(lesson_servable=False, exists=False) == "blocked"
    # `stale` l'emporte sur `validated` : c'est l'information que le ✓ ne doit pas masquer.
    assert _cell(validation_status="validated", content_updated_at=_t(5)) == "stale"


def test_quiz_has_no_pending_state() -> None:
    """ADR-0014 §2 : servi sans gate → `absent` | `validated` | `stale`, jamais `pending`."""
    assert _cell(gated=False, validation_status=None) == "validated"
    assert _cell(gated=False, validation_status="pending") == "validated"
    assert _cell(gated=False, validation_status=None, exists=False) == "absent"
    assert _cell(gated=False, validation_status=None, content_updated_at=_t(5)) == "stale"


def test_a_derivative_without_timestamp_is_never_read_as_absent() -> None:
    """VERROU : une fiche existante SANS `updated_at` ne doit pas passer pour absente.

    C'est le bug qui a fait empiler 5 fiches sur la même leçon : `fiches.updated_at` était
    nullable sans défaut serveur (corrigé par `e6f7a8b9c0d1`), la cellule affichait « + », et
    chaque clic créait un doublon de plus. `absent` se déduit de l'EXISTENCE, jamais d'une date.
    """
    assert _cell(exists=True, derived_at=None, validation_status="validated") == "validated"
    assert _cell(exists=True, derived_at=None, validation_status="pending") == "pending"
    # Sans date, le périmé est indécidable — on ne l'invente pas, on ne crie pas au loup.
    assert _cell(exists=True, derived_at=None, content_updated_at=_t(9)) == "validated"


def test_row_state_distinguishes_the_two_blocking_causes() -> None:
    """Deux causes, deux actions : agir dans Programme vs rédiger le cours ici."""
    full = {"quiz": "validated", "fiche": "validated", "mindmap": "validated"}
    assert row_state(lesson_validated=False, has_course=True, cells=full) == "blocked_lesson"
    assert row_state(lesson_validated=True, has_course=False, cells=full) == "blocked_no_course"
    assert row_state(lesson_validated=True, has_course=True, cells=full) == "complete"
    assert (
        row_state(
            lesson_validated=True,
            has_course=True,
            cells={**full, "fiche": "absent"},
        )
        == "ready"
    )
    # Un dérivé périmé n'est PAS complet : la ligne reste à traiter.
    assert (
        row_state(lesson_validated=True, has_course=True, cells={**full, "quiz": "stale"})
        == "ready"
    )


# --- Seed ----------------------------------------------------------------------------------


def _seed_year(db):
    student = db.scalar(select(m.StudentProfile))
    subject = db.scalar(select(m.Subject))
    year = m.SchoolYear(student_id=student.id, label="2026-2027", level="4e", status="active")
    db.add(year)
    db.flush()
    sys_row = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject.id)
    db.add(sys_row)
    db.flush()
    chapter = m.Chapter(
        school_year_subject_id=sys_row.id,
        name="Chapitre",
        validation_status="validated",
        sort_order=0,
    )
    db.add(chapter)
    db.flush()
    return student, subject, chapter


def _seed_lesson(db, chapter, *, title="Leçon", validated=True, course=True):
    lesson = m.Lesson(
        chapter_id=chapter.id,
        title=title,
        status="validated" if validated else "draft",
        content_markdown="# Cours" if course else None,
        content_updated_at=_t(0) if course else None,
        created_by="ai",
        sort_order=0,
    )
    db.add(lesson)
    db.flush()
    return lesson


# --- §E — verrou anti-faux-positif ---------------------------------------------------------


def test_no_false_positive_on_non_content_edits(client_db) -> None:
    """VERROU : renommer, réordonner ou re-rattacher une leçon ne périme AUCUN dérivé.

    C'est l'objet même de `content_updated_at` : `updated_at` est trop bruyant pour servir de
    référence. Si ce test tombe, la page affichera des « périmés » à tort et sera abandonnée.
    """
    client, TestSession = client_db
    db = TestSession()
    _student, _subject, chapter = _seed_year(db)
    lesson = _seed_lesson(db, chapter)
    skill_id = db.scalar(select(m.Skill)).id
    db.add(m.Fiche(lesson_id=lesson.id, validation_status="validated", updated_at=_t(1)))
    db.commit()
    lesson_id, before = lesson.id, lesson.content_updated_at
    db.close()

    _as(PAPA)
    client.patch(f"/api/lessons/{lesson_id}", json={"title": "Titre renommé"})

    db = TestSession()
    lesson = db.get(m.Lesson, lesson_id)
    lesson.sort_order = 7
    db.add(m.LessonSkill(lesson_id=lesson_id, skill_id=skill_id))
    db.commit()
    assert lesson.content_updated_at == before, "un renommage ne touche PAS content_updated_at"
    assert lesson.title == "Titre renommé", "…mais le renommage a bien eu lieu"
    db.close()

    body = client.get("/api/production/coverage").json()
    cells = body["subjects"][0]["chapters"][0]["lessons"][0]["cells"]
    assert cells["fiche"]["state"] == "validated", "aucun dérivé périmé après ces trois édits"


def test_content_updated_at_moves_only_on_content_writes(client_db) -> None:
    """Bougée par un PATCH PORTANT `content` ; pas par un PATCH qui n'en porte pas."""
    client, TestSession = client_db
    db = TestSession()
    _student, _subject, chapter = _seed_year(db)
    lesson = _seed_lesson(db, chapter)
    db.commit()
    lesson_id, before = lesson.id, lesson.content_updated_at
    db.close()

    _as(PAPA)
    client.patch(f"/api/lessons/{lesson_id}", json={"summary": "résumé"})
    db = TestSession()
    assert db.get(m.Lesson, lesson_id).content_updated_at == before
    db.close()

    client.patch(f"/api/lessons/{lesson_id}", json={"content": "# Nouveau cours"})
    db = TestSession()
    assert db.get(m.Lesson, lesson_id).content_updated_at > before
    db.close()


def test_a_rewritten_course_makes_its_derivative_stale(client_db) -> None:
    """Le cas que le §E existe pour couvrir : le dérivé reste `validated` mais devient périmé."""
    client, TestSession = client_db
    db = TestSession()
    _student, _subject, chapter = _seed_year(db)
    lesson = _seed_lesson(db, chapter)
    db.add(m.Fiche(lesson_id=lesson.id, validation_status="validated", updated_at=_t(1)))
    db.commit()
    lesson_id = lesson.id
    db.close()

    _as(PAPA)
    client.patch(f"/api/lessons/{lesson_id}", json={"content": "# Cours réécrit"})

    body = client.get("/api/production/coverage").json()
    cells = body["subjects"][0]["chapters"][0]["lessons"][0]["cells"]
    assert cells["fiche"]["state"] == "stale"
    assert body["totals"]["stale_count"] == 1


# --- §3c — fractions notion-centrées -------------------------------------------------------


def test_notion_fractions_count_only_consumable_objects(client_db) -> None:
    """3 notions, 1 carte active, 1 capsule publiée → 1/3 et 1/3. Ni brouillon ni rendu manquant."""
    client, TestSession = client_db
    db = TestSession()
    student, subject, chapter = _seed_year(db)
    lesson = _seed_lesson(db, chapter)
    skills = [db.scalar(select(m.Skill))]
    for name in ("Notion B", "Notion C"):
        skill = m.Skill(subject_id=subject.id, name=name, level="4e")
        db.add(skill)
        db.flush()
        skills.append(skill)
    for skill in skills:
        db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))

    db.add(
        m.SpacedReviewCard(
            student_id=student.id,
            skill_id=skills[0].id,
            front_markdown="r",
            back_markdown="v",
            status="scheduled",
        )
    )
    # Carte suspendue → jamais servie en révision, donc NON comptée.
    db.add(
        m.SpacedReviewCard(
            student_id=student.id,
            skill_id=skills[1].id,
            front_markdown="r",
            back_markdown="v",
            status="suspended",
        )
    )
    # Capsule validée ET rendue → comptée ; capsule sans vidéo → non comptée (ne se regarde pas).
    db.add(
        m.Capsule(
            subject_id=subject.id,
            skill_id=skills[0].id,
            title="Vue",
            validation_status="validated",
            video_url="http://minio/v.mp4",
        )
    )
    db.add(
        m.Capsule(
            subject_id=subject.id,
            skill_id=skills[1].id,
            title="Sans rendu",
            validation_status="validated",
        )
    )
    db.commit()
    db.close()

    _as(PAPA)
    notions = client.get("/api/production/coverage").json()["subjects"][0]["chapters"][0][
        "lessons"
    ][0]["notions"]
    assert notions["cards"] == {"covered": 1, "total": 3}
    assert notions["capsules"] == {"covered": 1, "total": 3}


def test_notion_items_say_which_notion_lacks_what(client_db) -> None:
    """Le détail par notion : agir depuis la matrice suppose de savoir SUR QUOI agir."""
    client, TestSession = client_db
    db = TestSession()
    student, subject, chapter = _seed_year(db)
    lesson = _seed_lesson(db, chapter)
    covered = db.scalar(select(m.Skill))
    bare = m.Skill(subject_id=subject.id, name="Notion nue", level="4e")
    db.add(bare)
    db.flush()
    for skill in (covered, bare):
        db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
    db.add(
        m.SpacedReviewCard(
            student_id=student.id,
            skill_id=covered.id,
            front_markdown="r",
            back_markdown="v",
            status="scheduled",
        )
    )
    db.commit()
    db.close()

    _as(PAPA)
    notions = client.get("/api/production/coverage").json()["subjects"][0]["chapters"][0][
        "lessons"
    ][0]["notions"]

    by_name = {item["name"]: item for item in notions["items"]}
    assert len(by_name) == 2
    assert by_name["Nombres relatifs"]["has_card"] is True
    assert by_name["Notion nue"]["has_card"] is False
    assert all(item["has_capsule"] is False for item in notions["items"])
    # Les fractions restent cohérentes avec le détail dont elles se déduisent.
    assert notions["cards"] == {"covered": 1, "total": 2}
    # Chaque item porte son `skill_id` : c'est la cible de la génération.
    assert all(isinstance(item["skill_id"], int) for item in notions["items"])


def test_lesson_without_any_notion_yields_zero_over_zero(client_db) -> None:
    """0/0, sans erreur ni division — une leçon peut n'avoir aucune notion rattachée."""
    client, TestSession = client_db
    db = TestSession()
    _student, _subject, chapter = _seed_year(db)
    _seed_lesson(db, chapter)
    db.commit()
    db.close()

    _as(PAPA)
    notions = client.get("/api/production/coverage").json()["subjects"][0]["chapters"][0][
        "lessons"
    ][0]["notions"]
    assert notions["cards"] == {"covered": 0, "total": 0}
    assert notions["capsules"] == {"covered": 0, "total": 0}


# --- Totaux --------------------------------------------------------------------------------


def test_course_is_not_counted_in_the_derivatives_percent(client_db) -> None:
    """Le cours est la CONDITION des dérivés, pas un dérivé — le compter gonflerait le %."""
    client, TestSession = client_db
    db = TestSession()
    _student, _subject, chapter = _seed_year(db)
    lesson = _seed_lesson(db, chapter)
    db.add(m.Fiche(lesson_id=lesson.id, validation_status="validated", updated_at=_t(1)))
    db.commit()
    db.close()

    _as(PAPA)
    totals = client.get("/api/production/coverage").json()["totals"]
    # 1 dérivé produit sur 3 créneaux (quiz, fiche, mindmap) → 33 %, et non 2/4 = 50 %.
    assert totals["derivatives_percent"] == 33
    assert totals["courses_written"] == 1


def test_a_subject_without_lessons_is_never_silently_filtered(client_db) -> None:
    """Une matière absente se lirait « rien à produire » — ce qui serait faux."""
    client, TestSession = client_db
    db = TestSession()
    _seed_year(db)
    db.commit()
    db.close()

    _as(PAPA)
    subjects = client.get("/api/production/coverage").json()["subjects"]
    assert len(subjects) == 1 and subjects[0]["chapters"] == []


# --- Orphelins -----------------------------------------------------------------------------


def test_orphans_are_listed_with_their_history_flag(client_db) -> None:
    client, TestSession = client_db
    db = TestSession()
    student, _subject, chapter = _seed_year(db)
    lesson = _seed_lesson(db, chapter)
    db.add(m.Fiche(lesson_id=lesson.id, validation_status="validated", updated_at=_t(1)))
    mindmap = m.Mindmap(
        lesson_id=lesson.id,
        mindmap_json={"center": "R", "nodes": [{"id": "n1", "label": "B", "parent": None}]},
        validation_status="validated",
    )
    db.add(mindmap)
    db.flush()
    db.add(
        m.MindmapAttempt(mindmap_id=mindmap.id, student_id=student.id, score=80)
    )
    lesson.status = "archived"
    db.commit()
    db.close()

    _as(PAPA)
    rows = client.get("/api/production/orphans").json()
    by_type = {row["type"]: row for row in rows}
    assert by_type["fiche"]["has_history"] is False, "une fiche ne porte aucune tentative"
    assert by_type["mindmap"]["has_history"] is True, "la carte porte une tentative → suppression bloquée"

    # Et la leçon archivée ne crée AUCUNE ligne dans la matrice : une anomalie, pas une case vide.
    assert client.get("/api/production/coverage").json()["subjects"][0]["chapters"] == []


# --- §F — provenance de la validation ------------------------------------------------------


def test_unitary_validation_is_parent(client_db) -> None:
    client, TestSession = client_db
    db = TestSession()
    _student, _subject, chapter = _seed_year(db)
    lesson = _seed_lesson(db, chapter)
    fiche = m.Fiche(lesson_id=lesson.id, validation_status="pending", spec_json=_FICHE_SPEC)
    db.add(fiche)
    db.commit()
    fiche_id = fiche.id
    db.close()

    _as(PAPA)
    assert client.post(f"/api/fiches/{fiche_id}/validate").status_code == 200

    db = TestSession()
    row = db.get(m.Fiche, fiche_id)
    assert row.validated_by == "parent" and row.validated_at is not None
    db.close()


def test_validate_all_is_parent_bulk(client_db) -> None:
    """Toute action groupée écrit `parent_bulk`, sans exception (§F.3)."""
    client, TestSession = client_db
    db = TestSession()
    _student, _subject, chapter = _seed_year(db)
    chapter.validation_status = "pending"
    db.commit()
    chapter_id = chapter.id
    db.close()

    _as(PAPA)
    resp = client.post("/api/school-years/active/chapters/validate-all")
    assert resp.status_code == 200

    db = TestSession()
    row = db.get(m.Chapter, chapter_id)
    assert row.validation_status == "validated"
    assert row.validated_by == "parent_bulk" and row.validated_at is not None
    db.close()


def test_batch_lesson_validation_is_parent_bulk(client_db) -> None:
    """Validation en lot des leçons d'un chapitre : `parent_bulk`, et rien d'autre n'y touche."""
    client, TestSession = client_db
    db = TestSession()
    _student, _subject, chapter = _seed_year(db)
    draft_a = _seed_lesson(db, chapter, title="Brouillon A", validated=False)
    draft_b = _seed_lesson(db, chapter, title="Brouillon B", validated=False)
    already = _seed_lesson(db, chapter, title="Déjà validée")
    already.validated_by = "parent"  # relue pièce à pièce auparavant
    archived = _seed_lesson(db, chapter, title="Archivée", validated=False)
    archived.status = "archived"
    db.commit()
    ids = (draft_a.id, draft_b.id, already.id, archived.id)
    chapter_id = chapter.id
    db.close()

    _as(PAPA)
    resp = client.post(f"/api/chapters/{chapter_id}/lessons/validate-all")
    assert resp.status_code == 200
    assert resp.json()["validated_count"] == 2, "seules les `draft` sont validées"

    db = TestSession()
    for lesson_id in ids[:2]:
        row = db.get(m.Lesson, lesson_id)
        assert row.status == "validated"
        assert row.validated_by == "parent_bulk" and row.validated_at is not None
    # Une leçon DÉJÀ validée n'est pas re-tamponnée : écraser `parent` par `parent_bulk`
    # perdrait l'information qu'elle a bien été relue.
    assert db.get(m.Lesson, ids[2]).validated_by == "parent"
    # Une leçon archivée reste écartée du flux.
    assert db.get(m.Lesson, ids[3]).status == "archived"
    db.close()


def test_generated_quiz_is_system(client_db, executer_travail) -> None:
    """`system` = servi sans relecture PAR DOCTRINE (ADR-0014 §2), écrit à la génération."""
    client, TestSession = client_db
    db = TestSession()
    _student, subject, chapter = _seed_year(db)
    lesson = _seed_lesson(db, chapter)
    skill = db.scalar(select(m.Skill))
    db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
    db.commit()
    lesson_id = lesson.id
    db.close()

    _as(PAPA)
    # ⚠️ `202` depuis l'ADR-0041 §4 : la route accepte, le worker produit. Ce test porte sur
    # l'auto-validation (`validated_by == "system"`), pas sur le mode d'exécution — on joue donc
    # le travail plutôt que de relâcher l'assertion sur ce qui a été produit.
    resp = client.post(f"/api/lessons/{lesson_id}/quizzes/generate", json={"count": 5})
    assert resp.status_code == 202, resp.text
    executer_travail(TestSession, resp.json()["job_id"])

    db = TestSession()
    quiz = db.scalar(select(m.Quiz))
    assert quiz.validated_by == "system" and quiz.validated_at is not None
    db.close()


def test_no_validated_row_without_provenance(client_db) -> None:
    """VERROU §F.3 : après tous les chemins de validation, aucun `validated` sans `validated_by`.

    Ce test doit échouer si un futur chemin de validation oublie la colonne — c'est sa raison
    d'être. La provenance ne vaut que si elle est exhaustive : une seule fuite et un ✓ redevient
    ininterprétable.
    """
    client, TestSession = client_db
    db = TestSession()
    _student, _subject, chapter = _seed_year(db)
    chapter.validation_status = "pending"
    lesson = _seed_lesson(db, chapter, validated=False)
    fiche = m.Fiche(lesson_id=lesson.id, validation_status="pending", spec_json=_FICHE_SPEC)
    mindmap = m.Mindmap(
        lesson_id=lesson.id,
        mindmap_json={"center": "R", "nodes": [{"id": "n1", "label": "B", "parent": None}]},
        validation_status="pending",
    )
    capsule = m.Capsule(subject_id=_subject.id, title="C", validation_status="pending")
    db.add_all([fiche, mindmap, capsule])
    db.commit()
    ids = (lesson.id, fiche.id, mindmap.id, capsule.id)
    db.close()

    _as(PAPA)
    client.post("/api/school-years/active/chapters/validate-all")
    client.post(f"/api/lessons/{ids[0]}/validate")
    client.post(f"/api/fiches/{ids[1]}/validate")
    client.post(f"/api/mindmaps/{ids[2]}/validate")
    # Capsule : on appelle le SERVICE directement. La route exige un `CapsuleSpec` complet
    # (4–9 scènes) dont la validité n'a rien à voir avec ce qu'on verrouille ici — c'est
    # l'écrivain de provenance qu'on teste, pas le schéma de rendu.
    db = TestSession()
    capsule_service.set_validation(db, ids[3], "validated")
    db.close()

    db = TestSession()
    offenders = []
    for model, field in (
        (m.Chapter, "validation_status"),
        (m.Lesson, "status"),
        (m.Fiche, "validation_status"),
        (m.Mindmap, "validation_status"),
        (m.Capsule, "validation_status"),
    ):
        for row in db.scalars(select(model)):
            if getattr(row, field) == "validated" and row.validated_by is None:
                offenders.append(f"{model.__name__}#{row.id}")
    db.close()
    assert offenders == [], f"validés sans provenance : {offenders}"


def test_system_is_reserved_to_quizzes() -> None:
    """`system` ne doit JAMAIS être écrit ailleurs que par la génération de quiz.

    Sans ce verrou, une future auto-validation pourrait s'y déguiser sans ADR : `system` dit
    « servi sans relecture PAR DOCTRINE », ce qui n'est vrai que du quiz (ADR-0014 §2). Un
    équipement ou un lot qui s'en réclamerait masquerait une validation groupée derrière une
    décision qui ne la couvre pas.

    On cible les deux seules formes d'ÉCRITURE de la provenance — importer `SYSTEM` du module
    `provenance`, ou affecter `validated_by` littéralement. Chercher le mot « system » nu
    donnerait des faux positifs (`system=` est aussi le prompt système des providers LLM).
    """
    from pathlib import Path

    offenders = []
    for path in sorted(Path("app/modules").rglob("*.py")):
        if path.name == "provenance.py" or "quizzes" in path.parts:
            continue  # le module qui la DÉFINIT, et le seul autorisé à l'écrire
        text = path.read_text(encoding="utf-8")
        for number, line in enumerate(text.splitlines(), start=1):
            code = line.split("#", 1)[0]
            imports_system = "provenance import" in code and "SYSTEM" in code
            assigns_system = "validated_by" in code and "system" in code
            if imports_system or assigns_system:
                offenders.append(f"{path}:{number}")
    assert offenders == [], f"`system` écrit hors du quiz : {offenders}"


def test_coverage_does_not_scale_with_the_number_of_lessons(client_db) -> None:
    """Le nombre de requêtes suit les MATIÈRES, jamais les leçons (§3d — aucun N+1).

    Une matière peut porter 8 chapitres × 12 leçons : une requête par leçon rendrait la page
    inutilisable. On compare deux matrices de tailles très différentes — le compte doit être
    identique.
    """
    _, TestSession = client_db
    from sqlalchemy import event

    from app.modules.production.coverage import coverage

    def _count(lesson_count: int) -> int:
        db = TestSession()
        _student, _subject, chapter = _seed_year(db)
        for index in range(lesson_count):
            _seed_lesson(db, chapter, title=f"Leçon {index}")
        db.commit()

        queries: list[str] = []
        engine = db.get_bind()
        listener = lambda *args: queries.append(args[2])  # noqa: E731
        event.listen(engine, "before_cursor_execute", listener)
        coverage(db)
        event.remove(engine, "before_cursor_execute", listener)
        db.close()
        return len(queries)

    assert _count(2) == _count(20), "le compte de requêtes doit être indépendant des leçons"


# --- Gardes --------------------------------------------------------------------------------


def test_production_routes_require_parent(client_db) -> None:
    """Rien de cette page n'atteint Massimo."""
    client, _ = client_db
    _as(CHILD)
    assert client.get("/api/production/coverage").status_code == 403
    assert client.get("/api/production/orphans").status_code == 403
