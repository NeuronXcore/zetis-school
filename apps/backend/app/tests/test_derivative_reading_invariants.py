"""Invariants de lecture des dérivés — exception « mission engagée ».

Règle (addendum ADR-0009 §A, addendum ADR-0016 §6 règle 1) : **le gate porte sur la
découverte, jamais sur l'achèvement d'un parcours engagé.**

Une carte que Papa vient d'éditer repasse `pending`. Elle doit :
- **disparaître des routes de découverte** (deck de matière, compteur de la grille) ;
- **rester jouable jusqu'au bout** par l'élève dont une mission ACTIVE la référence —
  sinon l'étape ADR-0019 §2 (qui exige une `MindmapAttempt` postérieure au `start`) n'a
  plus de preuve possible : la mission perd son verdict et Massimo reste bloqué sur un
  parcours mort, du fait d'une action de Papa.
"""

from sqlalchemy import select

import app.db.models as m
from app.modules.engagement.service import STEP_MINDMAP, is_engaged_in_active_mission


# --- Helpers ------------------------------------------------------------------------------


def _seeded(db):
    return db.scalar(select(m.StudentProfile)), db.scalar(select(m.Subject))


def _seed_mindmap(db, *, student, subject, validated: bool) -> int:
    """Année active → chapitre validé → leçon validée → mindmap. Renvoie le mindmap_id.

    Tout est validé SAUF, au choix, la carte elle-même : on isole ainsi le seul effet testé.
    """
    year = m.SchoolYear(student_id=student.id, label="2026-2027", level="4e", status="active")
    db.add(year)
    db.flush()
    sys_row = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject.id)
    db.add(sys_row)
    db.flush()
    chapter = m.Chapter(
        school_year_subject_id=sys_row.id,
        name="Chapitre test",
        validation_status="validated",
        sort_order=0,
    )
    db.add(chapter)
    db.flush()
    lesson = m.Lesson(
        chapter_id=chapter.id,
        title="Leçon test",
        status="validated",
        content_markdown="# Cours",
        created_by="ai",
        sort_order=0,
    )
    db.add(lesson)
    db.flush()
    mindmap = m.Mindmap(
        lesson_id=lesson.id,
        mindmap_json={
            "center": "Racine",
            "nodes": [{"id": "n1", "label": "Branche", "parent": None}],
        },
        validation_status="validated" if validated else "pending",
        source="generated",
    )
    db.add(mindmap)
    db.flush()
    mindmap_id = mindmap.id
    db.commit()
    return mindmap_id


def _make_mission(db, *, student, subject, mindmap_id: int, status: str) -> int:
    mission = m.Mission(
        student_id=student.id,
        subject_id=subject.id,
        title="Renforcer",
        mission_type="remediation",
        status=status,
        validation_status="validated",
        created_by="ai",
    )
    db.add(mission)
    db.flush()
    db.add(
        m.MissionStep(
            mission_id=mission.id,
            step_type=STEP_MINDMAP,
            resource_id=mindmap_id,
            sort_order=0,
            status="pending",
        )
    )
    db.commit()
    return mission.id


# --- La fonction d'engagement, isolément ---------------------------------------------------


def test_engagement_true_only_for_an_active_mission(client_db) -> None:
    """`planned` et `completed` n'ouvrent rien : seule une mission ENGAGÉE protège sa ressource."""
    _, TestSession = client_db
    db = TestSession()
    student, subject = _seeded(db)
    mindmap_id = _seed_mindmap(db, student=student, subject=subject, validated=False)

    mission_id = _make_mission(
        db, student=student, subject=subject, mindmap_id=mindmap_id, status="planned"
    )
    assert not is_engaged_in_active_mission(
        db, step_type=STEP_MINDMAP, resource_id=mindmap_id
    ), "une mission jamais démarrée n'a pas de parcours à protéger"

    mission = db.get(m.Mission, mission_id)
    mission.status = "active"
    db.commit()
    assert is_engaged_in_active_mission(db, step_type=STEP_MINDMAP, resource_id=mindmap_id)

    mission.status = "completed"
    db.commit()
    assert not is_engaged_in_active_mission(
        db, step_type=STEP_MINDMAP, resource_id=mindmap_id
    ), "une mission terminée n'a plus de parcours à protéger"
    db.close()


def test_engagement_is_scoped_to_resource_type_and_id(client_db) -> None:
    """Ni un autre id, ni un autre type d'étape, ni `None` n'ouvrent l'exception."""
    _, TestSession = client_db
    db = TestSession()
    student, subject = _seeded(db)
    mindmap_id = _seed_mindmap(db, student=student, subject=subject, validated=False)
    _make_mission(db, student=student, subject=subject, mindmap_id=mindmap_id, status="active")

    assert is_engaged_in_active_mission(db, step_type=STEP_MINDMAP, resource_id=mindmap_id)
    assert not is_engaged_in_active_mission(
        db, step_type=STEP_MINDMAP, resource_id=mindmap_id + 999
    )
    assert not is_engaged_in_active_mission(db, step_type="quiz", resource_id=mindmap_id)
    assert not is_engaged_in_active_mission(db, step_type=STEP_MINDMAP, resource_id=None)
    db.close()


def test_engagement_can_be_scoped_to_a_student(client_db) -> None:
    """Le filtre élève existe pour que le passage multi-enfant n'ait rien à rouvrir."""
    _, TestSession = client_db
    db = TestSession()
    student, subject = _seeded(db)
    mindmap_id = _seed_mindmap(db, student=student, subject=subject, validated=False)
    _make_mission(db, student=student, subject=subject, mindmap_id=mindmap_id, status="active")

    assert is_engaged_in_active_mission(
        db, step_type=STEP_MINDMAP, resource_id=mindmap_id, student_id=student.id
    )
    assert not is_engaged_in_active_mission(
        db, step_type=STEP_MINDMAP, resource_id=mindmap_id, student_id=student.id + 999
    )
    db.close()


# --- L'exception vue des routes élève ------------------------------------------------------


def test_pending_mindmap_stays_playable_while_its_mission_is_active(client_db) -> None:
    """Le cas qui motive l'exception : Papa édite pendant la mission, Massimo n'est pas bloqué."""
    client, TestSession = client_db
    db = TestSession()
    student, subject = _seeded(db)
    mindmap_id = _seed_mindmap(db, student=student, subject=subject, validated=False)
    _make_mission(db, student=student, subject=subject, mindmap_id=mindmap_id, status="active")
    db.close()

    assert client.get(f"/api/student/mindmaps/{mindmap_id}").status_code == 200
    # Et l'étape reste complétable : la tentative est acceptée et persistée.
    resp = client.post(f"/api/student/mindmaps/{mindmap_id}/attempts", json={"placements": []})
    assert resp.status_code == 200

    db = TestSession()
    assert db.scalar(select(m.MindmapAttempt)) is not None
    db.close()


def test_pending_mindmap_without_active_mission_stays_404(client_db) -> None:
    """Sans mission engagée, le gate est inchangé : aucun brouillon ne fuit."""
    client, TestSession = client_db
    db = TestSession()
    student, subject = _seeded(db)
    mindmap_id = _seed_mindmap(db, student=student, subject=subject, validated=False)
    db.close()

    assert client.get(f"/api/student/mindmaps/{mindmap_id}").status_code == 404
    assert (
        client.post(
            f"/api/student/mindmaps/{mindmap_id}/attempts", json={"placements": []}
        ).status_code
        == 404
    )


def test_engaged_mindmap_disappears_from_discovery(client_db) -> None:
    """VERROU : l'exception vaut pour l'achèvement, JAMAIS pour la découverte.

    Si ce test tombe, l'exception a débordé sur les decks — une carte non relue redeviendrait
    proposable à Massimo, ce que le gate `validated` existe précisément pour empêcher.
    """
    client, TestSession = client_db
    db = TestSession()
    student, subject = _seeded(db)
    subject_slug = subject.slug
    mindmap_id = _seed_mindmap(db, student=student, subject=subject, validated=False)
    _make_mission(db, student=student, subject=subject, mindmap_id=mindmap_id, status="active")
    db.close()

    deck = client.get(f"/api/student/subjects/{subject_slug}/mindmaps").json()
    assert [row for row in deck if row["id"] == mindmap_id] == []

    summary = client.get("/api/student/mindmaps/summary").json()
    counts = {row["slug"]: row["mindmap_count"] for row in summary["subjects"]}
    assert counts.get(subject_slug) == 0


# --- Verrous de cohérence ------------------------------------------------------------------


def test_step_type_constants_mirror_the_missions_vocabulary() -> None:
    """`engagement` duplique deux constantes de `missions` plutôt que d'en dépendre.

    Ce test est le prix de cette duplication : il échoue si le vocabulaire diverge.
    """
    from app.modules.missions import service as missions_service

    assert STEP_MINDMAP == missions_service.STEP_MINDMAP
    from app.modules.engagement.service import STEP_LESSON

    assert STEP_LESSON == missions_service.STEP_LESSON


def test_engagement_module_imports_no_consumer() -> None:
    """Neutralité (patron `evidence/`) : le substrat n'importe ni `missions/` ni un dérivé."""
    from pathlib import Path

    source = Path("app/modules/engagement/service.py").read_text(encoding="utf-8")
    for forbidden in (
        "from app.modules.missions",
        "from app.modules.mindmaps",
        "from app.modules.fiches",
        "from app.modules.quizzes",
    ):
        assert forbidden not in source, f"import interdit dans le substrat neutre : {forbidden}"
