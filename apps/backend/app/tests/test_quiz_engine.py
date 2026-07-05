"""Moteur de quiz unifié — slice backend (ADR-0014, Lot 1).

Génération depuis le cours canonique + auto-vérification, CRUD Papa (édition/régénération/
retrait/suppression), flux de tentative élève, scoring pondéré, et les invariants non
négociables : zéro fuite de clé côté /api/student, `mission` n'ouvre jamais de Gap, questions
`manual` préservées par la régénération. Provider IA mocké (aucun ollama).
"""

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.quizzes import scoring, service
from app.modules.quizzes.schemas import ManualQuestionCreate, QuestionPatch
from app.tests.fakes import FakeEmbeddingProvider, FakeLLMProvider

PARENT = {"username": "papa", "role": "parent"}
CHILD = {"username": "massimo", "role": "child"}


def _as(role: dict) -> None:
    app.dependency_overrides[get_current_user] = lambda: role


def _seed_lesson(db, *, validated: bool = True, with_content: bool = True) -> tuple[int, int]:
    """Année ACTIVE + matière + chapitre validé + leçon rattachée à « Nombres relatifs »."""
    skill = db.scalar(select(m.Skill).where(m.Skill.name == "Nombres relatifs"))
    subject = db.get(m.Subject, skill.subject_id)
    profile = db.scalars(select(m.StudentProfile)).first()
    year = m.SchoolYear(student_id=profile.id, label="2026-2027", level="4e", status="active")
    db.add(year)
    db.flush()
    sys_row = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject.id)
    db.add(sys_row)
    db.flush()
    chapter = m.Chapter(school_year_subject_id=sys_row.id, name="Nombres relatifs : opérations")
    db.add(chapter)
    db.flush()
    lesson = m.Lesson(
        chapter_id=chapter.id,
        title="Additionner des relatifs",
        status="validated" if validated else "draft",
        created_by="ai",
        content_markdown="Un nombre relatif a un signe (+ ou -)." if with_content else None,
    )
    db.add(lesson)
    db.flush()
    db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
    db.commit()
    return lesson.id, skill.id


def _gen(db):
    """Génère un quiz avec le fake par défaut (6 survivantes, 1 matching écartée)."""
    lesson_id, skill_id = _seed_lesson(db)
    quiz, counters = service.generate_quiz(
        db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson_id, count=5, difficulty=2
    )
    return quiz, counters, lesson_id, skill_id


# ── Génération + auto-vérification ────────────────────────────────────────────


def test_generation_persists_one_skill_per_question_and_traces_job(client_db):
    _, TestSession = client_db
    db = TestSession()
    quiz, counters, lesson_id, skill_id = _gen(db)

    assert counters == {"questions_generated": 6, "questions_discarded": 1}
    questions = list(db.scalars(select(m.QuizQuestion).where(m.QuizQuestion.quiz_id == quiz.id)))
    assert len(questions) == 6
    assert all(q.skill_id == skill_id for q in questions)  # une question = un skill_id résolu
    assert all(q.source == "generated" and q.status == "active" for q in questions)
    assert quiz.quiz_type == "mission" and quiz.status == "ready" and quiz.lesson_id == lesson_id

    job = db.scalar(select(m.AIJob).where(m.AIJob.job_type == "quiz_generate"))
    assert job.status == "succeeded"
    assert job.output_json["lesson_id"] == lesson_id
    assert job.output_json["lesson_title"] == "Additionner des relatifs"
    assert job.output_json["questions_generated"] == 6
    assert job.output_json["questions_discarded"] == 1


def test_self_check_discards_divergent_question(client_db):
    _, TestSession = client_db
    db = TestSession()
    quiz, _, _, _ = _gen(db)
    types = {q.question_type for q in db.scalars(select(m.QuizQuestion).where(m.QuizQuestion.quiz_id == quiz.id))}
    # La question `matching` (Q7) diverge à l'aveugle → écartée ; les six autres survivent.
    assert types == {"mcq", "mcq_multi", "true_false", "cloze", "numeric", "ordering"}
    assert "matching" not in types


def test_generate_refuses_unvalidated_or_contentless_lesson(client_db):
    _, TestSession = client_db
    db = TestSession()
    draft_id, _ = _seed_lesson(db, validated=False)
    with pytest.raises(HTTPException) as exc:
        service.generate_quiz(db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=draft_id, count=5, difficulty=2)
    assert exc.value.status_code == 409

    no_content_id, _ = _seed_lesson(db, with_content=False)
    with pytest.raises(HTTPException) as exc2:
        service.generate_quiz(db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=no_content_id, count=5, difficulty=2)
    assert exc2.value.status_code == 409


# ── Invariant : zéro fuite côté élève ─────────────────────────────────────────


def test_student_payload_never_leaks_key_or_explanation(client_db):
    client, TestSession = client_db
    db = TestSession()
    _gen(db)

    _as(CHILD)
    r = client.get("/api/student/quizzes/mathematiques")
    assert r.status_code == 200
    raw = r.text
    # Inspection du JSON BRUT, pas seulement du schéma : aucun champ de clé/explication.
    for forbidden in ("correct_answer", "correct_index", "correct_indices", "explanation", '"pairs"', '"order"'):
        assert forbidden not in raw
    # …mais la présentation nécessaire est bien là.
    assert '"prompt_markdown"' in raw and '"choices_json"' in raw


# ── Flux de tentative complet + XP ────────────────────────────────────────────


def test_student_quiz_carries_lesson_id_and_subjects_summary(client_db):
    client, TestSession = client_db
    db = TestSession()
    quiz, _, lesson_id, _ = _gen(db)

    _as(CHILD)
    quizzes = client.get("/api/student/quizzes/mathematiques").json()
    assert quizzes[0]["lesson_id"] == lesson_id  # le bouton page Cours peut cibler la leçon

    subjects = client.get("/api/student/quiz-subjects").json()
    maths = next(s for s in subjects if s["slug"] == "mathematiques")
    assert maths["quiz_count"] == 1 and maths["name"] == "Mathématiques"


def test_full_attempt_flow_feedback_score_and_xp(client_db):
    client, TestSession = client_db
    db = TestSession()
    quiz, _, _, _ = _gen(db)
    mcq = db.scalar(select(m.QuizQuestion).where(m.QuizQuestion.quiz_id == quiz.id, m.QuizQuestion.question_type == "mcq"))
    tf = db.scalar(select(m.QuizQuestion).where(m.QuizQuestion.quiz_id == quiz.id, m.QuizQuestion.question_type == "true_false"))

    _as(CHILD)
    attempt_id = client.post(f"/api/student/quizzes/{quiz.id}/attempts").json()["attempt_id"]

    good = client.post(f"/api/student/quiz-attempts/{attempt_id}/answers", json={"question_id": mcq.id, "answer_json": {"choice_index": 0}})
    assert good.json()["is_correct"] is True and good.json()["explanation_markdown"]

    bad = client.post(f"/api/student/quiz-attempts/{attempt_id}/answers", json={"question_id": tf.id, "answer_json": {"value": False}})
    assert bad.json()["is_correct"] is False

    done = client.post(f"/api/student/quiz-attempts/{attempt_id}/complete")
    data = done.json()
    assert data["score_percent"] == 50  # 1 bonne / 2 répondues
    assert data["xp_awarded"] == 20  # base 10 + bonus round(20 × 0.5) = 20

    check = TestSession()
    assert check.scalar(select(func.sum(m.XPEvent.amount)).where(m.XPEvent.reason == "quiz_completed")) == 20


def test_reanswering_updates_the_same_answer(client_db):
    client, TestSession = client_db
    db = TestSession()
    quiz, _, _, _ = _gen(db)
    mcq = db.scalar(select(m.QuizQuestion).where(m.QuizQuestion.quiz_id == quiz.id, m.QuizQuestion.question_type == "mcq"))
    _as(CHILD)
    attempt_id = client.post(f"/api/student/quizzes/{quiz.id}/attempts").json()["attempt_id"]
    client.post(f"/api/student/quiz-attempts/{attempt_id}/answers", json={"question_id": mcq.id, "answer_json": {"choice_index": 1}})
    client.post(f"/api/student/quiz-attempts/{attempt_id}/answers", json={"question_id": mcq.id, "answer_json": {"choice_index": 0}})
    check = TestSession()
    rows = list(check.scalars(select(m.QuizAnswer).where(m.QuizAnswer.question_id == mcq.id)))
    assert len(rows) == 1 and rows[0].is_correct is True  # une seule ligne, corrigée


# ── Édition / régénération : source manual préservée ──────────────────────────


def test_edit_flips_to_manual_and_regenerate_preserves_it(client_db):
    _, TestSession = client_db
    db = TestSession()
    quiz, _, _, _ = _gen(db)
    generated = list(db.scalars(select(m.QuizQuestion).where(m.QuizQuestion.quiz_id == quiz.id)))
    edited = generated[0]
    other_generated_ids = {q.id for q in generated[1:]}

    service.patch_question(db, edited.id, QuestionPatch(prompt_markdown="Énoncé revu par Papa"))
    assert db.get(m.QuizQuestion, edited.id).source == "manual"

    service.regenerate_quiz(db, FakeLLMProvider(), FakeEmbeddingProvider(), quiz_id=quiz.id)
    db.expire_all()

    # La question éditée (manual) survit ; les generated non éditées sont remplacées.
    kept = db.get(m.QuizQuestion, edited.id)
    assert kept is not None and kept.source == "manual" and kept.status == "active"
    assert all(db.get(m.QuizQuestion, qid) is None for qid in other_generated_ids)
    fresh_generated = db.scalars(
        select(func.count()).select_from(m.QuizQuestion).where(
            m.QuizQuestion.quiz_id == quiz.id, m.QuizQuestion.source == "generated", m.QuizQuestion.status == "active"
        )
    )
    assert fresh_generated.one() == 6  # nouveau lot généré


def test_add_manual_question_rejects_lot2_types(client_db):
    _, TestSession = client_db
    db = TestSession()
    quiz, _, _, _ = _gen(db)
    with pytest.raises(HTTPException) as exc:
        service.add_manual_question(
            db, quiz.id, ManualQuestionCreate(question_type="open", prompt_markdown="?", correct_answer_json={})
        )
    assert exc.value.status_code == 400


# ── Retrait : hors tirage, réponses intactes ──────────────────────────────────


def test_retire_removes_from_student_draws_but_keeps_answers(client_db):
    client, TestSession = client_db
    db = TestSession()
    quiz, _, _, _ = _gen(db)
    mcq = db.scalar(select(m.QuizQuestion).where(m.QuizQuestion.quiz_id == quiz.id, m.QuizQuestion.question_type == "mcq"))

    _as(CHILD)
    attempt_id = client.post(f"/api/student/quizzes/{quiz.id}/attempts").json()["attempt_id"]
    client.post(f"/api/student/quiz-attempts/{attempt_id}/answers", json={"question_id": mcq.id, "answer_json": {"choice_index": 0}})

    service.retire_question(db, mcq.id)

    _as(CHILD)
    served = client.get("/api/student/quizzes/mathematiques").json()
    served_ids = {q["id"] for quiz_out in served for q in quiz_out["questions"]}
    assert mcq.id not in served_ids  # retirée des tirages

    check = TestSession()
    assert check.scalar(select(func.count()).select_from(m.QuizAnswer).where(m.QuizAnswer.question_id == mcq.id)) == 1


# ── Suppression : hard sans tentative, archivage avec ─────────────────────────


def test_delete_is_hard_without_attempts(client_db):
    _, TestSession = client_db
    db = TestSession()
    quiz, _, _, _ = _gen(db)
    result = service.delete_quiz(db, quiz.id)
    assert result == {"deleted": True, "archived": False}
    assert db.get(m.Quiz, quiz.id) is None
    assert db.scalar(select(func.count()).select_from(m.QuizQuestion).where(m.QuizQuestion.quiz_id == quiz.id)) == 0


def test_delete_archives_when_attempts_exist(client_db):
    client, TestSession = client_db
    db = TestSession()
    quiz, _, _, _ = _gen(db)
    _as(CHILD)
    client.post(f"/api/student/quizzes/{quiz.id}/attempts")

    result = service.delete_quiz(db, quiz.id)
    db.expire_all()
    assert result == {"deleted": False, "archived": True}
    assert db.get(m.Quiz, quiz.id).status == "archived"


# ── Invariant : mission n'ouvre JAMAIS de Gap ─────────────────────────────────


def test_mission_context_never_opens_a_gap_even_at_zero(client_db):
    client, TestSession = client_db
    db = TestSession()
    quiz, _, _, _ = _gen(db)
    questions = list(db.scalars(select(m.QuizQuestion).where(m.QuizQuestion.quiz_id == quiz.id)))

    _as(CHILD)
    attempt_id = client.post(f"/api/student/quizzes/{quiz.id}/attempts").json()["attempt_id"]
    for q in questions:  # tout faux → 0 %
        client.post(f"/api/student/quiz-attempts/{attempt_id}/answers", json={"question_id": q.id, "answer_json": {}})
    data = client.post(f"/api/student/quiz-attempts/{attempt_id}/complete").json()

    assert data["score_percent"] == 0
    assert data["xp_awarded"] == 10  # tout faux → base d'effort seule (jamais 0, jamais 30)
    check = TestSession()
    assert check.scalar(select(func.count()).select_from(m.Gap)) == 0  # AUCUNE lacune ouverte
    # …mais la maîtrise a bien reçu le signal faible.
    assert check.scalar(select(func.count()).select_from(m.SkillMastery)) >= 1


def test_quiz_xp_rewards_effort_and_performance():
    """XP d'un quiz : base d'effort + bonus score, jamais 0, plafonné à 30."""
    from app.modules.gamification.service import quiz_xp

    assert quiz_xp(0) == 10  # terminé mais tout faux → effort récompensé, jamais puni
    assert quiz_xp(50) == 20
    assert quiz_xp(100) == 30  # score parfait → max (valeur de la maquette)


def test_scoring_weak_signal_and_revision_stub_are_pure():
    """Contrôle direct de la fonction pure : mission ajuste, révision no-op, aucun Gap."""
    from datetime import datetime, timezone

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    from app.db.base import Base

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()

    now = datetime.now(timezone.utc)
    eff = scoring.apply_quiz_result(db, student_id=1, per_skill_scores={7: 100}, context="mission", now=now)
    assert eff["opened_gaps"] == [] and eff["updated_masteries"][0]["skill_id"] == 7
    # Signal faible : 100 % ne fait PAS bondir la maîtrise à 100 (pondération 0.4).
    assert eff["updated_masteries"][0]["mastery_after"] == 40

    stub = scoring.apply_quiz_result(db, student_id=1, per_skill_scores={7: 100}, context="revision", now=now)
    assert stub["deferred"] is True and stub["updated_masteries"] == []


# ── Garde parent ──────────────────────────────────────────────────────────────


# ── Pilotage Papa : overview + arbre matière ──────────────────────────────────


def test_pilotage_overview_reports_kpis_and_per_subject_health(client_db):
    client, TestSession = client_db
    db = TestSession()
    _gen(db)  # 6 générées, 1 écartée sur « mathematiques »

    _as(PARENT)
    data = client.get("/api/quiz-pilotage/overview").json()
    assert data["kpis"]["active_quizzes"] == 1
    assert data["kpis"]["served_questions"] == 6
    maths = next(s for s in data["subjects"] if s["slug"] == "mathematiques")
    assert maths["validated_lessons"] == 1 and maths["lessons_without_quiz"] == 0
    assert maths["discarded"] == 1 and maths["generated_total"] == 7
    assert maths["discard_rate"] == round(1 / 7, 3)  # 1 écartée / 7 tentées


def test_pilotage_tree_includes_lessons_without_quiz(client_db):
    client, TestSession = client_db
    db = TestSession()
    quiz, _, lesson_id, _ = _gen(db)
    subject_id = db.get(m.Quiz, quiz.id).subject_id

    _as(PARENT)
    tree = client.get(f"/api/quiz-pilotage/subjects/{subject_id}").json()
    lesson = next(l for l in tree["lessons"] if l["lesson_id"] == lesson_id)
    assert lesson["chapter_name"] == "Nombres relatifs : opérations"
    assert len(lesson["quizzes"]) == 1
    card = lesson["quizzes"][0]
    assert card["questions_count"] == 6 and card["status"] == "ready"
    assert set(card["formats"]) == {"mcq", "mcq_multi", "true_false", "cloze", "numeric", "ordering"}


def test_pilotage_routes_require_parent(client_db):
    client, _ = client_db
    _as(CHILD)
    assert client.get("/api/quiz-pilotage/overview").status_code == 403
    assert client.get("/api/quiz-pilotage/subjects/1").status_code == 403


def test_papa_routes_require_parent(client_db):
    client, TestSession = client_db
    db = TestSession()
    quiz, _, lesson_id, _ = _gen(db)
    _as(CHILD)
    assert client.post(f"/api/lessons/{lesson_id}/quizzes/generate", json={"count": 5, "difficulty": 2}).status_code == 403
    assert client.get(f"/api/quizzes/{quiz.id}").status_code == 403
    assert client.delete(f"/api/quizzes/{quiz.id}").status_code == 403
