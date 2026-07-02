"""Tests du niveau de difficulté des capsules : persistance à la génération, conservation à la
régénération, et présence dans les payloads (Papa + Massimo)."""

from app.modules.capsules import service
from app.tests.fakes import FakeLLMProvider


def test_create_persists_difficulty_and_exposes_it(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        cap = service.create_capsule(
            db, FakeLLMProvider(), subject_id=1, instruction="Explique.", difficulty="difficile"
        )
        assert cap.difficulty == "difficile"
        assert service.capsule_out(db, cap)["difficulty"] == "difficile"
        assert service.capsule_list_item(db, cap)["difficulty"] == "difficile"


def test_create_defaults_to_moyen(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        cap = service.create_capsule(db, FakeLLMProvider(), subject_id=1, instruction="Explique.")
        assert cap.difficulty == "moyen"


def test_regenerate_keeps_existing_difficulty_when_unset(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        cap = service.create_capsule(
            db, FakeLLMProvider(), subject_id=1, instruction="Explique.", difficulty="facile"
        )
        again = service.regenerate_capsule(db, FakeLLMProvider(), cap.id)  # difficulty=None
        assert again.difficulty == "facile"
        # …mais une valeur explicite l'emporte.
        changed = service.regenerate_capsule(
            db, FakeLLMProvider(), cap.id, difficulty="difficile"
        )
        assert changed.difficulty == "difficile"


def test_public_item_exposes_difficulty(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        cap = service.create_capsule(
            db, FakeLLMProvider(), subject_id=1, instruction="Explique.", difficulty="facile"
        )
        assert service.capsule_public_item(db, cap)["difficulty"] == "facile"
