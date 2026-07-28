"""Tests de la progression : lacunes ouvertes et notions consolidées (stocks, Papa)."""

from datetime import datetime, timezone

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user

UTC = timezone.utc


def _as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def _seed(TestSession) -> dict:
    """Une matière, trois notions, des lacunes de sévérités variées et des maîtrises."""
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        subject = db.query(m.Subject).first()
        skills = []
        for name in ("Nombres relatifs", "Fractions", "Théorème de Pythagore"):
            skill = m.Skill(subject_id=subject.id, name=name, level="4e")
            db.add(skill)
            skills.append(skill)
        db.flush()

        # Lacunes : une haute, une basse, une RÉSOLUE (ne doit pas compter).
        db.add(
            m.Gap(
                student_id=student.id,
                skill_id=skills[0].id,
                subject_id=subject.id,
                severity="low",
                status="open",
                first_detected_at=datetime(2026, 7, 1, tzinfo=UTC),
            )
        )
        db.add(
            m.Gap(
                student_id=student.id,
                skill_id=skills[1].id,
                subject_id=subject.id,
                severity="high",
                status="in_progress",
            )
        )
        db.add(
            m.Gap(
                student_id=student.id,
                skill_id=skills[2].id,
                subject_id=subject.id,
                severity="high",
                status="resolved",
            )
        )

        # Maîtrises : une `mastered`, une `solid` (volontairement NON comptée).
        db.add(
            m.SkillMastery(
                student_id=student.id, skill_id=skills[0].id, mastery_score=95, status="mastered"
            )
        )
        db.add(
            m.SkillMastery(
                student_id=student.id, skill_id=skills[1].id, mastery_score=75, status="solid"
            )
        )
        db.commit()
        return {"student_id": student.id, "subject_slug": subject.slug}


def test_open_gaps_excludes_resolved_and_sorts_by_severity(client_db) -> None:
    client, TestSession = client_db
    _seed(TestSession)
    _as_papa()

    body = client.get("/api/parent/progress/gaps").json()

    # La lacune `resolved` est exclue : « ouverte » = open | in_progress, comme pour les missions.
    assert [g["skill_name"] for g in body] == ["Fractions", "Nombres relatifs"]
    assert body[0]["severity"] == "high"  # le plus urgent d'abord
    assert body[0]["status"] == "in_progress"
    assert body[1]["first_detected_at"].startswith("2026-07-01")
    assert body[0]["subject_name"] == "Mathématiques"


def test_consolidated_counts_mastered_only(client_db) -> None:
    """« Consolidé » veut dire acquis : `solid` (≥ 70) ne compte pas."""
    client, TestSession = client_db
    _seed(TestSession)
    _as_papa()

    body = client.get("/api/parent/progress/consolidated").json()

    assert [s["skill_name"] for s in body] == ["Nombres relatifs"]
    assert body[0]["mastery_score"] == 95


def test_dashboard_serves_both_counts_without_delta(client_db) -> None:
    """Les stocks sont servis SANS delta : le modèle ne permet pas de reconstituer l'état
    d'il y a une semaine (ni `resolved_at`, ni horodatage de bascule `mastered`)."""
    client, TestSession = client_db
    _seed(TestSession)
    _as_papa()

    body = client.get("/api/parent/dashboard").json()

    assert body["open_gaps"] == {"value": 2}
    assert body["consolidated_skills"] == {"value": 1}
    # Les flux hebdomadaires, eux, gardent leur écart.
    assert set(body["sessions"]) == {"value", "delta"}


def test_progress_routes_are_forbidden_for_child(client_db) -> None:
    """Analyses parentales : jamais servies à Massimo."""
    client, _ = client_db
    assert client.get("/api/parent/progress/gaps").status_code == 403
    assert client.get("/api/parent/progress/consolidated").status_code == 403


def test_empty_state_is_clean(client_db) -> None:
    """Aucune lacune ni maîtrise en base : listes vides et compteurs à zéro, pas d'erreur."""
    client, _ = client_db
    _as_papa()

    assert client.get("/api/parent/progress/gaps").json() == []
    assert client.get("/api/parent/progress/consolidated").json() == []
    body = client.get("/api/parent/dashboard").json()
    assert body["open_gaps"]["value"] == 0
    assert body["consolidated_skills"]["value"] == 0
