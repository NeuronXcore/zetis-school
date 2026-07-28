"""Tests gamification (SQLite + FakeLLMProvider).

Vérifie la synthèse XP (niveau, badges, régularité) et le crédit d'XP aux moments clés
(verbalisation ELI5, diagnostic, mission de remédiation)."""


def test_summary_empty(client_db) -> None:
    client, _ = client_db
    s = client.get("/api/gamification/summary").json()
    assert s["total_xp"] == 0
    assert s["level"] == 1
    assert s["regularity"]["days_done"] == 0
    assert s["badges"] == []
    assert s["recent"] == []


def test_eli5_reverse_awards_xp(client_db) -> None:
    client, _ = client_db
    client.post("/api/ai/eli5/reverse-evaluate", json={"skill_id": 1, "answer_text": "Mon explication."})
    s = client.get("/api/gamification/summary").json()
    assert s["total_xp"] >= 10
    # La régularité remplace le streak. Elle compte les jours de PRÉSENCE via le journal
    # d'activité : la verbalisation écrit un `reverse_eli5`, la journée est donc cochée.
    assert s["regularity"]["days_done"] == 1
    assert s["regularity"]["today_done"] is True
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
    # Diagnostic raté → lacune → mission (pending) → validation Papa → start → preuves →
    # complétion des étapes → badge « première mission » (ADR-0017 lot 1 : flux à preuves).
    client, _ = client_db
    body = client.post("/api/diagnostics/generate", json={"subject_id": 1}).json()
    quiz = client.get(f"/api/diagnostics/quizzes/{body['quiz_id']}").json()
    wrong = [{"question_id": q["id"], "choice_index": 1} for q in quiz["questions"]]
    client.post(f"/api/diagnostics/quizzes/{body['quiz_id']}/submit", json={"answers": wrong})
    mission = client.post("/api/missions/generate-remediation").json()["missions"][0]
    mid = mission["id"]
    client.post("/api/missions/validate", json={"ids": [mid]})
    client.post(f"/api/missions/{mid}/start")
    # Preuve de l'étape vocal_explain : un reverse ELI5 postérieur au start.
    client.post(
        "/api/ai/eli5/reverse-evaluate",
        json={"skill_id": mission["skill_id"], "answer_text": "Je réexplique la notion."},
    )
    for step in mission["steps"]:  # eli5 puis vocal_explain (2 étapes, fixture sans quiz)
        client.post(f"/api/missions/{mid}/steps/{step['id']}/complete")

    s = client.get("/api/gamification/summary").json()
    assert any(b["code"] == "first_mission" for b in s["badges"])
