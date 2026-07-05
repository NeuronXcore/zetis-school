"""Tests Lot 2 — sélecteur déterministe, évidence, générateurs, frontière de schémas (ADR-0017).

Invariants 7–11 du prompt lot 2 (ceux du lot 1 restent dans test_missions.py)."""

import inspect

from sqlalchemy import select

import app.db.models as m
from app.modules.missions.schemas import MissionPilotOut, MissionStudentOut
from app.modules.missions.selector import REASON_PHRASES


def _seeded(db):
    return (
        db.scalar(select(m.StudentProfile)),
        db.scalar(select(m.Skill)),
        db.scalar(select(m.Subject)),
    )


def _mk(db, *, student, subject, skill=None, mtype, validation="validated", status="planned", priority=1, title="M"):
    mission = m.Mission(
        student_id=student.id,
        subject_id=subject.id,
        skill_id=skill.id if skill is not None else None,
        title=title,
        mission_type=mtype,
        status=status,
        validation_status=validation,
        priority=priority,
        created_by="ai",
    )
    db.add(mission)
    db.flush()
    db.add(
        m.MissionStep(
            mission_id=mission.id,
            step_type="eli5",
            instruction="x",
            resource_id=skill.id if skill is not None else None,
            sort_order=0,
            status="pending",
        )
    )
    db.commit()
    return mission.id


def _today(client):
    return client.get("/api/missions/today").json()


def _today_ids(today):
    return {mm["id"] for mm in ([today["elected"]] if today["elected"] else []) + today["alternatives"]}


# --- Invariant 7 : le sélecteur n'élit jamais une pending ----------------------------------


def test_selector_never_elects_pending(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        pend = _mk(db, student=student, subject=subject, skill=skill, mtype="remediation", validation="pending")
        val = _mk(db, student=student, subject=subject, skill=skill, mtype="remediation", validation="validated")
    today = _today(client)
    assert today["elected"] is not None and today["elected"]["id"] == val
    assert pend not in _today_ids(today)


# --- Invariant 8 : même état de base ⇒ même élection (déterminisme) -------------------------


def test_selection_is_deterministic(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        for i in range(3):
            _mk(db, student=student, subject=subject, skill=skill, mtype="remediation", title=f"M{i}")
    first = _today(client)
    for _ in range(4):
        again = _today(client)
        assert again["elected"]["id"] == first["elected"]["id"]
        assert [a["id"] for a in again["alternatives"]] == [a["id"] for a in first["alternatives"]]


# --- Invariant 9 : variety — même matière que la dernière complétée ⇒ malus ----------------


def test_variety_penalizes_recent_subject(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skillA, subjectA = _seeded(db)
        subjectB = m.Subject(name="Français", slug="francais")
        db.add(subjectB)
        db.flush()
        skillB = m.Skill(subject_id=subjectB.id, name="Grammaire", level="4e")
        db.add(skillB)
        db.flush()
        # Dernière mission complétée en matière A → variety cible A.
        db.add(
            m.Mission(
                student_id=student.id,
                subject_id=subjectA.id,
                skill_id=skillA.id,
                title="done",
                mission_type="remediation",
                status="completed",
                validation_status="validated",
            )
        )
        db.commit()
        _mk(db, student=student, subject=subjectA, skill=skillA, mtype="remediation", title="A")
        _mk(db, student=student, subject=subjectB, skill=skillB, mtype="remediation", title="B")
    # Sans autre signal, A et B sont à égalité SAUF le malus variety sur A → B élue.
    assert _today(client)["elected"]["subject"] == "Français"


# --- Invariant 10 : la raison servie ∈ dictionnaire figé (jamais de texte libre) -----------


def test_reason_is_from_frozen_dict(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        db.add(m.Gap(student_id=student.id, skill_id=skill.id, subject_id=subject.id, severity="high", status="open"))
        db.commit()
        _mk(db, student=student, subject=subject, skill=skill, mtype="remediation")
    today = _today(client)
    allowed_reasons = set(REASON_PHRASES.values()) | {"Tu n'as rien d'obligatoire maintenant."}
    allowed_codes = set(REASON_PHRASES) | {"none"}
    assert today["reason"] in allowed_reasons
    assert today["reason_code"] in allowed_codes
    # La lacune sévère fait de `severity` le facteur dominant.
    assert today["reason_code"] == "severity"


def test_empty_pool_serves_serene_state(client_db) -> None:
    client, _ = client_db
    today = _today(client)  # aucune mission validée
    assert today["elected"] is None
    assert today["reason_code"] == "none"


# --- Invariant 11 : aucun champ pilot n'apparaît dans une réponse student ------------------


def test_student_response_has_no_pilot_only_fields(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        _mk(db, student=student, subject=subject, skill=skill, mtype="remediation")

    pilot_only = set(MissionPilotOut.model_fields) - set(MissionStudentOut.model_fields)
    assert {"validation_status", "generation_reason", "subject_id", "created_by"} <= pilot_only

    listed = client.get("/api/missions").json()
    assert listed, "au moins une mission validée attendue"
    for mission in listed:
        for field in pilot_only:
            assert field not in mission, f"champ pilot '{field}' fuité côté student"
        for step in mission["steps"]:
            assert "proof" not in step  # les preuves brutes sont pilot-only

    elected = _today(client)["elected"]
    for field in pilot_only:
        assert field not in elected


# --- Checklist item 2 : le service d'évidence n'importe ni missions ni conseil --------------


def test_evidence_module_is_neutral() -> None:
    import app.modules.evidence.service as ev

    # On vise les IMPORTS (la prose peut nommer « missions » / « conseil » sans les importer).
    import_lines = "\n".join(
        line for line in inspect.getsource(ev).splitlines()
        if line.strip().startswith(("import ", "from "))
    )
    assert "app.modules.missions" not in import_lines
    assert "class_council" not in import_lines and "conseil" not in import_lines


# --- Générateurs par source ----------------------------------------------------------------


def test_generate_revision_from_due_cards(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, _ = _seeded(db)
        from datetime import datetime, timedelta, timezone

        db.add(
            m.SpacedReviewCard(
                student_id=student.id,
                skill_id=skill.id,
                front_markdown="f",
                back_markdown="b",
                due_at=datetime.now(timezone.utc) - timedelta(days=1),
                status="scheduled",
            )
        )
        db.commit()
    created = client.post("/api/missions/generate-revision").json()
    assert created["created"] >= 1
    assert created["missions"][0]["mission_type"] == "revision"
    # Naît pending → visible côté pilotage, pas côté student.
    pend = client.get("/api/missions/pending").json()
    assert any(mm["mission_type"] == "revision" for mm in pend)


def test_generate_progression_from_curriculum(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        year = m.SchoolYear(student_id=student.id, label="2026-2027", level="4e", status="active")
        db.add(year)
        db.flush()
        sys = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject.id, status="active")
        db.add(sys)
        db.flush()
        chap = m.Chapter(school_year_subject_id=sys.id, name="Ch1", status="active", validation_status="validated", sort_order=0)
        db.add(chap)
        db.flush()
        lesson = m.Lesson(chapter_id=chap.id, title="L1", status="validated", created_by="ai", sort_order=0)
        db.add(lesson)
        db.flush()
        db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
        db.commit()
    created = client.post("/api/missions/generate-progression").json()
    assert created["created"] >= 1
    mtypes = [mm["mission_type"] for mm in created["missions"]]
    assert "progression" in mtypes


# --- Pilotage Papa : élection recalculée + KPI ---------------------------------------------


def test_pilot_election_exposes_factors(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        db.add(m.Gap(student_id=student.id, skill_id=skill.id, subject_id=subject.id, severity="high", status="open"))
        db.commit()
        _mk(db, student=student, subject=subject, skill=skill, mtype="remediation")
    election = client.get("/api/missions/election/today").json()
    assert election["elected"] is not None
    names = {f["name"] for f in election["factors"]}
    assert {"severity", "due_pressure", "continuity", "variety", "forced_priority"} == names
    assert election["scoring_version"] == "v1"
    assert any(f["dominant"] for f in election["factors"])
    # generation_reason calculé côté pilot.
    assert election["elected"]["generation_reason"].startswith("Lacune")


def test_pilot_summary_counts(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        _mk(db, student=student, subject=subject, skill=skill, mtype="remediation", validation="pending")
        _mk(db, student=student, subject=subject, skill=skill, mtype="remediation", validation="validated")
    s = client.get("/api/missions/pilot/summary").json()
    assert s["pending"] >= 1 and s["pool"] >= 1
    assert 0.0 <= s["acquired_rate_30d"] <= 1.0
