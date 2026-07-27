"""Tests offline du module mindmaps (ADR-0016 ; aucun ollama, aucun pgvector).

Couvre : (a) génération nominale — MindmapJson valide, arbre intègre, `pending`, trace `ai_jobs` ;
(b) une réparation après une sortie invalide ; (c) échec persistant → erreur, rien persisté ;
(d) leçon non validée refusée proprement ; (e) few-shots valides ; (f) invariant vie privée ;
(g) intégrité de l'arbre (parent inconnu / cycle rejetés) ; (h) gate `validated` (routes élève) ;
(i) **évaluation de la reconstruction déterministe** — score stable, détail juste/faux, XP serveur ;
(j) garde parent (403 child) sur les écritures.
"""

import json

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select

from app.db.models import (
    AIJob,
    Chapter,
    Lesson,
    LessonSkill,
    Mindmap,
    MindmapAttempt,
    SchoolYear,
    SchoolYearSubject,
    Skill,
    StudentProfile,
    Subject,
    XPEvent,
)
from app.modules.ai.canonical_context import CanonicalContext, build_canonical_sections
from app.modules.ai.provider import LLMResponse
from app.modules.gamification.service import mindmap_reconstruction_xp, mindmap_xp
from app.modules.mindmaps import service
from app.modules.mindmaps.schemas import MindmapJson, MindmapNodePlacement
from app.prompts import mindmap
from app.tests.fakes import FakeEmbeddingProvider, FakeLLMProvider

_VALID_MINDMAP_JSON = json.dumps(mindmap.FEW_SHOTS[0], ensure_ascii=False)
_LESSON_CONTENT = (
    "# Les nombres relatifs\n\nUn nombre relatif porte un signe + ou -. Sur la droite "
    "graduée, plus on va vers la droite, plus le nombre est grand.\n"
)


class _SequenceLLM:
    """Provider de test : renvoie des réponses prédéfinies dans l'ordre (ignore la requête)."""

    def __init__(self, responses: list[str]) -> None:
        self._responses = list(responses)
        self.calls = 0

    def generate(self, request) -> LLMResponse:  # noqa: ANN001 — stub de test
        self.calls += 1
        return LLMResponse(text=self._responses.pop(0), model="seq", duration_ms=1)


def _seed_validated_lesson(db, *, validated: bool = True, content: str | None = _LESSON_CONTENT):
    """Année active → matière → chapitre validé → leçon (validée par défaut) + notion rattachée."""
    subject = db.scalar(select(Subject).where(Subject.slug == "mathematiques"))
    year = SchoolYear(student_id=1, label="2026-2027", level="4e", status="active")
    db.add(year)
    db.flush()
    sys_row = SchoolYearSubject(school_year_id=year.id, subject_id=subject.id, status="active")
    db.add(sys_row)
    db.flush()
    chapter = Chapter(
        school_year_subject_id=sys_row.id,
        name="Nombres relatifs",
        validation_status="validated",
        sort_order=0,
    )
    db.add(chapter)
    db.flush()
    lesson = Lesson(
        chapter_id=chapter.id,
        title="Additionner des nombres relatifs",
        status="validated" if validated else "draft",
        created_by="ai",
        content_markdown=content,
        program_version="2020",
        sort_order=0,
    )
    db.add(lesson)
    db.flush()
    skill = db.scalar(select(Skill).where(Skill.name == "Nombres relatifs"))
    db.add(LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
    db.commit()
    db.refresh(lesson)
    return lesson


def _jobs(db) -> list[AIJob]:
    return list(db.scalars(select(AIJob).where(AIJob.job_type == "mindmap_generate")))


# ── Génération ───────────────────────────────────────────────────────────────


def test_generate_mindmap_nominal_pending_tree_and_trace(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        row = service.generate_mindmap(
            db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson.id
        )
        assert row.validation_status == "pending"
        assert row.lesson_id == lesson.id
        assert row.source == "generated"

        spec = MindmapJson.model_validate(row.mindmap_json)  # conforme + arbre intègre
        ids = {n.id for n in spec.nodes}
        for node in spec.nodes:  # arbre intègre : chaque parent existe ou est None
            assert node.parent is None or node.parent in ids

        jobs = _jobs(db)
        assert len(jobs) == 1
        assert jobs[0].status == "succeeded"
        assert jobs[0].input_json["prompt_version"] == mindmap.MINDMAP_PROMPT_VERSION
        assert jobs[0].input_json["lesson_id"] == lesson.id


def test_invalid_then_valid_triggers_single_repair(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        llm = _SequenceLLM(["ceci n'est pas du JSON", _VALID_MINDMAP_JSON])
        row = service.generate_mindmap(db, llm, FakeEmbeddingProvider(), lesson_id=lesson.id)
        assert row.validation_status == "pending"
        assert llm.calls == 2  # une génération + exactement une réparation
        assert _jobs(db)[0].status == "succeeded"


def test_persistently_invalid_raises_and_persists_nothing(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        before = db.scalar(select(func.count()).select_from(Mindmap))
        # Deux sorties JSON valides mais non conformes (parent inconnu → intégrité rejetée).
        bad = json.dumps({"center": "X", "nodes": [{"id": "a", "label": "A", "parent": "ghost"}]})
        llm = _SequenceLLM([bad, bad])
        with pytest.raises(service.MindmapGenerationError):
            service.generate_mindmap(db, llm, FakeEmbeddingProvider(), lesson_id=lesson.id)
        assert llm.calls == 2  # une réparation tentée, puis abandon
        after = db.scalar(select(func.count()).select_from(Mindmap))
        assert after == before  # RIEN persisté
        job = _jobs(db)[0]
        assert job.status == "failed"
        assert job.error_message
        assert job.output_json is None


def test_unvalidated_lesson_refused_no_job_no_mindmap(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, validated=False)  # brouillon
        with pytest.raises(Exception) as exc:  # HTTPException 409
            service.generate_mindmap(
                db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson.id
            )
        assert getattr(exc.value, "status_code", None) == 409
        assert db.scalar(select(func.count()).select_from(Mindmap)) == 0
        assert _jobs(db) == []  # la garde tombe AVANT toute trace


def test_validated_lesson_without_course_refused(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=None)  # validée mais sans cours rédigé
        with pytest.raises(Exception) as exc:
            service.generate_mindmap(
                db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson.id
            )
        assert getattr(exc.value, "status_code", None) == 409


def test_crud_update_regenerate_validate_delete(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        row = service.generate_mindmap(
            db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson.id
        )
        mid = row.id
        assert service.validate_mindmap(db, mid).validation_status == "validated"

        spec = MindmapJson.model_validate(row.mindmap_json)
        assert (
            service.update_mindmap_json(db, mindmap_id=mid, spec=spec).validation_status
            == "pending"
        )
        service.validate_mindmap(db, mid)
        assert (
            service.regenerate_mindmap(
                db, FakeLLMProvider(), FakeEmbeddingProvider(), mindmap_id=mid
            ).validation_status
            == "pending"
        )

        # Une tentative liée existe → delete ne doit pas violer la FK.
        service.validate_mindmap(db, mid)
        student = db.scalar(select(StudentProfile))
        service.record_attempt(db, student, mid, [])
        service.delete_mindmap(db, mid)
        assert db.scalar(select(func.count()).select_from(Mindmap)) == 0
        assert db.scalar(select(func.count()).select_from(MindmapAttempt)) == 0


# ── Intégrité de l'arbre (schéma Pydantic) ─────────────────────────────────────


def test_tree_integrity_rejects_unknown_parent() -> None:
    with pytest.raises(ValidationError):
        MindmapJson.model_validate(
            {"center": "X", "nodes": [{"id": "a", "label": "A", "parent": "ghost"}]}
        )


def test_tree_integrity_rejects_cycle() -> None:
    with pytest.raises(ValidationError):
        MindmapJson.model_validate(
            {
                "center": "X",
                "nodes": [
                    {"id": "a", "label": "A", "parent": "b"},
                    {"id": "b", "label": "B", "parent": "a"},
                ],
            }
        )


def test_few_shots_are_valid_mindmapjson() -> None:
    for shot in mindmap.FEW_SHOTS:
        MindmapJson.model_validate(shot)  # ne doit pas lever


def test_prompt_derives_from_course_not_from_child(client_db) -> None:
    """Invariant vie privée : la carte dérive du COURS, aucun champ de Massimo dans le prompt."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        sections = build_canonical_sections(CanonicalContext(lesson=lesson, chunks=[]))
        system, prompt = mindmap.build_prompt(
            sections=sections, subject="Mathématiques", level="4e",
            chapter="Nombres relatifs", title=lesson.title,
        )
        blob = system + prompt
        assert lesson.content_markdown in prompt  # le cours validé est bien la source
        assert "Massimo" not in blob  # aucune donnée de l'enfant n'entre dans le prompt


# ── Gate `validated` (routes élève, service) ───────────────────────────────────


def test_pending_mindmap_hidden_until_validated(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        row = service.generate_mindmap(
            db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson.id
        )
        # `pending` : absente de la liste matière ET 404 en lecture élève.
        assert service.list_subject_mindmaps(db, "mathematiques") == []
        with pytest.raises(Exception) as exc:
            service.get_student_mindmap(db, row.id)
        assert getattr(exc.value, "status_code", None) == 404

        # Après validation : visible dans la liste et lisible.
        service.validate_mindmap(db, row.id)
        listed = service.list_subject_mindmaps(db, "mathematiques")
        assert [m["id"] for m in listed] == [row.id]
        assert service.get_student_mindmap(db, row.id)["mindmap_json"]["center"]


def test_summary_counts_validated_per_subject(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        row = service.generate_mindmap(
            db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson.id
        )
        # `pending` → compteur 0 pour la matière ; toutes les matières de l'année sont listées.
        summ = service.mindmaps_summary(db)
        maths = next(s for s in summ["subjects"] if s["slug"] == "mathematiques")
        assert maths["mindmap_count"] == 0
        # Après validation → compteur 1.
        service.validate_mindmap(db, row.id)
        summ2 = service.mindmaps_summary(db)
        maths2 = next(s for s in summ2["subjects"] if s["slug"] == "mathematiques")
        assert maths2["mindmap_count"] == 1


# ── Reconstruction — évaluation SERVEUR déterministe ───────────────────────────


def _partial_placements() -> list[MindmapNodePlacement]:
    """3 nœuds requis bien placés, 1 mal placé (comparer sous « signe » au lieu de « droite »)."""
    return [
        MindmapNodePlacement(node_id="signe", parent_id=None),
        MindmapNodePlacement(node_id="droite", parent_id=None),
        MindmapNodePlacement(node_id="oppose", parent_id="signe"),
        MindmapNodePlacement(node_id="comparer", parent_id="signe"),  # ← faux (attendu: droite)
    ]


def test_score_reconstruction_is_deterministic_and_detailed() -> None:
    mm = mindmap.FEW_SHOTS[0]  # required: eau, lumiere, co2, photo
    # Placer 3 des 4 requis correctement, 1 faux.
    placements = [
        MindmapNodePlacement(node_id="eau", parent_id=None),
        MindmapNodePlacement(node_id="lumiere", parent_id=None),
        MindmapNodePlacement(node_id="co2", parent_id=None),
        MindmapNodePlacement(node_id="photo", parent_id="eau"),  # ← faux (attendu: None)
    ]
    s1, d1 = service.score_reconstruction(mm, placements)
    s2, d2 = service.score_reconstruction(mm, placements)
    assert s1 == s2 == 75  # 3/4 nœuds requis justes
    by_id = {d.node_id: d for d in d1}
    assert by_id["eau"].correct is True and by_id["eau"].optional is False
    assert by_id["photo"].correct is False and by_id["photo"].placed_parent == "eau"
    # Les optionnels sont évalués mais hors barème.
    assert by_id["racines"].optional is True


def test_record_attempt_persists_score_and_awards_xp_server(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        row = service.generate_mindmap(
            db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson.id
        )
        service.validate_mindmap(db, row.id)
        student = db.scalar(select(StudentProfile))

        result = service.record_attempt(db, student, row.id, _partial_placements())
        assert result["score"] == 75  # 3/4 requis (comparer mal placé)
        assert result["correct_count"] == 3
        assert result["expected_count"] == 4
        assert result["xp_awarded"] == mindmap_xp(75) == 25

        # Tentative persistée avec son score serveur.
        attempt = db.get(MindmapAttempt, result["attempt_id"])
        assert attempt is not None and attempt.score == 75
        assert attempt.mindmap_id == row.id

        # XP posé côté serveur (jamais client) avec la bonne raison.
        events = list(db.scalars(select(XPEvent).where(XPEvent.student_id == student.id)))
        assert len(events) == 1
        assert events[0].reason == "mindmap_reconstruction"
        assert events[0].amount == 25


def test_reconstruction_xp_reduced_by_failed_attempts() -> None:
    # Réussite (100 %) → 30 XP ; chaque échec retire 5 ; plancher = base (10).
    assert mindmap_reconstruction_xp(100, 0) == 30
    assert mindmap_reconstruction_xp(100, 1) == 25
    assert mindmap_reconstruction_xp(100, 3) == 15
    assert mindmap_reconstruction_xp(100, 10) == 10  # plancher, jamais sous la base


def test_record_attempt_applies_failure_penalty_server(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        row = service.generate_mindmap(
            db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson.id
        )
        service.validate_mindmap(db, row.id)
        student = db.scalar(select(StudentProfile))
        # Reconstruction parfaite (score 100) mais 2 échecs en séance → XP = 30 - 2*5 = 20.
        placements = [
            MindmapNodePlacement(node_id="signe", parent_id=None),
            MindmapNodePlacement(node_id="droite", parent_id=None),
            MindmapNodePlacement(node_id="oppose", parent_id="signe"),
            MindmapNodePlacement(node_id="comparer", parent_id="droite"),
        ]
        result = service.record_attempt(db, student, row.id, placements, failed_attempts=2)
        assert result["score"] == 100
        assert result["xp_awarded"] == 20
        event = db.scalar(select(XPEvent).where(XPEvent.student_id == student.id))
        assert event.amount == 20


def test_evaluate_reconstruction_is_pure_no_persist_no_xp(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        row = service.generate_mindmap(
            db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson.id
        )
        service.validate_mindmap(db, row.id)

        result = service.evaluate_reconstruction(db, row.id, _partial_placements())
        assert result["score"] == 75
        # Pur : aucune tentative persistée, aucun XP crédité.
        assert db.scalar(select(func.count()).select_from(MindmapAttempt)) == 0
        assert db.scalar(select(func.count()).select_from(XPEvent)) == 0


def test_evaluate_pending_mindmap_404(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        row = service.generate_mindmap(  # reste `pending`
            db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson.id
        )
        with pytest.raises(Exception) as exc:
            service.evaluate_reconstruction(db, row.id, [])
        assert getattr(exc.value, "status_code", None) == 404


# ── Garde parent (403 child) sur les écritures ─────────────────────────────────


def test_parent_routes_forbidden_for_child(client_db) -> None:
    client, _ = client_db  # get_current_user override → rôle "child"
    resp = client.post("/api/mindmaps/generate", json={"lesson_id": 1})
    assert resp.status_code == 403
