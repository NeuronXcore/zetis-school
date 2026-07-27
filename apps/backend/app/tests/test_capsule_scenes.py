"""Validation des 4 nouveaux types de scène (geometry, steps, timeline, diagram).

Chaque scène est validée au sein d'un `CapsuleSpec` complet (1re scène = title). Cas valides
acceptés, cas mal formés rejetés — gabarit `test_barmodel_scene_validation`."""

import pytest
from pydantic import ValidationError

from app.modules.capsules.schemas import CapsuleSpec


def _spec(second_scene: dict) -> dict:
    return {
        "title": "T",
        "subject": "Mathématiques",
        "level": "4e",
        "fps": 30,
        "width": 1280,
        "height": 720,
        "scenes": [
            {"kind": "title", "title": "T", "durationInFrames": 90},
            second_scene,
            {"kind": "definition", "term": "x", "body": "y", "durationInFrames": 90},
            {"kind": "title", "title": "Bravo", "durationInFrames": 75},
        ],
    }


def test_geometry_scene_ok_and_bad_shape() -> None:
    CapsuleSpec.model_validate(
        _spec(
            {
                "kind": "geometry",
                "shape": "right_triangle",
                "labels": {"a": "3", "b": "4", "c": "?"},
                "durationInFrames": 120,
            }
        )
    )
    with pytest.raises(ValidationError):
        CapsuleSpec.model_validate(
            _spec({"kind": "geometry", "shape": "hexagon", "durationInFrames": 120})
        )


def test_steps_scene_ok_and_too_few() -> None:
    CapsuleSpec.model_validate(
        _spec({"kind": "steps", "steps": ["Poser", "Calculer", "Vérifier"], "durationInFrames": 120})
    )
    with pytest.raises(ValidationError):  # < 2 étapes
        CapsuleSpec.model_validate(
            _spec({"kind": "steps", "steps": ["Seule"], "durationInFrames": 120})
        )


def test_timeline_scene_ok_and_empty() -> None:
    CapsuleSpec.model_validate(
        _spec(
            {
                "kind": "timeline",
                "events": [{"date": "1789", "label": "Révolution"}, {"date": "1804", "label": "Empire"}],
                "durationInFrames": 120,
            }
        )
    )
    with pytest.raises(ValidationError):  # events vide
        CapsuleSpec.model_validate(
            _spec({"kind": "timeline", "events": [], "durationInFrames": 120})
        )


def test_diagram_scene_ok_and_too_few_labels() -> None:
    CapsuleSpec.model_validate(
        _spec(
            {
                "kind": "diagram",
                "center": "Cellule",
                "labels": ["Noyau", "Membrane", "Cytoplasme"],
                "durationInFrames": 120,
            }
        )
    )
    with pytest.raises(ValidationError):  # < 2 annotations
        CapsuleSpec.model_validate(
            _spec({"kind": "diagram", "center": "Cellule", "labels": ["Noyau"], "durationInFrames": 120})
        )


def test_unknown_extra_field_rejected() -> None:
    with pytest.raises(ValidationError):  # extra="forbid"
        CapsuleSpec.model_validate(
            _spec({"kind": "steps", "steps": ["A", "B"], "bogus": 1, "durationInFrames": 120})
        )
