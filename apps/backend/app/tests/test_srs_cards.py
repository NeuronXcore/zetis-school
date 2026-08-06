"""Cartes SRS (ADR-0013) — génération page-driven Papa + réconciliation 3 branches.

Test-verrou central (A/B/C + réactivation), cas dégradé, idempotence, suppression explicite,
invariant vie privée, échec partiel, garde parent, lectures de pilotage. Provider IA mocké.
"""

from datetime import timedelta

from sqlalchemy import func, select

import app.db.models as m
from app.main import app
from app.modules.ai.provider import LLMResponse
from app.modules.auth.deps import get_current_user
from app.modules.eli5.service import get_default_student
from app.modules.memory.generation import (
    _now,
    generate_cards_for_skill,
    reconcile_cards_for_subject,
)
from app.modules.memory.service import get_reviews_summary, record_attempt
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


def _def_card(db, skill_id: int) -> m.SpacedReviewCard:
    return db.scalar(
        select(m.SpacedReviewCard).where(
            m.SpacedReviewCard.skill_id == skill_id,
            m.SpacedReviewCard.card_type == "definition",
        )
    )


# ── Génération unitaire d'une notion : branches A / B ─────────────────────────


def test_generate_skill_creates_active_cards(client_db):
    _, TestSession = client_db
    db = TestSession()
    _, skill_id = _seed_lesson(db)
    r = generate_cards_for_skill(db, FakeLLMProvider(), FakeEmbeddingProvider(), skill_id=skill_id)
    assert r["created"] == 2  # definition + method
    card = _def_card(db, skill_id)
    assert card.status == "scheduled" and card.due_at is not None and card.interval_days == 0
    assert get_reviews_summary(db, get_default_student(db))["total_due"] == 2


def test_regeneration_updates_content_but_never_schedule(client_db):
    _, TestSession = client_db
    db = TestSession()
    _, skill_id = _seed_lesson(db)
    generate_cards_for_skill(db, FakeLLMProvider(), FakeEmbeddingProvider(), skill_id=skill_id)
    card = _def_card(db, skill_id)
    cid = card.id
    card.due_at = _now() + timedelta(days=30)
    card.interval_days = 30
    card.ease_factor = 2.7
    db.commit()
    kept = (card.due_at, card.interval_days, card.ease_factor)

    changed = FakeLLMProvider(
        srs_cards={"cards": [{"card_type": "definition", "front_markdown": "NEW ?", "back_markdown": "NEW."}]}
    )
    generate_cards_for_skill(db, changed, FakeEmbeddingProvider(), skill_id=skill_id)
    same = db.get(m.SpacedReviewCard, cid)
    assert same.front_markdown == "NEW ?"  # contenu mis à jour
    assert (same.due_at, same.interval_days, same.ease_factor) == kept  # planification SACRÉE


def test_summary_new_count_reflects_fresh_cards(client_db):
    _, TestSession = client_db
    db = TestSession()
    _, skill_id = _seed_lesson(db)
    generate_cards_for_skill(db, FakeLLMProvider(), FakeEmbeddingProvider(), skill_id=skill_id)

    student = get_default_student(db)
    summ = get_reviews_summary(db, student)
    assert summ["new_count"] == 2  # 2 cartes fraîchement générées, jamais révisées
    assert summ["subjects"][0]["new_count"] == 2

    # Un passage → la carte n'est plus « nouvelle » (last_reviewed_at posé).
    record_attempt(db, student, _def_card(db, skill_id).id, "good")
    assert get_reviews_summary(db, student)["new_count"] == 1


def test_generate_is_idempotent(client_db):
    _, TestSession = client_db
    db = TestSession()
    _, skill_id = _seed_lesson(db)
    for _ in range(2):
        generate_cards_for_skill(db, FakeLLMProvider(), FakeEmbeddingProvider(), skill_id=skill_id)
    n = db.scalar(
        select(func.count()).select_from(m.SpacedReviewCard).where(
            m.SpacedReviewCard.skill_id == skill_id
        )
    )
    assert n == 2  # clé (student, skill, card_type) → pas de doublon


# ── Réconciliation par matière : branche C + réactivation ─────────────────────


def test_reconcile_subject_generates_targets(client_db):
    _, TestSession = client_db
    db = TestSession()
    _, skill_id = _seed_lesson(db)
    subject_id = db.get(m.Skill, skill_id).subject_id
    r = reconcile_cards_for_subject(db, FakeLLMProvider(), FakeEmbeddingProvider(), subject_id=subject_id)
    assert r["created"] == 2 and r["failed_skills"] == []
    assert get_reviews_summary(db, get_default_student(db))["total_due"] == 2


def test_reconcile_suspends_orphan_then_reactivates_in_place(client_db):
    _, TestSession = client_db
    db = TestSession()
    lesson_id, skill_id = _seed_lesson(db)
    subject_id = db.get(m.Skill, skill_id).subject_id
    generate_cards_for_skill(db, FakeLLMProvider(), FakeEmbeddingProvider(), skill_id=skill_id)
    card = _def_card(db, skill_id)
    card.due_at = _now() + timedelta(days=30)
    card.interval_days = 30
    db.commit()
    kept_due = card.due_at

    # La notion quitte toute couverture (leçon repassée draft) → réconciliation matière.
    db.get(m.Lesson, lesson_id).status = "draft"
    db.commit()
    reconcile_cards_for_subject(db, FakeLLMProvider(), FakeEmbeddingProvider(), subject_id=subject_id)
    db.refresh(card)
    assert card.status == "suspended" and card.due_at == kept_due  # planif conservée
    assert get_reviews_summary(db, get_default_student(db))["total_due"] == 0  # hors session

    # La leçon est re-validée → réactivation en place au prochain rafraîchissement matière.
    db.get(m.Lesson, lesson_id).status = "validated"
    db.commit()
    reconcile_cards_for_subject(db, FakeLLMProvider(), FakeEmbeddingProvider(), subject_id=subject_id)
    db.refresh(card)
    assert card.status == "scheduled" and card.due_at == kept_due  # même ligne, planif intacte


def test_degraded_generation_is_pending_and_unserved(client_db):
    _, TestSession = client_db
    db = TestSession()
    _, skill_id = _seed_lesson(db, validated=False)  # pas de cours validé
    r = generate_cards_for_skill(db, FakeLLMProvider(), FakeEmbeddingProvider(), skill_id=skill_id)
    assert r["pending"] == 2 and r["created"] == 0
    assert _def_card(db, skill_id).status == "pending"
    assert get_reviews_summary(db, get_default_student(db))["total_due"] == 0


def test_reconcile_reports_failed_skills(client_db):
    _, TestSession = client_db
    db = TestSession()
    _, skill_id = _seed_lesson(db)
    subject_id = db.get(m.Skill, skill_id).subject_id

    class FailingLLM(FakeLLMProvider):
        def generate(self, request):
            if isinstance(request.fmt, dict) and "cards" in request.fmt.get("properties", {}):
                return LLMResponse(text="pas du json", model="fake", duration_ms=1)
            return super().generate(request)

    r = reconcile_cards_for_subject(db, FailingLLM(), FakeEmbeddingProvider(), subject_id=subject_id)
    assert r["failed_skills"] == [skill_id] and r["created"] == 0


def test_privacy_prompt_has_no_student_data(client_db):
    _, TestSession = client_db
    db = TestSession()
    _, skill_id = _seed_lesson(db)

    class RecordingLLM(FakeLLMProvider):
        def __init__(self):
            super().__init__()
            self.seen = []

        def generate(self, request):
            self.seen.append(request)
            return super().generate(request)

    llm = RecordingLLM()
    generate_cards_for_skill(db, llm, FakeEmbeddingProvider(), skill_id=skill_id)
    assert llm.seen
    for req in llm.seen:
        assert "Massimo" not in f"{req.system}\n{req.prompt}"
        assert "Un nombre relatif a un signe" in req.prompt  # ancré sur le cours


# ── Suppression explicite (§5, seul point de suppression) ─────────────────────


def test_delete_removes_cards_and_history(client_db):
    _, TestSession = client_db
    db = TestSession()
    _, skill_id = _seed_lesson(db)
    generate_cards_for_skill(db, FakeLLMProvider(), FakeEmbeddingProvider(), skill_id=skill_id)
    card = _def_card(db, skill_id)
    db.add(
        m.SpacedReviewAttempt(
            card_id=card.id, student_id=card.student_id, rating="good", reviewed_at=_now()
        )
    )
    db.commit()

    from app.modules.memory.generation import delete_skill_cards

    out = delete_skill_cards(db, skill_id)
    assert out["deleted"] == 2
    assert db.scalar(
        select(func.count()).select_from(m.SpacedReviewCard).where(
            m.SpacedReviewCard.skill_id == skill_id
        )
    ) == 0
    assert db.scalar(select(func.count()).select_from(m.SpacedReviewAttempt)) == 0


# ── Endpoints Papa (garde parent + lectures + actions) ────────────────────────


def test_generate_endpoints_are_parent_only(client_db):
    client, TestSession = client_db
    db = TestSession()
    _, skill_id = _seed_lesson(db)
    subject_id = db.get(m.Skill, skill_id).subject_id
    _as(CHILD)
    assert client.post(f"/api/memory/cards/subjects/{subject_id}/generate").status_code == 403
    assert client.post(f"/api/memory/cards/skills/{skill_id}/generate").status_code == 403
    assert client.get("/api/memory/cards/overview").status_code == 403


def test_overview_tree_preview_and_actions(client_db, poster_et_executer):
    client, TestSession = client_db
    db = TestSession()
    _, skill_id = _seed_lesson(db)
    subject_id = db.get(m.Skill, skill_id).subject_id
    _as(PARENT)

    # Avant génération : la notion est « à générer ».
    tree = client.get(f"/api/memory/cards/subjects/{subject_id}").json()
    notions = [n for ch in tree["chapters"] for le in ch["lessons"] for n in le["notions"]]
    assert any(n["skill_id"] == skill_id and n["state"] == "to_generate" for n in notions)

    ov0 = client.get("/api/memory/cards/overview").json()
    subj0 = next(s for s in ov0["subjects"] if s["subject_id"] == subject_id)
    assert subj0["to_generate"] >= 1 and subj0["active_cards"] == 0

    # Générer la matière → notion « ok », cartes actives, aperçu recto/verso disponible.
    # ⚠️ `202` depuis l'ADR-0041 §4 : la route accepte, le worker produit. Le compte-rendu
    # (`created`) est la SORTIE du travail — l'assertion porte donc toujours sur ce qui a
    # réellement été créé.
    gen = poster_et_executer(client, TestSession, f"/api/memory/cards/subjects/{subject_id}/generate")
    assert gen["created"] == 2
    tree2 = client.get(f"/api/memory/cards/subjects/{subject_id}").json()
    n2 = [n for ch in tree2["chapters"] for le in ch["lessons"] for n in le["notions"] if n["skill_id"] == skill_id][0]
    assert n2["state"] == "ok" and n2["card_count"] == 2
    cards = client.get(f"/api/memory/cards/skills/{skill_id}/cards").json()
    assert len(cards) == 2 and cards[0]["front_markdown"]

    # Suspendre (orphelinage) puis réactiver via l'endpoint.
    db2 = TestSession()
    for c in db2.scalars(select(m.SpacedReviewCard).where(m.SpacedReviewCard.skill_id == skill_id)):
        c.status = "suspended"
    db2.commit()
    react = client.post(f"/api/memory/cards/skills/{skill_id}/reactivate").json()
    assert react["reactivated"] == 2

    # DELETE des cartes d'une notion.
    dele = client.request("DELETE", f"/api/memory/cards/skills/{skill_id}").json()
    assert dele["deleted"] == 2


# ── Édition / suppression à la carte (correction manuelle Papa) ───────────────


def test_edit_card_updates_content_but_preserves_schedule(client_db):
    client, TestSession = client_db
    db = TestSession()
    _, skill_id = _seed_lesson(db)
    generate_cards_for_skill(db, FakeLLMProvider(), FakeEmbeddingProvider(), skill_id=skill_id)
    card = _def_card(db, skill_id)
    card.due_at = _now() + timedelta(days=30)
    card.interval_days = 30
    db.commit()
    cid, kept_due, kept_int = card.id, card.due_at, card.interval_days

    _as(PARENT)
    r = client.patch(
        f"/api/memory/cards/{cid}",
        json={"front_markdown": "Q éditée ?", "back_markdown": "R éditée."},
    )
    assert r.status_code == 200
    assert r.json()["front_markdown"] == "Q éditée ?"

    fresh = TestSession().get(m.SpacedReviewCard, cid)
    assert fresh.front_markdown == "Q éditée ?" and fresh.back_markdown == "R éditée."
    # Invariant §3 : le contenu change, la planification NON.
    assert fresh.due_at == kept_due and fresh.interval_days == kept_int

    # Carte inexistante → 404.
    assert (
        client.patch(
            "/api/memory/cards/999999", json={"front_markdown": "x", "back_markdown": "y"}
        ).status_code
        == 404
    )


def test_delete_single_card_removes_only_that_card(client_db):
    client, TestSession = client_db
    db = TestSession()
    _, skill_id = _seed_lesson(db)
    generate_cards_for_skill(db, FakeLLMProvider(), FakeEmbeddingProvider(), skill_id=skill_id)
    card = _def_card(db, skill_id)  # 'definition' ; 'method' reste
    db.add(
        m.SpacedReviewAttempt(
            card_id=card.id, student_id=card.student_id, rating="good", reviewed_at=_now()
        )
    )
    db.commit()
    cid = card.id

    _as(PARENT)
    assert client.request("DELETE", f"/api/memory/cards/{cid}").json() == {"id": cid, "deleted": 1}

    db2 = TestSession()
    assert db2.get(m.SpacedReviewCard, cid) is None
    remaining = db2.scalar(
        select(func.count()).select_from(m.SpacedReviewCard).where(
            m.SpacedReviewCard.skill_id == skill_id
        )
    )
    assert remaining == 1  # l'autre carte de la notion est intacte
    assert (
        db2.scalar(
            select(func.count()).select_from(m.SpacedReviewAttempt).where(
                m.SpacedReviewAttempt.card_id == cid
            )
        )
        == 0
    )
    # 404 sur une carte déjà supprimée.
    assert client.request("DELETE", f"/api/memory/cards/{cid}").status_code == 404


def test_card_edit_delete_are_parent_only(client_db):
    client, TestSession = client_db
    db = TestSession()
    _, skill_id = _seed_lesson(db)
    generate_cards_for_skill(db, FakeLLMProvider(), FakeEmbeddingProvider(), skill_id=skill_id)
    cid = _def_card(db, skill_id).id
    _as(CHILD)
    assert (
        client.patch(
            f"/api/memory/cards/{cid}", json={"front_markdown": "x", "back_markdown": "y"}
        ).status_code
        == 403
    )
    assert client.request("DELETE", f"/api/memory/cards/{cid}").status_code == 403
