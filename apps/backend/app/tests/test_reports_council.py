"""Conseil de classe IA (ADR-0020) — narration locale sur évidence, ancrage `skill_id`
anti-hallucination, dégradation gracieuse, Papa-only, pont Commander."""

from sqlalchemy import select

import app.db.models as m
from app.main import app
from app.modules.ai import get_provider
from app.modules.auth.deps import get_current_user
from app.tests.fakes import FakeLLMProvider


def _as_parent() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def _seed_mastery(db, *, score: float = 0.2):
    """Fait apparaître la notion seedée dans l'évidence (maîtrise faible = fragile)."""
    student = db.scalar(select(m.StudentProfile))
    skill = db.scalar(select(m.Skill))
    db.add(
        m.SkillMastery(
            student_id=student.id, skill_id=skill.id, mastery_score=score, status="in_progress"
        )
    )
    db.commit()
    return student, skill


def test_council_requires_parent(client_db) -> None:
    client, _ = client_db
    # Rôle enfant par défaut (conftest) → route Papa refusée.
    assert client.post("/api/reports/class-council", json={}).status_code == 403


def test_generate_empty_evidence_is_graceful(client_db) -> None:
    client, _ = client_db
    _as_parent()
    # Aucune mastery/lacune seedée → pas d'appel LLM, rapport serein.
    r = client.post("/api/reports/class-council", json={})
    assert r.status_code == 200
    body = r.json()
    assert body["subjects"] == []
    assert "assez de données" in body["global_summary"].lower()


def test_generate_narrates_and_anchors_skill_ids(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _, skill = _seed_mastery(db)
        real_id = skill.id
        subject_id = db.get(m.Skill, real_id).subject_id
    _as_parent()
    # Le LLM (fake) renvoie une reco mêlant le skill réel ET un id inventé (999999).
    app.dependency_overrides[get_provider] = lambda: FakeLLMProvider(
        council={
            "global_summary": "Bilan encourageant.",
            "subjects": [
                {
                    "subject_id": subject_id,
                    "subject_name": "Mathématiques",
                    "strengths": "des bases solides",
                    "to_reinforce": "une notion en construction",
                    "recent_evolution": "stable",
                    "recommendations": [
                        {
                            "skill_ids": [real_id, 999999],
                            "mission_type": "manual",
                            "template_hint": "recall_first",
                            "justification": "maîtrise en construction",
                        }
                    ],
                }
            ],
        }
    )
    r = client.post("/api/reports/class-council", json={"period": "Trimestre 1"})
    assert r.status_code == 200
    body = r.json()
    assert body["period"] == "Trimestre 1"
    assert len(body["subjects"]) == 1
    reco = body["subjects"][0]["recommendations"][0]
    # Ancrage : le skill réel est gardé, l'id inventé (hors évidence) est retiré.
    assert real_id in reco["skill_ids"]
    assert 999999 not in reco["skill_ids"]
    assert reco["skill_names"] and all(reco["skill_names"])  # noms résolus pour l'affichage
    # Trace IA + persistance figée.
    with Session() as db:
        job = db.scalar(select(m.AIJob).where(m.AIJob.job_type == "council_generate"))
        assert job is not None and job.status == "succeeded"
        report = db.scalar(select(m.CouncilReport))
        assert report is not None and report.evidence_snapshot_json["subjects"]


def test_anchoring_drops_unknown_subject(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _seed_mastery(db)
    _as_parent()
    app.dependency_overrides[get_provider] = lambda: FakeLLMProvider(
        council={
            "global_summary": "x",
            "subjects": [
                {
                    "subject_id": 987654,  # matière absente de l'évidence
                    "subject_name": "Inventée",
                    "strengths": "",
                    "to_reinforce": "",
                    "recent_evolution": "",
                    "recommendations": [],
                }
            ],
        }
    )
    r = client.post("/api/reports/class-council", json={})
    assert r.status_code == 200
    assert r.json()["subjects"] == []  # matière hors évidence retirée


def test_create_missions_from_reco_reuses_commander(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _, skill = _seed_mastery(db)
        real_id = skill.id
    _as_parent()
    r = client.post(
        "/api/reports/class-council/create-missions",
        json={"skill_ids": [real_id], "force_priority": True},
    )
    assert r.status_code == 200
    assert len(r.json()) == 1
    with Session() as db:
        mission = db.scalar(select(m.Mission).where(m.Mission.mission_type == "manual"))
        assert mission is not None
        assert mission.skill_id == real_id
        # 5ter : validée par construction (le clic Papa EST l'approbation) + priorité forcée.
        assert mission.validation_status == "validated"
        assert mission.force_priority is True


def test_list_and_get_report(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _seed_mastery(db)
    _as_parent()
    rid = client.post("/api/reports/class-council", json={"period": "T1"}).json()["id"]
    listed = client.get("/api/reports/class-council").json()
    assert any(item["id"] == rid and item["period"] == "T1" for item in listed)
    detail = client.get(f"/api/reports/class-council/{rid}").json()
    assert detail["id"] == rid and detail["period"] == "T1"
