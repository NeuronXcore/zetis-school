"""Tests diagnostic hors-ligne (SQLite + FakeLLMProvider).

Couvre la génération IA des QCM, la passation/scoring, la détection de lacunes
et l'upsert de maîtrise, plus la vue résultats Papa."""

from sqlalchemy import select

import app.db.models as m


def _generate(client) -> dict:
    # Fixture de test : Mathématiques est la seule matière → id=1 (skill « Nombres relatifs »).
    res = client.post("/api/diagnostics/generate", json={"subject_id": 1})
    assert res.status_code == 200, res.text
    return res.json()


def test_generate_creates_quiz_with_questions(client_db) -> None:
    client, _ = client_db
    body = _generate(client)
    assert body["subject"] == "Mathématiques"
    assert body["questions_count"] >= 1

    quiz = client.get(f"/api/diagnostics/quizzes/{body['quiz_id']}").json()
    assert quiz["subject"] == "Mathématiques"
    assert len(quiz["questions"]) == body["questions_count"]
    # Les bonnes réponses ne sont JAMAIS exposées à l'enfant.
    first = quiz["questions"][0]
    assert "choices" in first and "correct_index" not in first
    assert first["skill_name"]


def test_quizzes_listing_marks_taken(client_db) -> None:
    client, _ = client_db
    body = _generate(client)
    listed = client.get("/api/diagnostics/quizzes").json()
    assert listed[0]["quiz_id"] == body["quiz_id"]
    assert listed[0]["taken"] is False


def test_submit_scores_and_opens_gap_on_wrong_answers(client_db) -> None:
    client, Session = client_db
    body = _generate(client)
    quiz = client.get(f"/api/diagnostics/quizzes/{body['quiz_id']}").json()

    # On répond FAUX partout (index 1) → score 0 → lacune ouverte + maîtrise faible.
    answers = [{"question_id": q["id"], "choice_index": 1} for q in quiz["questions"]]
    result = client.post(
        f"/api/diagnostics/quizzes/{body['quiz_id']}/submit", json={"answers": answers}
    ).json()
    assert result["score_percent"] == 0
    assert result["gaps"], "des lacunes doivent être détectées"
    assert result["strengths"] == []

    with Session() as db:
        gap = db.scalar(select(m.Gap).where(m.Gap.source == "diagnostic", m.Gap.status == "open"))
        assert gap is not None
        mastery = db.scalar(select(m.SkillMastery))
        assert mastery is not None and mastery.status == "weak"

    # Le quiz est maintenant marqué « passé ».
    listed = client.get("/api/diagnostics/quizzes").json()
    assert listed[0]["taken"] is True


def test_submit_all_correct_is_strength(client_db) -> None:
    client, _ = client_db
    body = _generate(client)
    quiz = client.get(f"/api/diagnostics/quizzes/{body['quiz_id']}").json()
    # Index 0 correct (fake) → 100 % → force, pas de lacune.
    answers = [{"question_id": q["id"], "choice_index": 0} for q in quiz["questions"]]
    result = client.post(
        f"/api/diagnostics/quizzes/{body['quiz_id']}/submit", json={"answers": answers}
    ).json()
    assert result["score_percent"] == 100
    assert result["gaps"] == []
    assert result["strengths"]


def test_results_view_for_papa(client_db) -> None:
    client, _ = client_db
    body = _generate(client)
    quiz = client.get(f"/api/diagnostics/quizzes/{body['quiz_id']}").json()
    answers = [{"question_id": q["id"], "choice_index": 1} for q in quiz["questions"]]
    client.post(f"/api/diagnostics/quizzes/{body['quiz_id']}/submit", json={"answers": answers})

    results = client.get("/api/diagnostics/results").json()
    assert len(results) == 1
    assert results[0]["subject"] == "Mathématiques"
    assert results[0]["per_skill"]
    assert results[0]["gaps"]


def test_generate_unknown_subject_404(client_db) -> None:
    client, _ = client_db
    assert client.post("/api/diagnostics/generate", json={"subject_id": 999}).status_code == 404
