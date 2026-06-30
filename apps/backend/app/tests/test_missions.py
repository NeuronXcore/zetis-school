"""Tests missions de remédiation (SQLite + FakeLLMProvider).

Les lacunes sont créées via un diagnostic raté, puis transformées en missions.
Couvre la génération, l'idempotence, la vue « du jour » et la complétion
(lacune résolue + XP)."""

from sqlalchemy import select

import app.db.models as m


def _open_gaps_via_failed_diagnostic(client) -> None:
    """Génère un diagnostic (subject_id=1 = Mathématiques en test) et y répond faux
    → ouvre au moins une lacune."""
    body = client.post("/api/diagnostics/generate", json={"subject_id": 1}).json()
    quiz = client.get(f"/api/diagnostics/quizzes/{body['quiz_id']}").json()
    answers = [{"question_id": q["id"], "choice_index": 1} for q in quiz["questions"]]
    res = client.post(f"/api/diagnostics/quizzes/{body['quiz_id']}/submit", json={"answers": answers})
    assert res.json()["gaps"], "le diagnostic raté doit ouvrir une lacune"


def test_generate_remediation_from_gaps(client_db) -> None:
    client, _ = client_db
    _open_gaps_via_failed_diagnostic(client)

    res = client.post("/api/missions/generate-remediation")
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["created"] >= 1
    mission = data["missions"][0]
    assert mission["mission_type"] == "remediation"
    assert mission["status"] == "planned"
    assert len(mission["steps"]) == 3  # explain / reverse / quiz
    assert mission["skill_name"]


def test_generate_remediation_is_idempotent(client_db) -> None:
    client, _ = client_db
    _open_gaps_via_failed_diagnostic(client)
    first = client.post("/api/missions/generate-remediation").json()["created"]
    second = client.post("/api/missions/generate-remediation").json()["created"]
    assert first >= 1
    assert second == 0  # pas de doublon pour une lacune déjà couverte


def test_today_lists_planned_missions(client_db) -> None:
    client, _ = client_db
    _open_gaps_via_failed_diagnostic(client)
    client.post("/api/missions/generate-remediation")
    today = client.get("/api/missions/today").json()
    assert len(today) >= 1
    assert all(mm["status"] in ("planned", "active") for mm in today)


def test_complete_mission_resolves_gap_and_awards_xp(client_db) -> None:
    client, Session = client_db
    _open_gaps_via_failed_diagnostic(client)
    mission = client.post("/api/missions/generate-remediation").json()["missions"][0]

    res = client.post(f"/api/missions/{mission['id']}/complete").json()
    assert res["status"] == "completed"
    assert res["gap_resolved"] is True
    assert res["xp_awarded"] > 0

    with Session() as db:
        # La lacune de la notion est résolue.
        gap = db.scalar(select(m.Gap).where(m.Gap.skill_id == mission["skill_id"]))
        assert gap is not None and gap.status == "resolved"
        # Un événement XP a été crédité.
        xp = db.scalar(select(m.XPEvent).where(m.XPEvent.reason == "mission_remediation"))
        assert xp is not None and xp.amount > 0
        # La mission n'apparaît plus dans « à faire ».
    today = client.get("/api/missions/today").json()
    assert all(mm["id"] != mission["id"] for mm in today)


def test_complete_unknown_mission_404(client_db) -> None:
    client, _ = client_db
    assert client.post("/api/missions/9999/complete").status_code == 404
