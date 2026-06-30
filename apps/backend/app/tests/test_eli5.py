import app.db.models as m
from app.main import app
from app.modules.ai import get_provider
from app.tests.fakes import FakeLLMProvider


def test_explain_creates_job_and_returns_reference(client_db) -> None:
    client, _ = client_db
    response = client.post("/api/ai/eli5/explain", json={"skill_id": 1})
    assert response.status_code == 200
    body = response.json()
    # Contrat API_SPEC : explain renvoie la référence du job, pas l'explication inline.
    assert set(body) == {"job_id", "status"}
    assert body["status"] == "succeeded"

    # L'explication normalisée est récupérable via GET /ai/jobs/{job_id}.
    job = client.get(f"/api/ai/jobs/{body['job_id']}").json()
    assert job["job_type"] == "eli5_explain"
    assert job["output"]["title"]
    assert job["output"]["check_question"]
    assert job["output"]["next_action"]


def test_skills_listing(client_db) -> None:
    client, _ = client_db
    response = client.get("/api/ai/eli5/skills")
    assert response.status_code == 200
    assert response.json()[0]["name"] == "Nombres relatifs"


def test_reverse_output_schema(client_db) -> None:
    client, _ = client_db
    response = client.post(
        "/api/ai/eli5/reverse-evaluate",
        json={"skill_id": 1, "answer_text": "Un nombre négatif est en dessous de zéro."},
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"score", "feedback", "missing_points", "next_action"}
    assert 0 <= body["score"] <= 100


def test_reverse_writes_trace_and_memory(client_db) -> None:
    client, Session = client_db
    client.post(
        "/api/ai/eli5/reverse-evaluate",
        json={"skill_id": 1, "answer_text": "Un nombre négatif est sous zéro."},
    )
    db = Session()
    try:
        # Trace IA + progression + UNE carte de révision.
        assert db.query(m.AIJob).filter_by(job_type="eli5_reverse", status="succeeded").count() == 1
        assert db.query(m.LearningEvent).filter_by(event_type="reverse_eli5").count() == 1
        assert db.query(m.SkillMastery).count() == 1
        assert db.query(m.SpacedReviewCard).count() == 1
        # Score 80 (fake) -> intervalle fixe de 7 jours.
        assert db.query(m.SpacedReviewCard).first().interval_days == 7
    finally:
        db.close()


def test_feedback_is_benevolent(client_db) -> None:
    """Un feedback humiliant du LLM doit être neutralisé (règles pédagogiques CLAUDE.md)."""
    client, _ = client_db
    app.dependency_overrides[get_provider] = lambda: FakeLLMProvider(
        feedback="Tu es nul, c'est un échec total.", score=20
    )
    response = client.post(
        "/api/ai/eli5/reverse-evaluate", json={"skill_id": 1, "answer_text": "bof"}
    )
    assert response.status_code == 200
    feedback = response.json()["feedback"].lower()
    assert "nul" not in feedback
    assert "échec" not in feedback


def test_job_trace_endpoint(client_db) -> None:
    client, Session = client_db
    client.post("/api/ai/eli5/reverse-evaluate", json={"skill_id": 1, "answer_text": "ok"})
    db = Session()
    job_id = db.query(m.AIJob).first().id
    db.close()
    response = client.get(f"/api/ai/jobs/{job_id}")
    assert response.status_code == 200
    assert response.json()["status"] == "succeeded"


def test_unknown_skill_returns_404(client_db) -> None:
    client, _ = client_db
    assert client.post("/api/ai/eli5/explain", json={"skill_id": 999}).status_code == 404
