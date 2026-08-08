"""Tests diagnostic hors-ligne (SQLite + FakeLLMProvider).

Couvre la génération IA des QCM, la passation/scoring, la détection de lacunes
et l'upsert de maîtrise, plus la vue résultats Papa."""

from sqlalchemy import select

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user


def as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def as_massimo() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "massimo", "role": "child"}


def _generate(client, Session, executer_travail, *, valider: bool = True) -> dict:
    """Le parcours d'un diagnostic **à deux acteurs**, depuis l'ADR-0043.

    ⚠️ **Elle rend `202` depuis l'ADR-0041 §4** : elle ACCEPTE, le worker exécute. Le corps
    d'autrefois (`quiz_id`, `subject`, `questions_count`) est désormais la SORTIE du travail, et
    c'est bien celle-là qu'on rend ici — les assertions en aval portent donc toujours sur ce qui a
    réellement été produit, jamais sur un accusé de réception.

    🔴 **Deux choses ont changé avec l'ADR-0043, et elles ne sont pas cosmétiques :**

    1. `generate` exige `require_parent` — d'où la bascule de rôle. Elle rend le décor plus fidèle,
       pas plus permissif : Papa lance, Massimo passe.
    2. Un diagnostic naît `pending` et **aucune route élève ne le sert**. Sans la validation, tout
       ce qui suit rendrait `404`. `valider=False` sert précisément à vérifier ce `404`.

    Le rôle est laissé sur **Massimo** en sortie : les tests d'aval sont des tests d'élève.
    """
    as_papa()
    # Fixture de test : Mathématiques est la seule matière → id=1 (skill « Nombres relatifs »).
    res = client.post("/api/diagnostics/generate", json={"subject_id": 1})
    assert res.status_code == 202, res.text
    body = executer_travail(Session, res.json()["job_id"])
    if valider:
        verdict = client.post(f"/api/diagnostics/quizzes/{body['quiz_id']}/validate")
        assert verdict.status_code == 200, verdict.text
    as_massimo()
    return body


def test_generate_creates_quiz_with_questions(client_db, executer_travail) -> None:
    client, Session = client_db
    body = _generate(client, Session, executer_travail)
    assert body["subject"] == "Mathématiques"
    assert body["questions_count"] >= 1

    quiz = client.get(f"/api/diagnostics/quizzes/{body['quiz_id']}").json()
    assert quiz["subject"] == "Mathématiques"
    assert len(quiz["questions"]) == body["questions_count"]
    # Les bonnes réponses ne sont JAMAIS exposées à l'enfant.
    first = quiz["questions"][0]
    assert "choices" in first and "correct_index" not in first
    assert first["skill_name"]


def test_quizzes_listing_date_la_passation(client_db, executer_travail) -> None:
    """Ex-`test_quizzes_listing_marks_taken`. `taken: bool` est devenu `taken_at` (ADR-0044 §6).

    Même comportement vérifié, exprimé sur le nouveau champ — les deux sont équivalents par
    construction (`taken` ≡ `taken_at is not None`). Le test y gagne `last_attempt_id`, que le
    booléen ne pouvait pas porter.
    """
    client, Session = client_db
    body = _generate(client, Session, executer_travail)
    listed = client.get("/api/diagnostics/quizzes").json()
    assert listed[0]["quiz_id"] == body["quiz_id"]
    assert listed[0]["taken_at"] is None
    assert listed[0]["last_attempt_id"] is None


def test_submit_scores_and_opens_gap_on_wrong_answers(client_db, executer_travail) -> None:
    client, Session = client_db
    body = _generate(client, Session, executer_travail)
    quiz = client.get(f"/api/diagnostics/quizzes/{body['quiz_id']}").json()

    # On répond FAUX partout (index 1) → score 0 → lacune ouverte + maîtrise faible.
    answers = [{"question_id": q["id"], "choice_index": 1} for q in quiz["questions"]]
    result = client.post(
        f"/api/diagnostics/quizzes/{body['quiz_id']}/submit", json={"answers": answers}
    ).json()
    assert result["gaps"], "des lacunes doivent être détectées"
    assert result["strengths"] == []

    with Session() as db:
        # ⚠️ Le score se lit sur LA PASSATION depuis l'ADR-0044 §5 : la réponse servie à Massimo ne
        # le porte plus. Il est toujours calculé et écrit — c'est sa diffusion à l'enfant qui cesse.
        passation = db.get(m.QuizAttempt, result["attempt_id"])
        assert passation.score_percent == 0
        gap = db.scalar(select(m.Gap).where(m.Gap.source == "diagnostic", m.Gap.status == "open"))
        assert gap is not None
        mastery = db.scalar(select(m.SkillMastery))
        assert mastery is not None and mastery.status == "weak"

    # Le quiz est maintenant marqué « passé » — daté depuis l'ADR-0044 §6, au lieu d'un booléen.
    listed = client.get("/api/diagnostics/quizzes").json()
    assert listed[0]["taken_at"] is not None


def test_submit_all_correct_is_strength(client_db, executer_travail) -> None:
    client, Session = client_db
    body = _generate(client, Session, executer_travail)
    quiz = client.get(f"/api/diagnostics/quizzes/{body['quiz_id']}").json()
    # Index 0 correct (fake) → 100 % → force, pas de lacune.
    answers = [{"question_id": q["id"], "choice_index": 0} for q in quiz["questions"]]
    result = client.post(
        f"/api/diagnostics/quizzes/{body['quiz_id']}/submit", json={"answers": answers}
    ).json()
    assert result["gaps"] == []
    assert result["strengths"]
    with Session() as db:
        # Le score reste écrit sur la passation (ADR-0044 §5) — seule sa diffusion à l'enfant cesse.
        assert db.get(m.QuizAttempt, result["attempt_id"]).score_percent == 100


def test_results_view_for_papa(client_db, executer_travail) -> None:
    client, Session = client_db
    body = _generate(client, Session, executer_travail)
    quiz = client.get(f"/api/diagnostics/quizzes/{body['quiz_id']}").json()
    answers = [{"question_id": q["id"], "choice_index": 1} for q in quiz["questions"]]
    client.post(f"/api/diagnostics/quizzes/{body['quiz_id']}/submit", json={"answers": answers})

    # `results` est une vue PAPA (`require_parent` depuis l'ADR-0043) — le nom du test le disait
    # déjà, la route l'exige maintenant.
    as_papa()
    results = client.get("/api/diagnostics/results").json()
    assert len(results) == 1
    assert results[0]["subject"] == "Mathématiques"
    assert results[0]["per_skill"]
    assert results[0]["gaps"]


def test_generate_unknown_subject_404(client_db) -> None:
    client, _ = client_db
    as_papa()
    assert client.post("/api/diagnostics/generate", json={"subject_id": 999}).status_code == 404
