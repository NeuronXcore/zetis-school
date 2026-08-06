"""Tests Lot 1 : persistance + CRUD capsules (service direct + garde Papa côté HTTP)."""

import pytest
from fastapi import HTTPException

from app.modules.capsules import service
from app.modules.capsules.schemas import CapsuleSpec
from app.tests.fakes import FakeLLMProvider

# La fixture client_db seede Subject id=1 « Mathématiques » et Skill id=1 « Nombres relatifs ».


def test_create_and_full_crud_flow(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        cap = service.create_capsule(
            db, FakeLLMProvider(), subject_id=1, instruction="Explique les relatifs.", skill_id=1
        )
        assert cap.id is not None
        assert cap.validation_status == "pending"
        assert cap.spec_json["scenes"][0]["kind"] == "title"
        assert cap.title

        # Liste + sérialisation.
        assert any(c.id == cap.id for c in service.list_capsules(db))
        out = service.capsule_out(db, cap)
        assert out["subject"] == "Mathématiques"
        assert out["spec"]["scenes"]
        assert service.capsule_list_item(db, cap)["scenes_count"] == len(cap.spec_json["scenes"])

        # Validation.
        assert service.set_validation(db, cap.id, "validated").validation_status == "validated"
        # Une édition du spec repasse la capsule en pending.
        spec = CapsuleSpec.model_validate(cap.spec_json)
        assert service.update_spec(db, cap.id, spec).validation_status == "pending"
        # Régénération = nouveau spec, statut pending.
        assert (
            service.regenerate_capsule(db, FakeLLMProvider(), cap.id).validation_status == "pending"
        )

        # Suppression.
        service.delete_capsule(db, cap.id)
        with pytest.raises(HTTPException):
            service.get_capsule(db, cap.id)


def test_create_capsule_unknown_subject_raises_404(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        with pytest.raises(HTTPException) as exc:
            service.create_capsule(db, FakeLLMProvider(), subject_id=999, instruction="x test")
        assert exc.value.status_code == 404


def test_set_validation_rejects_bad_status(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        cap = service.create_capsule(db, FakeLLMProvider(), subject_id=1, instruction="Explique.")
        with pytest.raises(HTTPException) as exc:
            service.set_validation(db, cap.id, "nimportequoi")
        assert exc.value.status_code == 400


def test_generate_endpoint_requires_parent(client_db) -> None:
    # La fixture injecte un utilisateur « child » → la route Papa doit répondre 403.
    client, _ = client_db
    r = client.post("/api/capsules/generate", json={"subject_id": 1, "instruction": "Explique."})
    # ⚠️ `202` depuis l'ADR-0041 §4 — la capsule naît dans le worker, pas dans la requête.
    assert r.status_code == 403


def test_generate_endpoint_http_flow_for_papa(client_db, poster_et_executer) -> None:
    from app.main import app
    from app.modules.auth.deps import get_current_user

    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}
    client, TestSession = client_db

    # ⚠️ `202` depuis l'ADR-0041 §4 : la route accepte, le worker produit. On relit ensuite la
    # capsule — le spec et le statut sont donc toujours vérifiés, sur l'état réel de la base.
    cid = poster_et_executer(
        client,
        TestSession,
        "/api/capsules/generate",
        json={"subject_id": 1, "instruction": "Explique les relatifs."},
    )["capsule_id"]
    body = client.get(f"/api/capsules/{cid}").json()
    assert body["validation_status"] == "pending"
    assert body["spec"]["scenes"][0]["kind"] == "title"

    assert any(c["id"] == cid for c in client.get("/api/capsules").json())
    assert client.post(f"/api/capsules/{cid}/validate").json()["validation_status"] == "validated"
    assert client.delete(f"/api/capsules/{cid}").status_code == 204
    assert client.get(f"/api/capsules/{cid}").status_code == 404
