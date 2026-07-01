"""Tests offline du service de génération de capsule (aucun ollama).

Couvre : (a) sortie valide + trace ai_jobs succeeded ; (b) une réparation après une sortie
invalide ; (c) échec persistant → erreur levée, job failed, aucun spec renvoyé."""

import json

import pytest
from sqlalchemy import select

from app.db.models import AIJob
from app.modules.ai.provider import LLMResponse
from app.modules.capsules.schemas import CapsuleSpec
from app.modules.capsules.service import CapsuleGenerationError, generate_capsule_spec
from app.prompts import capsule
from app.tests.fakes import FakeLLMProvider

# Un CapsuleSpec valide, réutilisé comme réponse « corrigée » des stubs séquentiels.
_VALID_CAPSULE_JSON = json.dumps(capsule.FEW_SHOTS[0]["spec"], ensure_ascii=False)


class _SequenceLLM:
    """Provider de test : renvoie des réponses prédéfinies dans l'ordre (ignore la requête)."""

    def __init__(self, responses: list[str]) -> None:
        self._responses = list(responses)
        self.calls = 0

    def generate(self, request) -> LLMResponse:  # noqa: ANN001 — stub de test
        self.calls += 1
        return LLMResponse(text=self._responses.pop(0), model="seq", duration_ms=1)


def _jobs(db) -> list[AIJob]:
    return list(db.scalars(select(AIJob).where(AIJob.job_type == "capsule_generate")))


def test_fake_provider_yields_valid_spec_and_writes_job(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        spec = generate_capsule_spec(
            db,
            FakeLLMProvider(),
            "Explique les nombres relatifs.",
            "Mathématiques",
            "4e",
            skill="Nombres relatifs",
        )
        assert isinstance(spec, CapsuleSpec)
        assert spec.scenes[0].kind == "title"

        jobs = _jobs(db)
        assert len(jobs) == 1
        assert jobs[0].status == "succeeded"
        assert jobs[0].input_json["prompt_version"] == capsule.CAPSULE_PROMPT_VERSION
        assert jobs[0].output_json["scenes_count"] == len(spec.scenes)


def test_invalid_then_valid_triggers_single_repair(client_db) -> None:
    _, Session = client_db
    llm = _SequenceLLM(["ceci n'est pas du JSON", _VALID_CAPSULE_JSON])
    with Session() as db:
        spec = generate_capsule_spec(db, llm, "Explique.", "Mathématiques", "4e")
        assert isinstance(spec, CapsuleSpec)
        # Une génération + exactement une réparation.
        assert llm.calls == 2
        jobs = _jobs(db)
        assert len(jobs) == 1
        assert jobs[0].status == "succeeded"


def test_persistently_invalid_raises_and_marks_job_failed(client_db) -> None:
    _, Session = client_db
    # Deux sorties valides en JSON mais non conformes au schéma (extra="forbid" + champs manquants).
    llm = _SequenceLLM(['{"bad": true}', '{"still": "wrong"}'])
    with Session() as db:
        with pytest.raises(CapsuleGenerationError):
            generate_capsule_spec(db, llm, "Explique.", "Mathématiques", "4e")
        # Une réparation tentée, puis abandon.
        assert llm.calls == 2
        jobs = _jobs(db)
        assert len(jobs) == 1
        assert jobs[0].status == "failed"
        assert jobs[0].error_message
        assert jobs[0].output_json is None  # aucun spec persisté
