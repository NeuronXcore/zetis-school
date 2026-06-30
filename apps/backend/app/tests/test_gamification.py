"""Tests gamification (SQLite + FakeLLMProvider).

Vérifie la synthèse XP (niveau, streak, badges) et le crédit d'XP aux moments clés
(verbalisation ELI5, diagnostic, mission de remédiation)."""


def test_summary_empty(client_db) -> None:
    client, _ = client_db
    s = client.get("/api/gamification/summary").json()
    assert s["total_xp"] == 0
    assert s["level"] == 1
    assert s["streak_days"] == 0
    assert s["badges"] == []
    assert s["recent"] == []


def test_eli5_reverse_awards_xp(client_db) -> None:
    client, _ = client_db
    client.post("/api/ai/eli5/reverse-evaluate", json={"skill_id": 1, "answer_text": "Mon explication."})
    s = client.get("/api/gamification/summary").json()
    assert s["total_xp"] >= 10
    assert s["active_today"] is True
    assert s["streak_days"] == 1
    assert any(b["code"] == "explainer" for b in s["badges"])


def test_diagnostic_awards_xp_and_badge(client_db) -> None:
    client, _ = client_db
    body = client.post("/api/diagnostics/generate", json={"subject_id": 1}).json()
    quiz = client.get(f"/api/diagnostics/quizzes/{body['quiz_id']}").json()
    answers = [{"question_id": q["id"], "choice_index": 0} for q in quiz["questions"]]
    client.post(f"/api/diagnostics/quizzes/{body['quiz_id']}/submit", json={"answers": answers})

    s = client.get("/api/gamification/summary").json()
    assert s["total_xp"] >= 15
    assert any(b["code"] == "diagnostic" for b in s["badges"])
    assert s["recent"][0]["reason"] == "diagnostic"


def test_level_increases_with_xp(client_db) -> None:
    # 100 XP = niveau 2. Une mission de remédiation = +20 ; on en cumule via plusieurs reverses.
    client, _ = client_db
    for _ in range(10):
        client.post(
            "/api/ai/eli5/reverse-evaluate", json={"skill_id": 1, "answer_text": "Encore une explication."}
        )
    s = client.get("/api/gamification/summary").json()
    assert s["total_xp"] >= 100
    assert s["level"] >= 2
    assert s["xp_for_next"] == 100
    assert any(b["code"] == "xp_100" for b in s["badges"])


def test_mission_completion_grants_first_mission_badge(client_db) -> None:
    # Diagnostic raté → lacune → mission → complétion → badge « première mission ».
    client, _ = client_db
    body = client.post("/api/diagnostics/generate", json={"subject_id": 1}).json()
    quiz = client.get(f"/api/diagnostics/quizzes/{body['quiz_id']}").json()
    wrong = [{"question_id": q["id"], "choice_index": 1} for q in quiz["questions"]]
    client.post(f"/api/diagnostics/quizzes/{body['quiz_id']}/submit", json={"answers": wrong})
    mission = client.post("/api/missions/generate-remediation").json()["missions"][0]
    client.post(f"/api/missions/{mission['id']}/complete")

    s = client.get("/api/gamification/summary").json()
    assert any(b["code"] == "first_mission" for b in s["badges"])
