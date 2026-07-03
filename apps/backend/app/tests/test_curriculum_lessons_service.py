"""Tests offline du service référentiel — passe 2 leçons + notions (aucun appel réseau).

Couvre les règles ADR-0009 §1/§3 : génération sur chapitre validé ou manuel uniquement,
leçons `draft` + notions upsertées en `Skill` (dédup par nom normalisé), verrous de
co-construction (manuel/validé intouchés, injection dans le prompt), invariant vie
privée, réparation unique puis échec propre sans rien persister.
"""

import json

import pytest
from fastapi import HTTPException
from sqlalchemy import select

import app.db.models as m
from app.core.config import settings
from app.modules.ai.provider import LLMResponse
from app.modules.curriculum import get_curriculum_provider
from app.modules.curriculum.schemas import GeneratedLessons
from app.modules.curriculum.service import (
    CurriculumGenerationError,
    create_manual_lesson,
    delete_lesson,
    generate_lessons,
    reorder_lessons,
    set_lesson_validation,
    update_lesson,
)
from app.prompts import curriculum
from app.tests.fakes import _DEFAULT_LESSONS, FakeLLMProvider


class _RecordingLLM(FakeLLMProvider):
    """FakeLLMProvider qui enregistre les prompts reçus (asserts d'injection §3)."""

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self.prompts: list[str] = []
        self.systems: list[str] = []

    def generate(self, request) -> LLMResponse:  # noqa: ANN001 — stub de test
        self.prompts.append(request.prompt)
        self.systems.append(request.system or "")
        return super().generate(request)


class _SequenceLLM:
    """Renvoie des réponses prédéfinies dans l'ordre (ignore la requête)."""

    def __init__(self, responses: list[str]) -> None:
        self._responses = list(responses)
        self.calls = 0

    def generate(self, request) -> LLMResponse:  # noqa: ANN001 — stub de test
        self.calls += 1
        return LLMResponse(text=self._responses.pop(0), model="seq", duration_ms=1)


def _seed_chapter(db, *, source="generated", validation_status="validated") -> int:
    """SchoolYear 4e + matière seedée + un chapitre dans l'état demandé. → chapter_id"""
    profile = db.scalars(select(m.StudentProfile)).first()
    subject = db.scalars(select(m.Subject)).first()
    year = m.SchoolYear(student_id=profile.id, label="2026-2027", level="4e")
    db.add(year)
    db.flush()
    sys_row = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject.id)
    db.add(sys_row)
    db.flush()
    chapter = m.Chapter(
        school_year_subject_id=sys_row.id,
        name="Nombres relatifs : opérations",
        description="Additionner, soustraire, multiplier et diviser des relatifs.",
        sort_order=0,
        source=source,
        validation_status=validation_status,
        program_version="2020" if source == "generated" else None,
        metadata_json={"themes": ["Nombres et calculs"]} if source == "generated" else None,
    )
    db.add(chapter)
    db.commit()
    return chapter.id


def _lessons(db, chapter_id: int) -> list[m.Lesson]:
    return list(
        db.scalars(
            select(m.Lesson)
            .where(m.Lesson.chapter_id == chapter_id)
            .order_by(m.Lesson.sort_order, m.Lesson.id)
        )
    )


def _skills(db) -> list[m.Skill]:
    return list(db.scalars(select(m.Skill).order_by(m.Skill.id)))


def _links(db) -> list[m.LessonSkill]:
    return list(db.scalars(select(m.LessonSkill)))


def _jobs(db) -> list[m.AIJob]:
    return list(db.scalars(select(m.AIJob).where(m.AIJob.job_type == "curriculum_lessons")))


def test_lessons_few_shots_are_valid_generated_lessons() -> None:
    """Les exemples few-shot du prompt leçons v1 restent conformes au schéma de production."""
    for shot in curriculum.LESSONS_FEW_SHOTS:
        GeneratedLessons.model_validate(shot["output"])


def test_generate_creates_draft_lessons_and_upserts_skills(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        chapter_id = _seed_chapter(db)
        skills_before = len(_skills(db))  # 1 : « Nombres relatifs » seedée par conftest

        lessons = generate_lessons(db, FakeLLMProvider(), chapter_id)

        assert len(lessons) == 3
        for i, lesson in enumerate(lessons):
            assert lesson.created_by == "ai"
            assert lesson.status == "draft"  # = pending, obligatoire pour du généré (§3)
            assert lesson.program_version == "2020"  # reprise du chapitre
            assert lesson.content_markdown is None  # non rempli par la passe 2
            assert lesson.sort_order == i

        # Upsert notions → Skill : « Nombres relatifs » (seedée) réutilisée, 2 créées.
        skills = _skills(db)
        assert len(skills) == skills_before + 2
        for skill in skills:
            assert skill.level == "4e"
        # Liaisons dépliées : 2 + 1 + 1 notions (dédupliquées par leçon).
        assert len(_links(db)) == 4

        jobs = _jobs(db)
        assert len(jobs) == 1
        assert jobs[0].status == "succeeded"
        assert jobs[0].input_json["prompt_version"] == curriculum.LESSONS_PROMPT_VERSION
        assert jobs[0].input_json["provider"] == "FakeLLMProvider"
        assert jobs[0].output_json["model"] == "fake"
        assert jobs[0].output_json["lessons_count"] == 3
        assert jobs[0].output_json["skills_created"] == 2
        assert jobs[0].output_json["skills_reused"] == 1


def test_generate_refused_unless_chapter_validated_or_manual(client_db) -> None:
    """§1 : entrée = chapitre validé OU manuel — un généré pending/rejected est refusé."""
    _, Session = client_db
    for refused_status in ("pending", "rejected"):
        with Session() as db:
            chapter_id = _seed_chapter(db, validation_status=refused_status)
            with pytest.raises(HTTPException) as exc:
                generate_lessons(db, FakeLLMProvider(), chapter_id)
            assert exc.value.status_code == 409
            assert _lessons(db, chapter_id) == []

    # Un chapitre manuel (jamais « validé » au sens génération) est accepté : Papa crée
    # le squelette, l'IA propose le remplissage (§3).
    with Session() as db:
        chapter_id = _seed_chapter(db, source="manual", validation_status="validated")
        lessons = generate_lessons(db, FakeLLMProvider(), chapter_id)
        assert len(lessons) == 3
        # Chapitre manuel sans program_version → référence opérative du service.
        assert all(l.program_version == "2020" for l in lessons)


def test_regeneration_preserves_manual_and_validated_lessons(client_db) -> None:
    """§3 : la (re)génération ne touche JAMAIS les leçons `parent` ni `validated` ;
    elle remplace les leçons IA non validées et ajoute APRÈS l'existant conservé."""
    _, Session = client_db
    with Session() as db:
        chapter_id = _seed_chapter(db)
        manual = m.Lesson(
            chapter_id=chapter_id, title="Leçon manuelle de Papa",
            status="validated", created_by="parent", sort_order=0,
        )
        validated_ai = m.Lesson(
            chapter_id=chapter_id, title="Leçon IA validée",
            status="validated", created_by="ai", sort_order=1,
        )
        draft_ai = m.Lesson(
            chapter_id=chapter_id, title="Leçon IA draft",
            status="draft", created_by="ai", sort_order=2,
        )
        db.add_all([manual, validated_ai, draft_ai])
        db.commit()
        kept_titles = {"Leçon manuelle de Papa", "Leçon IA validée"}

        llm = _RecordingLLM()
        generate_lessons(db, llm, chapter_id)

        # Asserts par titre : SQLite recycle les ids supprimés (max+1), un assert par id
        # serait trompeur.
        remaining = _lessons(db, chapter_id)
        remaining_titles = {l.title for l in remaining}
        assert kept_titles <= remaining_titles  # manuel + validé intacts
        assert "Leçon IA draft" not in remaining_titles  # le draft IA est remplacé
        assert len(remaining) == 2 + 3
        created = [l for l in remaining if l.title not in kept_titles]
        assert len(created) == 3
        assert min(l.sort_order for l in created) == 2  # append après l'existant conservé

        # Les leçons conservées sont injectées dans le prompt (« complète sans dupliquer »).
        prompt = llm.prompts[0]
        assert "Leçon manuelle de Papa" in prompt
        assert "Leçon IA validée" in prompt
        assert "Leçon IA draft" not in prompt  # remplaçable → pas injectée
        assert "dupliquer" in prompt or "dupliquer" in llm.systems[0]


def test_manual_lessons_injected_in_built_prompt() -> None:
    """Assert direct sur le prompt construit (sans DB) — verrou §3."""
    system, prompt = curriculum.build_lessons_prompt(
        "Mathématiques",
        "4e",
        "cycle 4",
        {"name": "Théorème de Pythagore", "description": "Réciproque incluse.",
         "themes": ["Espace et géométrie"]},
        "2020",
        ["Leçon manuelle de Papa"],
    )
    assert "Leçon manuelle de Papa" in prompt
    assert "Théorème de Pythagore" in prompt
    assert "Espace et géométrie" in prompt
    assert "2020" in prompt
    assert "dupliquer" in prompt or "dupliquer" in system


def test_skill_dedup_across_two_generations(client_db) -> None:
    """Deux générations successives ne créent aucune `Skill` en double
    (clé subject_id + level + nom normalisé)."""
    _, Session = client_db
    with Session() as db:
        chapter_id = _seed_chapter(db)
        generate_lessons(db, FakeLLMProvider(), chapter_id)
        skills_after_first = {(s.subject_id, s.level, s.name) for s in _skills(db)}

        generate_lessons(db, FakeLLMProvider(), chapter_id)
        skills_after_second = {(s.subject_id, s.level, s.name) for s in _skills(db)}

        assert skills_after_first == skills_after_second
        assert len(_skills(db)) == len(skills_after_first)  # aucun doublon de ligne
        job = _jobs(db)[-1]
        assert job.output_json["skills_created"] == 0  # tout réutilisé au 2e passage


def test_skill_dedup_is_case_and_space_insensitive(client_db) -> None:
    """Matching par nom normalisé casse/espaces : «  nombres   RELATIFS » réutilise la
    Skill seedée « Nombres relatifs » (le matching sémantique embedding = Lot 3)."""
    _, Session = client_db
    variant = {
        "lessons": [
            {"title": "Leçon A", "summary": "Résumé.", "notions": ["  nombres   RELATIFS "]},
            {"title": "Leçon B", "summary": "Résumé.", "notions": ["Nombres relatifs"]},
        ]
    }
    with Session() as db:
        chapter_id = _seed_chapter(db)
        seeded = db.scalars(select(m.Skill)).first()
        generate_lessons(db, FakeLLMProvider(curriculum_lessons=variant), chapter_id)

        skills = _skills(db)
        assert len(skills) == 1  # aucune création : tout mappe sur la seedée
        assert skills[0].id == seeded.id
        assert skills[0].name == "Nombres relatifs"  # le nom existant est conservé
        links = _links(db)
        assert {link.skill_id for link in links} == {seeded.id}
        assert len(links) == 2  # une liaison par leçon, unicité de la paire respectée


def test_privacy_invariant_no_student_data_in_lessons_prompt(client_db) -> None:
    """ADR-0009 addendum, condition 1 : aucune donnée de Massimo dans system+prompt."""
    _, Session = client_db
    with Session() as db:
        profile = db.scalars(select(m.StudentProfile)).first()
        user = db.scalars(select(m.User)).first()
        student_fields = [profile.first_name, user.name, user.email]
        chapter_id = _seed_chapter(db)

        llm = _RecordingLLM()
        generate_lessons(db, llm, chapter_id)

    haystack = f"{llm.systems[0]}\n{llm.prompts[0]}"
    for value in student_fields:
        assert value, "champ élève vide : le test perdrait son sens"
        assert value not in haystack


def test_invalid_then_valid_triggers_single_repair(client_db) -> None:
    _, Session = client_db
    valid = json.dumps(_DEFAULT_LESSONS, ensure_ascii=False)
    llm = _SequenceLLM(["ceci n'est pas du JSON", valid])
    with Session() as db:
        chapter_id = _seed_chapter(db)
        lessons = generate_lessons(db, llm, chapter_id)
        assert llm.calls == 2
        assert len(lessons) == 3
        assert _jobs(db)[0].status == "succeeded"


def test_persistently_invalid_fails_clean_nothing_persisted(client_db) -> None:
    """Invalide × 2 → erreur propre, AUCUNE leçon/Skill/liaison persistée (rollback)."""
    _, Session = client_db
    llm = _SequenceLLM(['{"bad": true}', '{"still": "wrong"}'])
    with Session() as db:
        chapter_id = _seed_chapter(db)
        skills_before = len(_skills(db))
        with pytest.raises(CurriculumGenerationError):
            generate_lessons(db, llm, chapter_id)
        assert llm.calls == 2  # une réparation tentée, puis abandon
        assert _lessons(db, chapter_id) == []
        assert len(_skills(db)) == skills_before  # aucune Skill créée
        assert _links(db) == []
        jobs = _jobs(db)
        assert len(jobs) == 1
        assert jobs[0].status == "failed"


def test_missing_api_key_raises_explicit_error_for_lessons_too(monkeypatch) -> None:
    """Condition 4 (§7 addendum) : même résolveur que la passe 1 — sans clé, erreur
    explicite mentionnant le repli local, jamais de bascule silencieuse."""
    monkeypatch.setattr(settings, "curriculum_llm_provider", "anthropic")
    monkeypatch.setattr(settings, "anthropic_api_key", None)
    with pytest.raises(HTTPException) as exc:
        get_curriculum_provider()
    assert exc.value.status_code == 503
    assert "CURRICULUM_LLM_PROVIDER=ollama" in exc.value.detail


def test_manual_lesson_crud_and_validation_flow(client_db) -> None:
    """Création manuelle validée d'office (§3), édition, validate/reject sur draft
    uniquement, reorder, suppression avec purge des liaisons."""
    _, Session = client_db
    with Session() as db:
        chapter_id = _seed_chapter(db)

        # Manuelle → parent + validated d'office, notions upsertées.
        lesson = create_manual_lesson(
            db, chapter_id, title="Leçon de Papa", summary="Résumé.",
            notions=["Nombres relatifs", "Nouvelle notion"],
        )
        assert lesson.created_by == "parent"
        assert lesson.status == "validated"
        assert lesson.sort_order == 0
        assert lesson.program_version is None
        assert len(_links(db)) == 2
        assert len(_skills(db)) == 2  # seedée réutilisée + 1 créée

        # validate/reject : uniquement pertinents sur draft → 409 sur une validée.
        with pytest.raises(HTTPException) as exc:
            set_lesson_validation(db, lesson.id, "validate")
        assert exc.value.status_code == 409

        draft = m.Lesson(
            chapter_id=chapter_id, title="Brouillon IA", status="draft",
            created_by="ai", sort_order=1,
        )
        db.add(draft)
        db.commit()
        assert set_lesson_validation(db, draft.id, "validate").status == "validated"
        draft2 = m.Lesson(
            chapter_id=chapter_id, title="Brouillon IA 2", status="draft",
            created_by="ai", sort_order=2,
        )
        db.add(draft2)
        db.commit()
        # Rejet → archived (l'énuméré documenté n'a pas de rejected).
        assert set_lesson_validation(db, draft2.id, "reject").status == "archived"

        # PATCH : notions fournies = remplacement du rattachement.
        updated = update_lesson(db, lesson.id, title="Renommée", notions=["Nombres relatifs"])
        assert updated.title == "Renommée"
        own_links = [link for link in _links(db) if link.lesson_id == lesson.id]
        assert len(own_links) == 1
        assert len(_skills(db)) == 2  # les Skill ne sont jamais supprimées

        # Reorder : liste complète exigée, même convention que les chapitres.
        ids = [l.id for l in _lessons(db, chapter_id)]
        reordered = reorder_lessons(db, chapter_id, list(reversed(ids)))
        assert [l.id for l in reordered] == list(reversed(ids))
        with pytest.raises(HTTPException) as exc:
            reorder_lessons(db, chapter_id, ids[:1])
        assert exc.value.status_code == 400

        # DELETE : la leçon ET ses liaisons disparaissent, les Skill restent.
        delete_lesson(db, lesson.id)
        assert all(link.lesson_id != lesson.id for link in _links(db))
        assert len(_skills(db)) == 2
