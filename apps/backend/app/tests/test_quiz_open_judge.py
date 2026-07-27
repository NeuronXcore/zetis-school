"""Format `open` jugé par LLM (ADR-0014 Lot 2) — tests de calibrage du juge.

Garde-fous prouvés : jugement critère par critère, **bénéfice du doute** (juge incertain ou
illisible → élève crédité + ambiguïté remontée), réponse vide gérée sans « faux », question
ouverte ajoutée par Papa (critères obligatoires), flux élève complet + `ai_evaluation_json`
persisté, et **zéro fuite** des critères côté /api/student. Provider IA mocké.
"""

import pytest
from fastapi import HTTPException
from sqlalchemy import select

import app.db.models as m
from app.modules.ai.provider import LLMResponse
from app.modules.quizzes import judge, service
from app.modules.quizzes.schemas import ManualQuestionCreate
from app.tests.fakes import FakeLLMProvider
from app.tests.test_quiz_engine import CHILD, _as, _gen

OPEN = dict(
    question_type="open",
    prompt_markdown="Explique pourquoi -3 est plus petit que 2.",
    correct_answer_json={"criteria": ["parle du signe négatif", "utilise la droite graduée"]},
    explanation_markdown="Sur la droite graduée, -3 est à gauche de 2.",
)


class _UnreadableJudge:
    """Provider dont le juge renvoie du non-JSON (test du repli « bénéfice du doute »)."""

    def generate(self, request):
        return LLMResponse(text="désolé, je ne sais pas trancher", model="fake", duration_ms=1)


# ── Calibrage du juge (fonction) ──────────────────────────────────────────────


def test_judge_credits_when_criteria_met():
    v = judge.judge_open(FakeLLMProvider(), prompt="q", answer_text="une bonne réponse", criteria=["a", "b"])
    assert v["is_correct"] is True and v["ambiguous"] is False
    assert v["ai_evaluation_json"]["confident"] is True and len(v["ai_evaluation_json"]["criteria"]) == 2


def test_judge_marks_insufficient_when_no_criterion_met():
    fake = FakeLLMProvider(
        quiz_judge={
            "criteria": [{"label": "a", "met": False, "note": "absent"}, {"label": "b", "met": False}],
            "feedback": "Bon début, précise encore.",
            "confident": True,
        }
    )
    v = judge.judge_open(fake, prompt="q", answer_text="réponse hors sujet", criteria=["a", "b"])
    assert v["is_correct"] is False and v["ambiguous"] is False
    assert "faux" not in v["feedback_markdown"].lower()  # jamais de vocabulaire d'échec


def test_judge_gives_benefit_of_doubt_when_unsure():
    fake = FakeLLMProvider(
        quiz_judge={"criteria": [{"label": "a", "met": False}], "feedback": "Pas sûr…", "confident": False}
    )
    v = judge.judge_open(fake, prompt="q", answer_text="hmm peut-être", criteria=["a"])
    assert v["is_correct"] is True and v["ambiguous"] is True  # doute → crédité + remonté à Papa


def test_judge_benefit_of_doubt_when_response_unreadable():
    v = judge.judge_open(_UnreadableJudge(), prompt="q", answer_text="ma réponse", criteria=["a"])
    assert v["is_correct"] is True and v["ambiguous"] is True


def test_judge_empty_answer_is_gentle_not_harsh():
    v = judge.judge_open(FakeLLMProvider(), prompt="q", answer_text="   ", criteria=["a"])
    assert v["is_correct"] is False and v["ambiguous"] is False
    assert v["ai_evaluation_json"]["empty"] is True
    assert "faux" not in v["feedback_markdown"].lower() and "échec" not in v["feedback_markdown"].lower()


# ── Ajout Papa d'une question ouverte ─────────────────────────────────────────


def test_open_question_requires_criteria(client_db):
    _, TestSession = client_db
    db = TestSession()
    quiz, _, _, _ = _gen(db)
    with pytest.raises(HTTPException) as exc:
        service.add_manual_question(
            db, quiz.id, ManualQuestionCreate(question_type="open", prompt_markdown="?", correct_answer_json={})
        )
    assert exc.value.status_code == 400


# ── Flux élève complet + persistance + zéro fuite ─────────────────────────────


def test_student_open_flow_judges_persists_and_never_leaks_criteria(client_db):
    client, TestSession = client_db
    db = TestSession()
    quiz, _, _, skill_id = _gen(db)
    oq = service.add_manual_question(db, quiz.id, ManualQuestionCreate(skill_id=skill_id, **OPEN))
    oq_id = oq["id"]

    _as(CHILD)
    # Zéro fuite : la question ouverte servie n'expose PAS ses critères.
    raw = client.get("/api/student/quizzes/mathematiques").text
    assert "criteria" not in raw and "correct_answer" not in raw

    attempt_id = client.post(f"/api/student/quizzes/{quiz.id}/attempts").json()["attempt_id"]
    r = client.post(
        f"/api/student/quiz-attempts/{attempt_id}/answers",
        json={"question_id": oq_id, "answer_json": {"text": "-3 est négatif, à gauche de 2 sur la droite graduée."}},
    )
    data = r.json()
    assert data["is_correct"] is True
    assert data["explanation_markdown"]  # feedback bienveillant du juge
    assert data["criteria"] and len(data["criteria"]) == 2  # évaluation critère par critère
    assert data["ambiguous"] is False

    check = TestSession()
    ans = check.scalar(select(m.QuizAnswer).where(m.QuizAnswer.question_id == oq_id))
    assert ans.ai_evaluation_json is not None and ans.ai_evaluation_json["confident"] is True
