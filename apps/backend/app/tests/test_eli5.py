import app.db.models as m
from app.main import app
from app.modules.ai import get_provider
from app.modules.eli5 import service
from app.modules.eli5.schemas import ELI5ExplainRequest
from app.tests.fakes import FakeEmbeddingProvider, FakeLLMProvider


def _add_validated_lesson(db, *, skill_id: int, title: str, content: str) -> m.Lesson:
    lesson = m.Lesson(
        chapter_id=1, title=title, content_markdown=content, status="validated", created_by="ai"
    )
    db.add(lesson)
    db.flush()
    db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill_id))
    db.commit()
    return lesson


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
    # Sans source RAG indexée, l'explication n'est pas marquée « d'après ton cours ».
    assert job["output"]["sources_used"] == 0


def test_explain_uses_canonical_course(client_db) -> None:
    # ELI5 v2 (ADR-0011) : une leçon validée sert de source canonique → output_json porte
    # lesson_id/lesson_title (le badge Massimo devient « D'après ta leçon … »).
    _, Session = client_db
    with Session() as db:
        lesson = _add_validated_lesson(
            db, skill_id=1, title="Additionner des relatifs", content="# Cours\n\nRègle des signes."
        )
        result = service.explain(
            db, FakeLLMProvider(), FakeEmbeddingProvider(), ELI5ExplainRequest(skill_id=1)
        )
        job = db.get(m.AIJob, result["job_id"])
        assert job is not None
        assert job.output_json["lesson_id"] == lesson.id
        assert job.output_json["lesson_title"] == "Additionner des relatifs"
        # Pas de RAG indexé : le cours canonique suffit, sources_used reste à 0.
        assert job.output_json["sources_used"] == 0


def test_explain_without_course_stays_v1_compatible(client_db) -> None:
    # Non-régression : sans cours validé, output_json ne porte aucun lesson_id et
    # sources_used reste intact (comportement identique à v1).
    _, Session = client_db
    with Session() as db:
        result = service.explain(
            db, FakeLLMProvider(), FakeEmbeddingProvider(), ELI5ExplainRequest(skill_id=1)
        )
        job = db.get(m.AIJob, result["job_id"])
        assert job is not None
        assert job.output_json["sources_used"] == 0
        assert "lesson_id" not in job.output_json
        assert "lesson_title" not in job.output_json
        assert job.output_json["title"]


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
