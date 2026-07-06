"""Tests pilotage cycle de vie des missions (Papa) : delete / regenerate / patch / éditeur de
parcours (step-options + set-steps). Routes pilot-only.
"""

from datetime import date

from sqlalchemy import func, select

import app.db.models as m


def _seeded(db):
    return (
        db.scalar(select(m.StudentProfile)),
        db.scalar(select(m.Skill)),
        db.scalar(select(m.Subject)),
    )


def _seed_mindmap_for_skill(db, skill) -> int:
    chapter = m.Chapter(name="Chapitre", sort_order=0)
    db.add(chapter)
    db.flush()
    lesson = m.Lesson(
        chapter_id=chapter.id, title="Leçon", status="validated", created_by="ai", sort_order=0
    )
    db.add(lesson)
    db.flush()
    db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
    mm = m.Mindmap(
        lesson_id=lesson.id, mindmap_json={"center": "x"}, validation_status="validated",
        source="generated",
    )
    db.add(mm)
    db.flush()
    mmid = mm.id
    db.commit()
    return mmid


def _make_mission(db, *, student, skill, subject, steps, status="planned", mtype="remediation"):
    mission = m.Mission(
        student_id=student.id,
        subject_id=subject.id,
        skill_id=skill.id,
        title=f"Renforcer : {skill.name}",
        mission_type=mtype,
        status=status,
        validation_status="validated",
        priority=1,
        created_by="ai",
    )
    db.add(mission)
    db.flush()
    for i, (t, rid) in enumerate(steps):
        db.add(m.MissionStep(mission_id=mission.id, step_type=t, resource_id=rid, sort_order=i, status="pending"))
    db.commit()
    return mission.id


def _step_types(client, mission_id):
    mm = next(x for x in client.get("/api/missions/pilot").json() if x["id"] == mission_id)
    return [s["step_type"] for s in mm["steps"]]


# --- delete ---------------------------------------------------------------------------------


def test_delete_removes_mission_and_steps(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        mid = _make_mission(db, student=student, skill=skill, subject=subject,
                            steps=[("eli5", skill.id), ("vocal_explain", skill.id)])
    assert client.delete(f"/api/missions/{mid}").json() == {"deleted": True, "id": mid}
    with Session() as db:
        assert db.get(m.Mission, mid) is None
        assert db.scalar(select(func.count()).select_from(m.MissionStep).where(m.MissionStep.mission_id == mid)) == 0
    assert all(x["id"] != mid for x in client.get("/api/missions/pilot").json())


def test_delete_unknown_is_404(client_db) -> None:
    client, _ = client_db
    assert client.delete("/api/missions/999999").status_code == 404


# --- regenerate -----------------------------------------------------------------------------


def test_regenerate_rebuilds_parcours_and_keeps_validation(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        _seed_mindmap_for_skill(db, skill)  # rend le step mindmap résoluble
        # Parcours amputé (juste eli5) → regenerate reconstruit le parcours complet. La mission est
        # `remediation` (notion déjà vue) → RAPPEL d'abord (ADR-0017 §5) : mindmap → eli5 → vocal.
        mid = _make_mission(db, student=student, skill=skill, subject=subject, steps=[("eli5", skill.id)])
    res = client.post(f"/api/missions/{mid}/regenerate")
    assert res.status_code == 200
    assert [s["step_type"] for s in res.json()["steps"]] == ["mindmap", "eli5", "vocal_explain"]
    assert res.json()["validation_status"] == "validated"  # inchangé


def test_regenerate_refused_when_started(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        mid = _make_mission(db, student=student, skill=skill, subject=subject,
                            steps=[("eli5", skill.id)], status="active")
    assert client.post(f"/api/missions/{mid}/regenerate").status_code == 409


# --- patch ----------------------------------------------------------------------------------


def test_patch_updates_safe_fields_only(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        skill_id = skill.id
        mid = _make_mission(db, student=student, skill=skill, subject=subject, steps=[("eli5", skill.id)])
    res = client.patch(f"/api/missions/{mid}", json={
        "title": "Titre édité", "priority": 3, "force_priority": True, "due_date": "2026-09-01",
    })
    assert res.status_code == 200
    body = res.json()
    assert body["title"] == "Titre édité" and body["priority"] == 3
    assert body["force_priority"] is True and body["due_date"] == "2026-09-01"
    with Session() as db:
        mm = db.get(m.Mission, mid)
        # Immuables intacts.
        assert mm.mission_type == "remediation" and mm.skill_id == skill_id
        assert mm.validation_status == "validated" and mm.status == "planned"


# --- éditeur de parcours : step-options + set-steps -----------------------------------------


def test_step_options_reports_availability(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        _seed_mindmap_for_skill(db, skill)
        mid = _make_mission(db, student=student, skill=skill, subject=subject,
                            steps=[("eli5", skill.id), ("vocal_explain", skill.id)])
    opts = client.get(f"/api/missions/{mid}/step-options").json()
    by_type = {o["step_type"]: o for o in opts["options"]}
    assert by_type["eli5"]["available"] and by_type["vocal_explain"]["available"]
    assert by_type["mindmap"]["available"] is True  # carte validée seedée
    assert by_type["quiz"]["available"] is False  # aucun quiz de mission prêt
    assert opts["current_types"] == ["eli5", "vocal_explain"] and opts["editable"] is True
    assert by_type["eli5"]["selected"] and not by_type["mindmap"]["selected"]


def test_set_steps_reorders_and_rebuilds(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        _seed_mindmap_for_skill(db, skill)
        mid = _make_mission(db, student=student, skill=skill, subject=subject,
                            steps=[("eli5", skill.id), ("vocal_explain", skill.id)])
    res = client.put(f"/api/missions/{mid}/steps", json={"step_types": ["mindmap", "eli5"]})
    assert res.status_code == 200
    assert [s["step_type"] for s in res.json()["steps"]] == ["mindmap", "eli5"]
    assert _step_types(client, mid) == ["mindmap", "eli5"]


def test_set_steps_rejects_unavailable_type(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        mid = _make_mission(db, student=student, skill=skill, subject=subject, steps=[("eli5", skill.id)])
    # quiz indisponible (aucun quiz de mission prêt) → 409.
    assert client.put(f"/api/missions/{mid}/steps", json={"step_types": ["eli5", "quiz"]}).status_code == 409


def test_set_steps_requires_at_least_one_and_planned(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        mid = _make_mission(db, student=student, skill=skill, subject=subject, steps=[("eli5", skill.id)])
        started = _make_mission(db, student=student, skill=skill, subject=subject,
                                steps=[("eli5", skill.id)], status="active")
    assert client.put(f"/api/missions/{mid}/steps", json={"step_types": []}).status_code == 422
    assert client.put(f"/api/missions/{started}/steps", json={"step_types": ["eli5"]}).status_code == 409
