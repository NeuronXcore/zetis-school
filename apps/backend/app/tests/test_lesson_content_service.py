"""Tests offline de la rédaction du cours d'une leçon (aucun appel réseau).

Moteur LOCAL (`get_provider`) — pas la dérogation cloud `curriculum_*`. Couvre :
remplissage de `content_markdown` + trace `ai_jobs lesson_content`, régénération qui
écrase, réparation unique puis échec propre (contenu existant intouché), 404/409,
injection du contexte référentiel (matière/niveau/chapitre/titre/notions/version)
dans le prompt.
"""

import json

import pytest
from fastapi import HTTPException
from sqlalchemy import select

import app.db.models as m
from app.modules.ai.provider import LLMResponse
from app.modules.curriculum.service import (
    CurriculumGenerationError,
    create_manual_lesson,
    generate_lesson_content,
    generate_lessons,
    set_lesson_validation,
)
from app.prompts import lesson_content
from app.tests.fakes import _DEFAULT_LESSON_CONTENT, FakeLLMProvider


class _RecordingLLM(FakeLLMProvider):
    """FakeLLMProvider qui enregistre les prompts reçus (asserts d'injection)."""

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


def _seed_lesson(db, *, status="draft", with_notions=True) -> int:
    """SchoolYear 4e + chapitre validé + une leçon dans l'état demandé. → lesson_id"""
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
        source="generated",
        validation_status="validated",
        program_version="2020",
    )
    db.add(chapter)
    db.flush()
    lesson = create_manual_lesson(
        db,
        chapter.id,
        title="Règle des signes",
        summary="Multiplier et diviser des relatifs.",
        notions=["Règle des signes", "Produit de relatifs"] if with_notions else None,
    )
    if status != "validated":
        lesson.status = status
        db.commit()
    return lesson.id


def _jobs(db) -> list[m.AIJob]:
    # ⚠️ `order_by` explicite (2026-08-06). Sans lui, ce helper rendait l'ordre PHYSIQUE de
    # SQLite, et les assertions ci-dessous lisaient « l'ordre de création » par coïncidence.
    # L'index `ix_ai_jobs_type_status` de l'ADR-0041 a changé le plan de requête et l'ordre avec
    # lui — `failed` avant `succeeded`. Aucun comportement n'a bougé : les deux jobs existent,
    # avec les mêmes statuts. C'est la requête du test qui était sous-spécifiée.
    return list(
        db.scalars(
            select(m.AIJob).where(m.AIJob.job_type == "lesson_content").order_by(m.AIJob.id)
        )
    )


def test_scrub_converts_details_and_strips_known_html_only(client_db) -> None:
    """Le HTML brut vu en réel (<details>/<summary> pour cacher les solutions) est
    converti en markdown ; les comparaisons mathématiques ne sont jamais touchées."""
    _, Session = client_db
    with Session() as db:
        lesson_id = _seed_lesson(db)
        dirty = {
            "content": (
                "# Cours\n\nExercice 1 :\n"
                "<details> <summary>Clique pour voir la solution</summary> "
                "**Réponse : Point de vue interne.** </details>\n"
                "Un saut<br/>de ligne. Et en maths : si x<y et z>2 alors x+z<y+z.\n"
                + "Remplissage pour dépasser la borne minimale du schéma. " * 8
            )
        }

        lesson = generate_lesson_content(
            db, FakeLLMProvider(lesson_content=dirty), lesson_id
        )

        content = lesson.content_markdown
        assert "<details>" not in content and "</details>" not in content
        assert "<summary>" not in content and "<br" not in content
        # La solution reste lisible, promue en gras.
        assert "**Clique pour voir la solution**" in content
        assert "**Réponse : Point de vue interne.**" in content
        # Les inégalités mathématiques survivent au nettoyage (liste fermée de balises).
        assert "si x<y et z>2 alors x+z<y+z" in content


def test_content_schema_has_no_string_length_bounds() -> None:
    """llama.cpp ne convertit pas minLength/maxLength en grammaire (400 « failed to
    parse grammar », vu en réel sur qwen3.6) : le schéma envoyé à Ollama ne doit
    jamais les porter — les bornes restent tenues par Pydantic + réparation."""
    from app.modules.curriculum.schemas import lesson_content_schema

    props = lesson_content_schema()["properties"]["content"]
    assert "minLength" not in props
    assert "maxLength" not in props


def test_generate_content_fills_markdown_and_traces_job(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson_id = _seed_lesson(db)

        lesson = generate_lesson_content(db, FakeLLMProvider(), lesson_id)

        assert lesson.content_markdown == _DEFAULT_LESSON_CONTENT["content"].strip()
        jobs = _jobs(db)
        assert len(jobs) == 1
        job = jobs[0]
        assert job.status == "succeeded"
        assert job.input_json["prompt_version"] == lesson_content.LESSON_CONTENT_PROMPT_VERSION
        assert job.input_json["regenerate"] is False
        assert job.input_json["provider"] == "FakeLLMProvider"
        assert job.output_json["content_chars"] == len(lesson.content_markdown)


def test_regenerate_overwrites_existing_content(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson_id = _seed_lesson(db)
        generate_lesson_content(db, FakeLLMProvider(), lesson_id)

        other = {"content": "# Autre cours\n\n" + "Contenu remplacé. " * 30}
        lesson = generate_lesson_content(db, FakeLLMProvider(lesson_content=other), lesson_id)

        assert lesson.content_markdown == other["content"].strip()
        jobs = _jobs(db)
        assert [j.input_json["regenerate"] for j in jobs] == [False, True]


def test_repair_once_then_success(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson_id = _seed_lesson(db)
        llm = _SequenceLLM(["pas du json", json.dumps(_DEFAULT_LESSON_CONTENT)])

        lesson = generate_lesson_content(db, llm, lesson_id)

        assert llm.calls == 2
        assert lesson.content_markdown is not None
        assert _jobs(db)[0].status == "succeeded"


def test_double_failure_keeps_existing_content(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson_id = _seed_lesson(db)
        generate_lesson_content(db, FakeLLMProvider(), lesson_id)
        before = db.get(m.Lesson, lesson_id).content_markdown

        llm = _SequenceLLM(["pas du json", json.dumps({"content": "trop court"})])
        with pytest.raises(CurriculumGenerationError):
            generate_lesson_content(db, llm, lesson_id)

        assert llm.calls == 2
        assert db.get(m.Lesson, lesson_id).content_markdown == before
        statuses = [j.status for j in _jobs(db)]
        assert statuses == ["succeeded", "failed"]


def test_unknown_lesson_404(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        with pytest.raises(HTTPException) as exc:
            generate_lesson_content(db, FakeLLMProvider(), 99999)
        assert exc.value.status_code == 404


def test_archived_lesson_409(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson_id = _seed_lesson(db, status="draft")
        set_lesson_validation(db, lesson_id, "reject")  # draft → archived

        with pytest.raises(HTTPException) as exc:
            generate_lesson_content(db, FakeLLMProvider(), lesson_id)
        assert exc.value.status_code == 409
        assert _jobs(db) == []  # refusé avant tout appel LLM


def test_prompt_carries_referential_context(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson_id = _seed_lesson(db)
        llm = _RecordingLLM()

        generate_lesson_content(db, llm, lesson_id)

        prompt = llm.prompts[0]
        assert "Règle des signes" in prompt  # titre leçon (et notion homonyme)
        assert "Nombres relatifs : opérations" in prompt  # chapitre
        assert "4e" in prompt  # niveau
        assert "2020" in prompt  # version programme
        assert "Produit de relatifs" in prompt  # notion rattachée
        assert "12 ans" in llm.systems[0]  # cadrage pédagogique du system prompt


def test_ai_generated_draft_lesson_is_writable(client_db) -> None:
    """Le cas d'usage : relire le cours d'une leçon IA `draft` AVANT de la valider."""
    _, Session = client_db
    with Session() as db:
        # Passe 2 → leçons IA draft, puis rédaction du cours de la première.
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
            sort_order=0,
            source="manual",
            validation_status="validated",
        )
        db.add(chapter)
        db.commit()
        drafts = generate_lessons(db, FakeLLMProvider(), chapter.id)
        assert drafts[0].status == "draft"

        lesson = generate_lesson_content(db, FakeLLMProvider(), drafts[0].id)

        assert lesson.status == "draft"  # la rédaction ne valide pas la leçon
        assert lesson.content_markdown is not None


def test_generate_content_resets_validated_lesson_to_draft(client_db) -> None:
    """Gate du cours canonique (addendum ADR-0009 §A) : (re)générer le cours d'une leçon
    VALIDÉE la repasse en `draft` — un cours réécrit non relu ne doit plus alimenter les
    dérivés ni Massimo avant revalidation par Papa. (`archived` reste 409, cf. test dédié.)"""
    _, Session = client_db
    with Session() as db:
        lesson_id = _seed_lesson(db, status="validated")
        assert db.get(m.Lesson, lesson_id).status == "validated"

        lesson = generate_lesson_content(db, FakeLLMProvider(), lesson_id)

        assert lesson.status == "draft"
        assert lesson.content_markdown is not None
        assert db.get(m.Lesson, lesson_id).status == "draft"  # persisté en base
