"""Tests offline du service de génération de fiche (ADR-0015 ; aucun ollama, aucun pgvector).

Couvre : (a) génération nominale — FicheSpec valide, budgets, `pending`, trace `ai_jobs` ;
(b) une réparation après une sortie invalide ; (c) échec persistant → erreur, rien persisté ;
(d) leçon non validée refusée proprement ; (e) few-shots valides ; (f) invariant vie privée.
"""

import json

import pytest
from sqlalchemy import func, select

from app.db.models import (
    AIJob,
    Chapter,
    Fiche,
    Lesson,
    LessonSkill,
    SchoolYear,
    SchoolYearSubject,
    Skill,
    Subject,
)
from app.modules.ai.canonical_context import CanonicalContext, build_canonical_sections
from app.modules.ai.provider import LLMResponse
from app.modules.fiches import service
from app.modules.fiches.schemas import (
    MAX_DEFINITIONS,
    MAX_ERREURS,
    MAX_POINTS_CLES,
    FicheSpec,
)
from app.prompts import fiche
from app.tests.fakes import FakeEmbeddingProvider, FakeLLMProvider

_VALID_FICHE_JSON = json.dumps(fiche.FEW_SHOTS[0], ensure_ascii=False)
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


def _seed_validated_lesson(db, *, with_skill: bool = True, validated: bool = True,
                           content: str | None = _LESSON_CONTENT) -> Lesson:
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
    if with_skill:
        skill = db.scalar(select(Skill).where(Skill.name == "Nombres relatifs"))
        db.add(LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
    db.commit()
    db.refresh(lesson)
    return lesson


def _jobs(db) -> list[AIJob]:
    return list(db.scalars(select(AIJob).where(AIJob.job_type == "fiche_generate")))


def test_generate_fiche_nominal_pending_budgets_and_trace(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        row = service.generate_fiche(
            db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson.id
        )
        assert row.validation_status == "pending"
        assert row.lesson_id == lesson.id
        assert row.source == "generated"

        spec = FicheSpec.model_validate(row.spec_json)  # conforme au schéma
        assert len(spec.definitions) <= MAX_DEFINITIONS
        assert len(spec.points_cles) <= MAX_POINTS_CLES
        assert len(spec.erreurs_a_eviter) <= MAX_ERREURS
        assert spec.essentiel

        jobs = _jobs(db)
        assert len(jobs) == 1
        assert jobs[0].status == "succeeded"
        assert jobs[0].input_json["prompt_version"] == fiche.FICHE_PROMPT_VERSION
        assert jobs[0].input_json["lesson_id"] == lesson.id


def test_invalid_then_valid_triggers_single_repair(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        llm = _SequenceLLM(["ceci n'est pas du JSON", _VALID_FICHE_JSON])
        row = service.generate_fiche(db, llm, FakeEmbeddingProvider(), lesson_id=lesson.id)
        assert row.validation_status == "pending"
        assert llm.calls == 2  # une génération + exactement une réparation
        assert _jobs(db)[0].status == "succeeded"


def test_persistently_invalid_raises_and_persists_nothing(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        before = db.scalar(select(func.count()).select_from(Fiche))
        # Deux sorties JSON valides mais non conformes (extra="forbid" + champs manquants).
        llm = _SequenceLLM(['{"bad": true}', '{"still": "wrong"}'])
        with pytest.raises(service.FicheGenerationError):
            service.generate_fiche(db, llm, FakeEmbeddingProvider(), lesson_id=lesson.id)
        assert llm.calls == 2  # une réparation tentée, puis abandon
        after = db.scalar(select(func.count()).select_from(Fiche))
        assert after == before  # RIEN persisté
        job = _jobs(db)[0]
        assert job.status == "failed"
        assert job.error_message
        assert job.output_json is None


def test_unvalidated_lesson_refused_no_job_no_fiche(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, validated=False)  # brouillon
        with pytest.raises(Exception) as exc:  # HTTPException 409
            service.generate_fiche(db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson.id)
        assert getattr(exc.value, "status_code", None) == 409
        assert db.scalar(select(func.count()).select_from(Fiche)) == 0
        assert _jobs(db) == []  # la garde tombe AVANT toute trace


def test_validated_lesson_without_course_refused(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db, content=None)  # validée mais sans cours rédigé
        with pytest.raises(Exception) as exc:
            service.generate_fiche(db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson.id)
        assert getattr(exc.value, "status_code", None) == 409


def test_crud_update_regenerate_validate_delete(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        row = service.generate_fiche(
            db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson.id
        )
        fid = row.id
        assert service.validate_fiche(db, fid).validation_status == "validated"
        service.mark_seen(db, 1, fid)  # une vue existe désormais

        spec = FicheSpec.model_validate(row.spec_json)
        assert service.update_fiche_spec(db, fiche_id=fid, spec=spec).validation_status == "pending"
        service.validate_fiche(db, fid)
        assert (
            service.regenerate_fiche(
                db, FakeLLMProvider(), FakeEmbeddingProvider(), fiche_id=fid
            ).validation_status
            == "pending"
        )

        service.delete_fiche(db, fid)  # ne doit pas lever malgré la FicheView liée
        assert db.scalar(select(func.count()).select_from(Fiche)) == 0


def test_pilotage_tree_lists_validated_lessons_with_fiches(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        row = service.generate_fiche(
            db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson.id
        )
        tree = service.pilotage_tree(db, subject_id=1)  # « mathematiques » (conftest)
        assert tree["subject"]["slug"] == "mathematiques"
        assert len(tree["lessons"]) == 1
        node = tree["lessons"][0]
        assert node["lesson_id"] == lesson.id
        assert node["has_content"] is True
        assert [f["id"] for f in node["fiches"]] == [row.id]
        assert node["fiches"][0]["validation_status"] == "pending"


def test_few_shots_are_valid_fichespec() -> None:
    for shot in fiche.FEW_SHOTS:
        FicheSpec.model_validate(shot)  # ne doit pas lever


def test_prompt_derives_from_course_not_from_child(client_db) -> None:
    """Invariant vie privée : la fiche dérive du COURS, aucun champ de Massimo dans le prompt."""
    _, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        sections = build_canonical_sections(CanonicalContext(lesson=lesson, chunks=[]))
        system, prompt = fiche.build_prompt(
            sections=sections, subject="Mathématiques", level="4e",
            chapter="Nombres relatifs", title=lesson.title,
        )
        blob = system + prompt
        assert lesson.content_markdown in prompt  # le cours validé est bien la source
        assert "Massimo" not in blob  # aucune donnée de l'enfant n'entre dans le prompt


# ── Le listing des tuiles porte de quoi RANGER (ADR-0057, slice Fiches) ────────


def test_la_tuile_porte_chapter_id_ET_le_nom_de_la_matiere(client_db) -> None:
    """🔒 VERROU — ce sont les deux champs que la brique de groupement exige.

    🔴 Le NOM du chapitre ne suffit pas : c'est l'`chapter_id` qui groupe. Sans lui, la surface
    rangerait tout sous « Sans chapitre » — et un sabotage l'a prouvé en restant VERT sur les 87
    tests de fiches, le 2026-08-14, tant que ce verrou n'existait pas.
    """
    client, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        db.commit()
        chapter_id, titre = lesson.chapter_id, lesson.title

    r = client.get("/api/student/subjects/mathematiques/fiche-tiles")
    assert r.status_code == 200
    tuile = next(t for t in r.json() if t["title"] == titre)
    assert tuile["chapter_id"] == chapter_id  # l'IDENTIFIANT, pas seulement le nom
    assert tuile["chapter"] == "Nombres relatifs"
    assert tuile["subject"] == "Mathématiques"  # le nom affichable, pour l'étagère
    assert tuile["subject_slug"] == "mathematiques"


def test_l_index_des_tuiles_couvre_TOUTES_les_matieres_dans_l_ordre_du_programme(client_db) -> None:
    """🔒 VERROU — la recherche traverse les matières, donc l'index doit toutes les porter.

    ⚠️ Et l'ORDRE est significatif : matière, puis chapitre (`Chapter.sort_order`), puis leçon.
    C'est la progression de l'année, pas un dictionnaire — la surface s'y appuie pour ranger.
    """
    client, Session = client_db
    with Session() as db:
        lesson = _seed_validated_lesson(db)
        db.commit()
        titre = lesson.title

    index = client.get("/api/student/fiche-tiles").json()
    par_matiere = client.get("/api/student/subjects/mathematiques/fiche-tiles").json()
    # L'index CONTIENT le listing par matière — même filtre, aucune règle neuve.
    assert [t["lesson_id"] for t in par_matiere] == [
        t["lesson_id"] for t in index if t["subject_slug"] == "mathematiques"
    ]
    assert any(t["title"] == titre for t in index)
