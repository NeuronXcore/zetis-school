"""Tests offline du prompt capsule : les few-shots ne dérivent pas du schéma, et
`build_prompt` produit bien un couple (system, prompt) contenant les exemples."""

import json

import pytest
from pydantic import ValidationError

from app.modules.capsules.schemas import CapsuleSpec
from app.prompts import capsule


def test_few_shots_are_valid_capsule_specs() -> None:
    assert len(capsule.FEW_SHOTS) >= 2
    for shot in capsule.FEW_SHOTS:
        # Ne doit pas lever : garantit que le prompt reste aligné sur CapsuleSpec.
        CapsuleSpec.model_validate(shot["spec"])


def test_few_shots_cover_numberline_and_non_math() -> None:
    kinds_per_shot = [
        {s["kind"] for s in shot["spec"]["scenes"]} for shot in capsule.FEW_SHOTS
    ]
    # Au moins un exemple avec numberline, au moins un sans (numberline est optionnel).
    assert any("numberline" in kinds for kinds in kinds_per_shot)
    assert any("numberline" not in kinds for kinds in kinds_per_shot)


def test_build_prompt_returns_two_non_empty_strings_with_examples() -> None:
    system, prompt = capsule.build_prompt(
        "Explique les fractions.", "Mathématiques", "6e", skill="Fractions"
    )
    assert isinstance(system, str) and system.strip()
    assert isinstance(prompt, str) and prompt.strip()
    # L'instruction cible figure dans le prompt.
    assert "Explique les fractions." in prompt
    # Les few-shots sont intégrés, sérialisés exactement comme la sortie attendue.
    for shot in capsule.FEW_SHOTS:
        assert json.dumps(shot["spec"], ensure_ascii=False, indent=2) in prompt


def test_build_prompt_injects_visual_and_duration_hints() -> None:
    _, prompt = capsule.build_prompt(
        "Explique.", "Mathématiques", "6e", visual="barmodel", duration="courte"
    )
    assert "barmodel" in prompt
    assert "COURTE" in prompt
    # « auto » n'ajoute pas de contrainte visuelle.
    _, plain = capsule.build_prompt("Explique.", "Mathématiques", "6e", visual="auto")
    assert "Contrainte visuelle" not in plain


def test_build_prompt_injects_difficulty_and_1min_hints() -> None:
    _, prompt = capsule.build_prompt(
        "Explique.", "Mathématiques", "6e", duration="1min", difficulty="difficile"
    )
    assert "1 minute" in prompt  # durée ~1 min
    assert "DIFFICILE" in prompt  # niveau de difficulté
    # Défaut « moyen » : un hint de difficulté est injecté.
    _, plain = capsule.build_prompt("Explique.", "Mathématiques", "6e")
    assert "NIVEAU DE DIFFICULTÉ = MOYEN" in plain


def test_new_visual_hints_present_and_injected() -> None:
    for key in ("geometry", "steps", "timeline", "diagram"):
        assert key in capsule.VISUAL_HINTS
    _, prompt = capsule.build_prompt("Explique Pythagore.", "Mathématiques", "4e", visual="geometry")
    assert "geometry" in prompt


def test_barmodel_scene_validation() -> None:
    base = {
        "title": "T",
        "subject": "Mathématiques",
        "level": "6e",
        "fps": 30,
        "width": 1280,
        "height": 720,
        "scenes": [
            {"kind": "title", "title": "T", "durationInFrames": 90},
            {"kind": "barmodel", "parts": 4, "filled": 3, "durationInFrames": 120},
            {"kind": "definition", "term": "x", "body": "y", "durationInFrames": 90},
            {"kind": "title", "title": "Bravo", "durationInFrames": 75},
        ],
    }
    CapsuleSpec.model_validate(base)  # valide

    bad = {**base, "scenes": list(base["scenes"])}
    bad["scenes"][1] = {"kind": "barmodel", "parts": 4, "filled": 9, "durationInFrames": 120}
    with pytest.raises(ValidationError):
        CapsuleSpec.model_validate(bad)  # filled > parts
