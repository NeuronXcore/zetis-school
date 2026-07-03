"""Tests offline du service référentiel — passe 1 chapitres (aucun ollama/Anthropic).

Couvre les règles ADR-0009 §3 : génération nominale, réparation puis échec propre,
régénération qui préserve `manual` et `validated`, création manuelle validée d'office,
reorder, invariant vie privée, erreur explicite sans clé API.
"""

import json

import pytest
from fastapi import HTTPException
from sqlalchemy import select

import app.db.models as m
from app.core.config import settings
from app.modules.ai.provider import LLMResponse
from app.modules.curriculum import get_curriculum_provider
from app.modules.curriculum.schemas import GeneratedChapters
from app.modules.curriculum.service import (
    CurriculumGenerationError,
    create_manual_chapter,
    generate_chapters,
    reorder_chapters,
    update_chapter,
)
from app.prompts import curriculum
from app.tests.fakes import _DEFAULT_CURRICULUM, FakeLLMProvider


class _SequenceLLM:
    """Provider de test : renvoie des réponses prédéfinies dans l'ordre (ignore la requête)."""

    def __init__(self, responses: list[str]) -> None:
        self._responses = list(responses)
        self.calls = 0

    def generate(self, request) -> LLMResponse:  # noqa: ANN001 — stub de test
        self.calls += 1
        return LLMResponse(text=self._responses.pop(0), model="seq", duration_ms=1)


def _seed_year_subject(db) -> int:
    """SchoolYear 4e + SchoolYearSubject sur la matière seedée par conftest."""
    profile = db.scalars(select(m.StudentProfile)).first()
    subject = db.scalars(select(m.Subject)).first()
    year = m.SchoolYear(student_id=profile.id, label="2026-2027", level="4e")
    db.add(year)
    db.flush()
    sys_row = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject.id)
    db.add(sys_row)
    db.commit()
    return sys_row.id


def _chapters(db, sys_id: int) -> list[m.Chapter]:
    return list(
        db.scalars(
            select(m.Chapter)
            .where(m.Chapter.school_year_subject_id == sys_id)
            .order_by(m.Chapter.sort_order, m.Chapter.id)
        )
    )


def _jobs(db) -> list[m.AIJob]:
    return list(db.scalars(select(m.AIJob).where(m.AIJob.job_type == "curriculum_chapters")))


def test_few_shots_are_valid_generated_chapters() -> None:
    """Les exemples few-shot du prompt v1 restent conformes au schéma de production."""
    for shot in curriculum.FEW_SHOTS:
        GeneratedChapters.model_validate(shot["output"])


def test_generate_creates_pending_generated_chapters(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        sys_id = _seed_year_subject(db)
        created = generate_chapters(db, FakeLLMProvider(), sys_id)

        assert len(created) == 3
        for chapter in created:
            assert chapter.source == "generated"
            assert chapter.validation_status == "pending"
            assert chapter.program_version == "2020"
            assert chapter.status == "planned"  # progression temporelle intacte

        jobs = _jobs(db)
        assert len(jobs) == 1
        assert jobs[0].status == "succeeded"
        assert jobs[0].input_json["prompt_version"] == curriculum.CURRICULUM_PROMPT_VERSION
        assert jobs[0].input_json["provider"] == "FakeLLMProvider"
        assert jobs[0].output_json["model"] == "fake"
        assert jobs[0].output_json["chapters_count"] == 3


def test_generated_metadata_goes_to_metadata_json_not_description(client_db) -> None:
    """Verrou 13-bis : `description` = texte humain SANS sérialisation ; les métadonnées
    structurées vivent dans `metadata_json` (le bug corrigé ne doit pas revenir)."""
    _, Session = client_db
    with Session() as db:
        sys_id = _seed_year_subject(db)
        created = generate_chapters(db, FakeLLMProvider(), sys_id)

        for chapter, expected in zip(created, _DEFAULT_CURRICULUM["chapters"]):
            # description : jamais de JSON ni de champs sérialisés.
            assert chapter.description == expected["description"]
            for forbidden in ("{", "themes", "suggested_class", "repartition"):
                assert forbidden not in (chapter.description or "")
            # metadata_json : métadonnées complètes + version du prompt.
            assert chapter.metadata_json == {
                "themes": expected["themes"],
                "suggested_class": expected["suggested_class"],
                "repartition": expected["repartition"],
                "prompt_version": curriculum.CURRICULUM_PROMPT_VERSION,
            }


def test_invalid_then_valid_triggers_single_repair(client_db) -> None:
    _, Session = client_db
    valid = json.dumps(_DEFAULT_CURRICULUM, ensure_ascii=False)
    llm = _SequenceLLM(["ceci n'est pas du JSON", valid])
    with Session() as db:
        sys_id = _seed_year_subject(db)
        created = generate_chapters(db, llm, sys_id)
        assert llm.calls == 2
        assert len(created) == 3
        assert _jobs(db)[0].status == "succeeded"


def test_verbose_program_version_triggers_repair_not_truncation(client_db) -> None:
    """`program_version` > 20 chars (vu en réel : "2020 (BO du 30 juillet 2020)" sur SVT)
    dépasse la colonne VARCHAR(20) → doit être rejeté par le schéma et réparé, jamais
    tronqué silencieusement ni envoyé à l'INSERT."""
    _, Session = client_db
    verbose = dict(_DEFAULT_CURRICULUM, program_version="2020 (BO du 30 juillet 2020)")
    llm = _SequenceLLM(
        [json.dumps(verbose, ensure_ascii=False), json.dumps(_DEFAULT_CURRICULUM, ensure_ascii=False)]
    )
    with Session() as db:
        sys_id = _seed_year_subject(db)
        created = generate_chapters(db, llm, sys_id)
        assert llm.calls == 2  # la version verbeuse a déclenché la réparation
        assert all(c.program_version == "2020" for c in created)


def test_persistently_invalid_fails_clean_nothing_persisted(client_db) -> None:
    _, Session = client_db
    llm = _SequenceLLM(['{"bad": true}', '{"still": "wrong"}'])
    with Session() as db:
        sys_id = _seed_year_subject(db)
        with pytest.raises(CurriculumGenerationError):
            generate_chapters(db, llm, sys_id)
        assert llm.calls == 2  # une réparation tentée, puis abandon
        assert _chapters(db, sys_id) == []  # rien d'invalide persisté
        jobs = _jobs(db)
        assert len(jobs) == 1
        assert jobs[0].status == "failed"


def test_regeneration_preserves_manual_and_validated(client_db) -> None:
    """§3 : la régénération ne touche jamais `manual` ni `validated` ; elle remplace
    uniquement les `generated` non validés, et append après l'existant conservé."""
    _, Session = client_db
    with Session() as db:
        sys_id = _seed_year_subject(db)
        manual = m.Chapter(
            school_year_subject_id=sys_id, name="Chapitre manuel de Papa",
            sort_order=0, source="manual", validation_status="validated",
        )
        validated = m.Chapter(
            school_year_subject_id=sys_id, name="Chapitre généré validé",
            sort_order=1, source="generated", validation_status="validated",
        )
        pending = m.Chapter(
            school_year_subject_id=sys_id, name="Chapitre généré pending",
            sort_order=2, source="generated", validation_status="pending",
        )
        db.add_all([manual, validated, pending])
        db.commit()
        kept_ids = {manual.id, validated.id}
        pending_id = pending.id

        created = generate_chapters(db, FakeLLMProvider(), sys_id)

        remaining = _chapters(db, sys_id)
        remaining_ids = {c.id for c in remaining}
        assert kept_ids <= remaining_ids  # manuel + validé intacts
        assert pending_id not in remaining_ids  # le pending généré est remplacé
        assert len(remaining) == 2 + len(created)
        # Append : les nouveaux arrivent après l'existant conservé (sort_order 1 = max).
        assert min(c.sort_order for c in created) == 2


def test_prompt_injects_kept_chapters_without_duplicating(client_db) -> None:
    """Les intitulés conservés sont bien injectés dans le prompt de génération."""
    system, prompt = curriculum.build_chapters_prompt(
        "Mathématiques", "4e", "cycle 4", "2020", ["Chapitre manuel de Papa"]
    )
    assert "Chapitre manuel de Papa" in prompt
    assert "dupliquer" in prompt or "dupliquer" in system


def test_manual_creation_is_validated_by_default(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        sys_id = _seed_year_subject(db)
        chapter = create_manual_chapter(db, sys_id, name="Les fractions")
        assert chapter.source == "manual"
        assert chapter.validation_status == "validated"
        assert chapter.sort_order == 0
        assert chapter.metadata_json is None  # sans métadonnées fournies → null (13-bis)


def test_manual_creation_with_optional_metadata(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        sys_id = _seed_year_subject(db)
        chapter = create_manual_chapter(
            db, sys_id, name="Les fractions", themes=["Nombres et calculs"],
            suggested_class="5e", repartition="officielle",
        )
        assert chapter.metadata_json == {
            "themes": ["Nombres et calculs"],
            "suggested_class": "5e",
            "repartition": "officielle",
        }


def test_update_chapter_validate_and_reject(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        sys_id = _seed_year_subject(db)
        created = generate_chapters(db, FakeLLMProvider(), sys_id)
        chapter = update_chapter(db, created[0].id, validation_action="validate")
        assert chapter.validation_status == "validated"
        chapter = update_chapter(db, created[1].id, name="Renommé", validation_action="reject")
        assert chapter.validation_status == "rejected"
        assert chapter.name == "Renommé"
        assert chapter.status == "planned"  # la progression temporelle ne bouge pas


def test_reorder_chapters(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        sys_id = _seed_year_subject(db)
        created = generate_chapters(db, FakeLLMProvider(), sys_id)
        ids = [c.id for c in created]
        reordered = reorder_chapters(db, sys_id, list(reversed(ids)))
        assert [c.id for c in reordered] == list(reversed(ids))
        assert [c.sort_order for c in reordered] == [0, 1, 2]
        # Liste incomplète ou étrangère → 400, rien ne change.
        with pytest.raises(HTTPException) as exc:
            reorder_chapters(db, sys_id, ids[:1])
        assert exc.value.status_code == 400


def test_privacy_invariant_no_student_data_in_prompt(client_db) -> None:
    """ADR-0009 addendum, condition 1 : aucune donnée de Massimo dans system+prompt."""
    _, Session = client_db
    with Session() as db:
        profile = db.scalars(select(m.StudentProfile)).first()
        user = db.scalars(select(m.User)).first()
        student_fields = [profile.first_name, user.name, user.email]

    system, prompt = curriculum.build_chapters_prompt(
        "Mathématiques", "4e", "cycle 4", "2020", ["Théorème de Pythagore"]
    )
    haystack = f"{system}\n{prompt}"
    for value in student_fields:
        assert value, "champ élève vide : le test perdrait son sens"
        assert value not in haystack


def test_missing_api_key_raises_explicit_error(monkeypatch) -> None:
    """Condition 4 : sans clé, erreur explicite mentionnant le repli — pas de bascule."""
    monkeypatch.setattr(settings, "curriculum_llm_provider", "anthropic")
    monkeypatch.setattr(settings, "anthropic_api_key", None)
    with pytest.raises(HTTPException) as exc:
        get_curriculum_provider()
    assert exc.value.status_code == 503
    assert "ANTHROPIC_API_KEY" in exc.value.detail
    assert "CURRICULUM_LLM_PROVIDER=ollama" in exc.value.detail


def test_explicit_local_fallback_resolves_ollama(monkeypatch) -> None:
    from app.modules.ai.ollama_provider import OllamaProvider

    monkeypatch.setattr(settings, "curriculum_llm_provider", "ollama")
    assert isinstance(get_curriculum_provider(), OllamaProvider)


def test_anthropic_resolved_when_key_present(monkeypatch) -> None:
    from app.modules.ai.anthropic_provider import AnthropicProvider

    monkeypatch.setattr(settings, "curriculum_llm_provider", "anthropic")
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-ant-test")
    provider = get_curriculum_provider()
    assert isinstance(provider, AnthropicProvider)
    assert provider.model == settings.anthropic_model
