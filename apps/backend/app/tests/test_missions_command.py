"""Tests « Commander une mission » (ADR-0018) — invariants du flux manuel Papa.

Sept invariants : manual naît validated · preview n'écrit rien · notion maîtrisée décochée ·
k notions cochées ⇒ k missions mono-skill · refus au-delà du plafond · force_priority = plancher
lu par mission · due_date absente de toute réponse student.
"""

from datetime import date

from sqlalchemy import func, select

import app.db.models as m
from app.core.config import settings
from app.modules.missions.schemas import MissionStudentOut


def _seeded(db):
    return (
        db.scalar(select(m.StudentProfile)),
        db.scalar(select(m.Subject)),
    )


def _chapter(db, subject, names):
    """Chapitre + une leçon validée portant `names` notions ; renvoie (chapter_id, [skill_id])."""
    chapter = m.Chapter(name="Chapitre test", sort_order=0)
    db.add(chapter)
    db.flush()
    lesson = m.Lesson(
        chapter_id=chapter.id, title="Leçon", status="validated", created_by="ai", sort_order=0
    )
    db.add(lesson)
    db.flush()
    skill_ids = []
    for i, name in enumerate(names):
        sk = m.Skill(subject_id=subject.id, name=name, level="4e")
        db.add(sk)
        db.flush()
        db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=sk.id))
        skill_ids.append(sk.id)
    db.commit()
    return chapter.id, skill_ids


def _preview(client, chapter_id, gate="theme_ref"):
    return client.post(
        "/api/missions/command/preview", json={"gate": gate, "chapter_id": chapter_id}
    )


# --- Invariant : preview n'écrit rien en base (patron ADR-0010) -----------------------------


def test_preview_writes_nothing(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _, subject = _seeded(db)
        chapter_id, _ = _chapter(db, subject, ["A", "B"])
        before = db.scalar(select(func.count()).select_from(m.Mission))
    res = _preview(client, chapter_id)
    assert res.status_code == 200
    assert len(res.json()["notions"]) == 2
    with Session() as db:
        after = db.scalar(select(func.count()).select_from(m.Mission))
    assert before == after == 0


# --- Invariant : une notion maîtrisée (mastery ≥ seuil) arrive décochée ----------------------


def test_mastered_notion_unchecked(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, subject = _seeded(db)
        chapter_id, skill_ids = _chapter(db, subject, ["Fragile", "Solide"])
        db.add(
            m.SkillMastery(
                student_id=student.id,
                skill_id=skill_ids[1],
                mastery_score=settings.mission_command_mastered_threshold + 0.05,
                status="mastered",
            )
        )
        db.commit()
    notions = {n["skill_id"]: n for n in _preview(client, chapter_id).json()["notions"]}
    assert notions[skill_ids[0]]["checked"] is True  # fragile → proposé coché
    assert notions[skill_ids[1]]["checked"] is False  # maîtrisé → décoché (recochable)


# --- Invariant : k notions cochées ⇒ k missions, chacune mono-skill, toutes validated --------


def test_confirm_fans_out_one_mission_per_skill(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _, subject = _seeded(db)
        _, skill_ids = _chapter(db, subject, ["A", "B"])
    res = client.post(
        "/api/missions/command/confirm",
        json={"gate": "theme_ref", "skill_ids": skill_ids, "force_priority": False},
    )
    assert res.status_code == 200
    missions = res.json()
    assert len(missions) == len(skill_ids)  # k cochées ⇒ k missions
    for mission in missions:
        assert mission["mission_type"] == "manual"
        assert mission["validation_status"] == "validated"  # naît validated par construction
        assert mission["created_by"] == "parent"
        assert mission["skill_id"] in skill_ids  # mono-skill
    assert {mm["skill_id"] for mm in missions} == set(skill_ids)


# --- Invariant : refus au-delà du plafond MISSION_COMMAND_MAX_SKILLS -------------------------


def test_confirm_refuses_above_cap(client_db) -> None:
    client, Session = client_db
    over = settings.mission_command_max_skills + 1
    with Session() as db:
        _, subject = _seeded(db)
        _, skill_ids = _chapter(db, subject, [f"N{i}" for i in range(over)])
    res = client.post(
        "/api/missions/command/confirm",
        json={"gate": "theme_ref", "skill_ids": skill_ids, "force_priority": False},
    )
    assert res.status_code == 422


# --- Invariant : force_priority = plancher lu PAR MISSION (v2), pas par le type --------------


def test_force_priority_floors_election(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, subject = _seeded(db)
        _, skill_ids = _chapter(db, subject, ["A"])
    # manual prioritaire → doit être plancher-isée et élue.
    client.post(
        "/api/missions/command/confirm",
        json={"gate": "deadline", "skill_ids": skill_ids, "force_priority": True},
    )
    election = client.get("/api/missions/election/today").json()
    assert election["elected"] is not None
    forced = next(f for f in election["factors"] if f["name"] == "forced_priority")
    assert forced["value"] == 1.0 and forced["dominant"]


def test_manual_without_force_priority_not_floored(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, subject = _seeded(db)
        _, skill_ids = _chapter(db, subject, ["A"])
    client.post(
        "/api/missions/command/confirm",
        json={"gate": "theme_ref", "skill_ids": skill_ids, "force_priority": False},
    )
    election = client.get("/api/missions/election/today").json()
    forced = next(f for f in election["factors"] if f["name"] == "forced_priority")
    assert forced["value"] == 0.0  # non prioritaire ⇒ pas de plancher (découplé du type manual)


# --- Invariant : due_date informationnelle Papa — absente de toute réponse student ----------


def test_due_date_absent_from_student_surfaces(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _, subject = _seeded(db)
        _, skill_ids = _chapter(db, subject, ["A"])
    client.post(
        "/api/missions/command/confirm",
        json={
            "gate": "deadline",
            "skill_ids": skill_ids,
            "due_date": "2026-07-10",
            "force_priority": True,
        },
    )
    # a) le schéma student n'a pas le champ
    assert "due_date" not in MissionStudentOut.model_fields
    # b) aucune réponse student ne le sérialise
    for mission in client.get("/api/missions").json():
        assert "due_date" not in mission
        assert "force_priority" not in mission
    today = client.get("/api/missions/today").json()
    surfaced = ([today["elected"]] if today["elected"] else []) + today["alternatives"]
    for mission in surfaced:
        assert "due_date" not in mission
    # c) la due_date EST bien exposée côté Papa (pilotage)
    pilot = client.get("/api/missions/pilot").json()
    assert any(mm.get("due_date") == "2026-07-10" for mm in pilot)
