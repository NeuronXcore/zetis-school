"""Tests « mindmap : reconstruire » comme étape de mission (ADR-0019).

Invariants : le step est généré ssi une mindmap validée couvre la notion (sinon omis), placé
après `vocal_explain` et avant le quiz ; sa preuve exige une reconstruction postérieure au start
avec `score > 0` ; le verdict (option B) admet la reconstruction comme signal de rappel
alternatif au quiz ; aucune fuite de score côté student.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

import app.db.models as m
from app.modules.missions import service


# --- Helpers ------------------------------------------------------------------------------


def _seeded(db):
    return (
        db.scalar(select(m.StudentProfile)),
        db.scalar(select(m.Skill)),
        db.scalar(select(m.Subject)),
    )


def _seed_mindmap_for_skill(db, skill, *, validated=True, lesson_validated=True) -> int:
    """Chapitre → leçon → LessonSkill → Mindmap couvrant `skill`. Renvoie le mindmap_id."""
    chapter = m.Chapter(name="Chapitre test", sort_order=0)
    db.add(chapter)
    db.flush()
    lesson = m.Lesson(
        chapter_id=chapter.id,
        title="Leçon test",
        status="validated" if lesson_validated else "draft",
        created_by="ai",
        sort_order=0,
    )
    db.add(lesson)
    db.flush()
    db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
    mindmap = m.Mindmap(
        lesson_id=lesson.id,
        mindmap_json={"center": "Racine", "nodes": []},
        validation_status="validated" if validated else "pending",
        source="generated",
    )
    db.add(mindmap)
    db.flush()
    mmid = mindmap.id
    db.commit()
    return mmid


def _add_ready_mission_quiz(db, skill, subject) -> int:
    """Un quiz de mission PRÊT lié à la leçon de la notion (pour tester l'ordre mindmap→quiz)."""
    lesson = db.scalar(
        select(m.Lesson)
        .join(m.LessonSkill, m.LessonSkill.lesson_id == m.Lesson.id)
        .where(m.LessonSkill.skill_id == skill.id)
    )
    quiz = m.Quiz(
        subject_id=subject.id,
        lesson_id=lesson.id,
        title="Quiz mission",
        quiz_type="mission",
        status="ready",
    )
    db.add(quiz)
    db.commit()
    return quiz.id


def _make_mission(db, *, student, skill, subject, steps, mission_type="remediation"):
    mission = m.Mission(
        student_id=student.id,
        subject_id=subject.id,
        skill_id=skill.id,
        title=f"Renforcer : {skill.name}",
        mission_type=mission_type,
        status="planned",
        validation_status="validated",
        priority=1,
        created_by="ai",
    )
    db.add(mission)
    db.flush()
    for index, (step_type, resource_id) in enumerate(steps):
        db.add(
            m.MissionStep(
                mission_id=mission.id,
                step_type=step_type,
                resource_id=resource_id,
                sort_order=index,
                status="pending",
            )
        )
    db.commit()
    return mission.id


def _add_reverse_event(db, *, student, skill, score, at):
    db.add(
        m.LearningEvent(
            student_id=student.id,
            subject_id=skill.subject_id,
            skill_id=skill.id,
            event_type="reverse_eli5",
            payload_json={"score": score},
            created_at=at,
        )
    )
    db.commit()


def _add_mindmap_attempt(db, *, student, mindmap_id, score, at):
    db.add(
        m.MindmapAttempt(student_id=student.id, mindmap_id=mindmap_id, score=score, created_at=at)
    )
    db.commit()


def _steps_of(client, mission_id):
    return next(mm for mm in client.get("/api/missions").json() if mm["id"] == mission_id)["steps"]


# --- Invariant : génération conditionnée à l'existence d'une mindmap validée ----------------


def test_step_generated_when_validated_mindmap_exists(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        mmid = _seed_mindmap_for_skill(db, skill)
        quiz_id = _add_ready_mission_quiz(db, skill, subject)
        steps = service._build_steps(db, skill.id, skill.name)
    types = [s[0] for s in steps]
    # Ordre : découvrir → réexpliquer → RECONSTRUIRE → vérifier.
    assert types == ["eli5", "vocal_explain", "mindmap", "quiz"]
    mindmap_step = next(s for s in steps if s[0] == "mindmap")
    assert mindmap_step[2] == mmid  # resource_id = mindmap_id
    quiz_step = next(s for s in steps if s[0] == "quiz")
    assert quiz_step[2] == quiz_id


def test_step_omitted_without_validated_mindmap(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        # Mindmap NON validée + leçon non validée → non résolue.
        _seed_mindmap_for_skill(db, skill, validated=False, lesson_validated=False)
        steps_no = service._build_steps(db, skill.id, skill.name)
    assert "mindmap" not in [s[0] for s in steps_no]


def test_revision_parcours_gets_mindmap(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        _seed_mindmap_for_skill(db, skill)
        steps = service._build_revision_steps(db, skill.id, skill.name)
    assert "mindmap" in [s[0] for s in steps]


# --- Invariant : preuve = reconstruction postérieure au start, score > 0 -------------------


def test_proof_requires_posterior_attempt_with_positive_score(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        mmid = _seed_mindmap_for_skill(db, skill)
        mid = _make_mission(
            db,
            student=student,
            skill=skill,
            subject=subject,
            steps=[("eli5", skill.id), ("vocal_explain", skill.id), ("mindmap", mmid)],
        )
    steps = _steps_of(client, mid)
    client.post(f"/api/missions/{mid}/start")
    client.post(f"/api/missions/{mid}/steps/{steps[0]['id']}/complete")  # eli5 (consult)
    with Session() as db:
        student, skill, _ = _seeded(db)
        started = db.get(m.Mission, mid).started_at
        _add_reverse_event(db, student=student, skill=skill, score=80, at=started + timedelta(seconds=1))
    client.post(f"/api/missions/{mid}/steps/{steps[1]['id']}/complete")  # vocal

    mindmap_step_id = steps[2]["id"]
    # a) Aucune tentative → 409.
    assert client.post(f"/api/missions/{mid}/steps/{mindmap_step_id}/complete").status_code == 409
    with Session() as db:
        student, _, _ = _seeded(db)
        started = db.get(m.Mission, mid).started_at
        # b) Tentative ANTÉRIEURE au start → ne compte pas.
        _add_mindmap_attempt(db, student=student, mindmap_id=mmid, score=90, at=started - timedelta(hours=1))
    assert client.post(f"/api/missions/{mid}/steps/{mindmap_step_id}/complete").status_code == 409
    with Session() as db:
        student, _, _ = _seeded(db)
        started = db.get(m.Mission, mid).started_at
        # c) Tentative postérieure mais score 0 → ne vaut pas complétion.
        _add_mindmap_attempt(db, student=student, mindmap_id=mmid, score=0, at=started + timedelta(seconds=2))
    assert client.post(f"/api/missions/{mid}/steps/{mindmap_step_id}/complete").status_code == 409
    with Session() as db:
        student, _, _ = _seeded(db)
        started = db.get(m.Mission, mid).started_at
        _add_mindmap_attempt(db, student=student, mindmap_id=mmid, score=75, at=started + timedelta(seconds=3))
    # d) Postérieure, score > 0 → 200.
    assert client.post(f"/api/missions/{mid}/steps/{mindmap_step_id}/complete").status_code == 200


# --- Invariant : verdict option B — la reconstruction se substitue au quiz ------------------


def _run_no_quiz_mission(client_db, *, reverse_score, mindmap_score):
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        db.add(m.Gap(student_id=student.id, skill_id=skill.id, subject_id=subject.id, status="open"))
        db.commit()
        mmid = _seed_mindmap_for_skill(db, skill)
        mid = _make_mission(
            db,
            student=student,
            skill=skill,
            subject=subject,
            steps=[("eli5", skill.id), ("vocal_explain", skill.id), ("mindmap", mmid)],
        )
    steps = _steps_of(client, mid)
    client.post(f"/api/missions/{mid}/start")
    with Session() as db:
        student, skill, _ = _seeded(db)
        started = db.get(m.Mission, mid).started_at
        after = started + timedelta(seconds=1)
        _add_reverse_event(db, student=student, skill=skill, score=reverse_score, at=after)
        _add_mindmap_attempt(db, student=student, mindmap_id=mmid, score=mindmap_score, at=after)
    client.post(f"/api/missions/{mid}/steps/{steps[0]['id']}/complete")
    client.post(f"/api/missions/{mid}/steps/{steps[1]['id']}/complete")
    return client.post(f"/api/missions/{mid}/steps/{steps[2]['id']}/complete").json()


def test_verdict_acquired_via_mindmap_without_quiz(client_db) -> None:
    # reverse≥70 ET mindmap≥70, PAS de quiz → acquired (option B : mindmap = rappel).
    res = _run_no_quiz_mission(client_db, reverse_score=90, mindmap_score=80)
    assert res["verdict"] == "acquired"
    _, Session = client_db
    with Session() as db:
        _, skill, _ = _seeded(db)
        gap = db.scalar(select(m.Gap).where(m.Gap.skill_id == skill.id))
        assert gap is not None and gap.status == "resolved"


def test_verdict_review_later_when_mindmap_below_threshold(client_db) -> None:
    # reverse≥70 mais mindmap<70 et pas de quiz → pas de rappel prouvé → review_later.
    res = _run_no_quiz_mission(client_db, reverse_score=90, mindmap_score=50)
    assert res["verdict"] == "review_later"


def test_verdict_review_later_when_reverse_low(client_db) -> None:
    # reverse<70 → review_later quel que soit le mindmap (la réexplication reste requise).
    res = _run_no_quiz_mission(client_db, reverse_score=40, mindmap_score=95)
    assert res["verdict"] == "review_later"


# --- Invariant : aucune fuite de score côté student ; pilot expose la preuve ----------------


def test_no_score_leak_student_but_pilot_shows_proof(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        mmid = _seed_mindmap_for_skill(db, skill)
        mid = _make_mission(
            db,
            student=student,
            skill=skill,
            subject=subject,
            steps=[("eli5", skill.id), ("vocal_explain", skill.id), ("mindmap", mmid)],
        )
    # Route student : le step mindmap n'expose que les champs génériques, aucune preuve/score.
    student_step = next(s for s in _steps_of(client, mid) if s["step_type"] == "mindmap")
    # `skill_id`/`skill_name`/`subject` (ADR-0022) sont des étiquettes de notion/matière, pas des
    # scores/facteurs — frontière §3 OK (la preuve `proof` reste, elle, pilot-only).
    assert set(student_step) == {
        "id", "step_type", "instruction", "resource_id", "skill_id", "skill_name", "subject",
        "sort_order", "status",
    }
    assert "proof" not in student_step
    # Route pilot (Papa) : la preuve est exposée avec le label « Mindmap ».
    pilot = next(mm for mm in client.get("/api/missions/pilot").json() if mm["id"] == mid)
    pilot_step = next(s for s in pilot["steps"] if s["step_type"] == "mindmap")
    assert pilot_step["proof"]["label"] == "Mindmap"
