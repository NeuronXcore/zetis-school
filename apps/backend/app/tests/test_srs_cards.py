"""Génération et cycle de vie des cartes SRS (ADR-0012).

Test-verrou central de réconciliation (les trois branches) + cas dégradé + invariant vie
privée + endpoint manuel Papa. Provider IA mocké (`FakeLLMProvider`).
"""

from datetime import timedelta

from sqlalchemy import select

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.eli5.service import get_default_student
from app.modules.memory.generation import (
    _now,
    reconcile_orphans,
    refresh_cards_for_lesson,
)
from app.modules.memory.service import get_reviews_summary
from app.tests.fakes import FakeEmbeddingProvider, FakeLLMProvider

PARENT = {"username": "papa", "role": "parent"}
CHILD = {"username": "massimo", "role": "child"}


def _seed_lesson(db, *, validated: bool = True, with_content: bool = True) -> tuple[int, int]:
    """Chapitre + leçon rattachée à la Skill « Nombres relatifs » seedée par conftest.

    → (lesson_id, skill_id). `validated=True` + `with_content` = cours canonique valide."""
    skill = db.scalar(select(m.Skill).where(m.Skill.name == "Nombres relatifs"))
    chapter = m.Chapter(name="Nombres relatifs : opérations")
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


def _definition_card(db, skill_id: int) -> m.SpacedReviewCard:
    return db.scalar(
        select(m.SpacedReviewCard).where(
            m.SpacedReviewCard.skill_id == skill_id,
            m.SpacedReviewCard.card_type == "definition",
        )
    )


# ── Branche B : notion nouvellement couverte → carte active, due maintenant ──────


def test_branch_b_new_skill_creates_active_due_card(client_db):
    _, TestSession = client_db
    db = TestSession()
    lesson_id, skill_id = _seed_lesson(db)

    result = refresh_cards_for_lesson(db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson_id)
    assert result["created"] == 2  # definition + method
    card = _definition_card(db, skill_id)
    assert card.status == "scheduled"
    assert card.due_at is not None
    assert card.interval_days == 0
    # Servie à Massimo.
    summary = get_reviews_summary(db, get_default_student(db))
    assert summary["total_due"] == 2


# ── Branche A : régénération → contenu réécrit, planification INTACTE ─────────────


def test_branch_a_regeneration_preserves_schedule(client_db):
    _, TestSession = client_db
    db = TestSession()
    lesson_id, skill_id = _seed_lesson(db)
    refresh_cards_for_lesson(db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson_id)

    # Simule un historique de révision durement acquis.
    card = _definition_card(db, skill_id)
    card_id = card.id
    card.due_at = _now() + timedelta(days=30)
    card.interval_days = 30
    card.ease_factor = 2.7
    db.commit()
    kept_due, kept_interval, kept_ease = card.due_at, card.interval_days, card.ease_factor

    # Papa réédite : contenu DIFFÉRENT pour la même notion.
    new_content = FakeLLMProvider(
        srs_cards={
            "cards": [
                {
                    "card_type": "definition",
                    "front_markdown": "RECTO réécrit ?",
                    "back_markdown": "VERSO réécrit.",
                }
            ]
        }
    )
    refresh_cards_for_lesson(db, new_content, FakeEmbeddingProvider(), lesson_id=lesson_id)

    same = db.get(m.SpacedReviewCard, card_id)
    assert same is not None  # ligne jamais supprimée
    assert same.front_markdown == "RECTO réécrit ?"  # contenu mis à jour
    assert same.due_at == kept_due  # planification SACRÉE
    assert same.interval_days == kept_interval
    assert same.ease_factor == kept_ease


# ── Branche C : orpheline → suspendue (planif conservée), puis réactivée en place ──


def test_branch_c_orphan_suspends_then_reactivates_in_place(client_db):
    _, TestSession = client_db
    db = TestSession()
    lesson_id, skill_id = _seed_lesson(db)
    refresh_cards_for_lesson(db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson_id)

    card = _definition_card(db, skill_id)
    card_id = card.id
    card.due_at = _now() + timedelta(days=30)
    card.interval_days = 30
    db.commit()
    kept_due = card.due_at

    # La notion quitte toute couverture : la leçon source est archivée.
    lesson = db.get(m.Lesson, lesson_id)
    lesson.status = "archived"
    db.commit()

    suspended = reconcile_orphans(db, FakeEmbeddingProvider(), skill_ids=[skill_id])
    assert suspended >= 1
    db.refresh(card)
    assert card.status == "suspended"
    assert card.due_at == kept_due  # planification conservée
    assert get_reviews_summary(db, get_default_student(db))["total_due"] == 0  # hors session

    # Une nouvelle leçon validée re-couvre la notion → réactivation EN PLACE.
    l2_id, _ = _seed_lesson(db)
    refresh_cards_for_lesson(db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=l2_id)
    same = db.get(m.SpacedReviewCard, card_id)
    assert same.id == card_id  # même ligne
    assert same.status == "scheduled"  # réactivée
    assert same.due_at == kept_due  # planification acquise préservée


# ── Cas dégradé : génération sans cours validé → carte pending, non servie ────────


def test_degraded_without_validated_course_is_pending(client_db):
    _, TestSession = client_db
    db = TestSession()
    # Leçon en `draft` (pas de cours validé pour la notion) → cas dégradé.
    lesson_id, skill_id = _seed_lesson(db, validated=False)

    result = refresh_cards_for_lesson(db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson_id)
    assert result["pending"] == 2
    assert result["created"] == 0
    card = _definition_card(db, skill_id)
    assert card.status == "pending"
    assert card.due_at is None
    assert get_reviews_summary(db, get_default_student(db))["total_due"] == 0  # non servie


# ── Invariant vie privée : aucune donnée de Massimo dans le prompt ────────────────


def test_privacy_prompt_contains_no_student_data(client_db):
    _, TestSession = client_db
    db = TestSession()
    lesson_id, _ = _seed_lesson(db)

    class RecordingLLM(FakeLLMProvider):
        def __init__(self):
            super().__init__()
            self.seen = []

        def generate(self, request):
            self.seen.append(request)
            return super().generate(request)

    llm = RecordingLLM()
    refresh_cards_for_lesson(db, llm, FakeEmbeddingProvider(), lesson_id=lesson_id)
    assert llm.seen
    for req in llm.seen:
        blob = f"{req.system}\n{req.prompt}"
        assert "Massimo" not in blob  # que la notion + le cours, jamais l'élève
        assert "Un nombre relatif a un signe" in req.prompt  # ancré sur le cours validé


# ── Endpoint manuel Papa (secours / régénération à la demande) ───────────────────


def _as(role: dict) -> None:
    app.dependency_overrides[get_current_user] = lambda: role


def test_manual_endpoint_generates_and_is_parent_only(client_db):
    client, TestSession = client_db
    db = TestSession()
    lesson_id, _ = _seed_lesson(db)

    # Enfant : la route curriculum est protégée par require_parent → 403.
    _as(CHILD)
    assert client.post(f"/api/lessons/{lesson_id}/generate-cards").status_code == 403

    _as(PARENT)
    resp = client.post(f"/api/lessons/{lesson_id}/generate-cards")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["created"] == 2
    assert body == {"created": 2, "updated": 0, "reactivated": 0, "pending": 0}

    _as(CHILD)
    assert client.get("/api/student/reviews/summary").json()["total_due"] == 2


def test_validate_lesson_never_breaks_without_worker(client_db):
    client, TestSession = client_db
    db = TestSession()
    lesson_id, _ = _seed_lesson(db, validated=False, with_content=True)

    # Valider enfile un job async (worker-ai) ; sans Redis, l'enfilement échoue en silence
    # et la validation reste un succès (robustesse ADR-0012 §1).
    _as(PARENT)
    resp = client.post(f"/api/lessons/{lesson_id}/validate")
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "validated"
