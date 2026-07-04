"""Tests du wrapper RQ `generate_lesson_cards` (délégation pure, sans DB ni LLM)."""

import pytest

from app.modules.memory import generation
from worker_ai.jobs import generate_lesson_cards


def test_delegates_to_backend_and_shapes_result(monkeypatch):
    seen = {}

    def fake_run(lesson_id: int) -> dict:
        seen["lesson_id"] = lesson_id
        return {"created": 2, "updated": 1, "reactivated": 0, "pending": 0}

    monkeypatch.setattr(generation, "run_lesson_card_generation", fake_run)

    result = generate_lesson_cards(42)
    assert seen["lesson_id"] == 42
    assert result == {"lesson_id": 42, "created": 2, "updated": 1, "reactivated": 0, "pending": 0}


def test_exception_propagates_for_rq_failure(monkeypatch):
    def boom(lesson_id: int) -> dict:
        raise RuntimeError("Ollama indisponible")

    monkeypatch.setattr(generation, "run_lesson_card_generation", boom)

    with pytest.raises(RuntimeError):
        generate_lesson_cards(1)
