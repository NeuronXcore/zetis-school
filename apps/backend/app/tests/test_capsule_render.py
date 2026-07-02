"""Tests du rendu MP4 (Lot 2) : préconditions de `request_render`, stockage vidéo disque,
`list_published`, et les routes Massimo (bibliothèque + stream vidéo).

Le rendu Node lui-même (Chromium/ffmpeg) n'est PAS exécuté ici : on teste la logique métier
backend qui l'entoure. La file RQ est mockée (aucune connexion Redis)."""

import pytest
from fastapi import HTTPException

import app.core.queue as queue_mod
from app.core.config import settings
from app.modules.capsules import service, storage
from app.tests.fakes import FakeLLMProvider, FakeTtsProvider


def _new_capsule(db):
    return service.create_capsule(db, FakeLLMProvider(), subject_id=1, instruction="Explique.")


def test_request_render_requires_validated(client_db, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "audio_storage_dir", str(tmp_path))
    _, Session = client_db
    with Session() as db:
        cap = _new_capsule(db)
        service.synthesize_voice(db, FakeTtsProvider(), cap.id)  # voix OK mais non validée
        with pytest.raises(HTTPException) as exc:
            service.request_render(db, cap.id)
        assert exc.value.status_code == 400


def test_request_render_requires_audio(client_db, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "audio_storage_dir", str(tmp_path))
    _, Session = client_db
    with Session() as db:
        cap = _new_capsule(db)
        service.set_validation(db, cap.id, "validated")  # validée mais sans voix
        with pytest.raises(HTTPException) as exc:
            service.request_render(db, cap.id)
        assert exc.value.status_code == 400


def test_request_render_enqueues_and_sets_rendering(client_db, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "audio_storage_dir", str(tmp_path))
    calls: list[int] = []
    monkeypatch.setattr(queue_mod, "enqueue_render", lambda cid: (calls.append(cid), "job-1")[1])
    _, Session = client_db
    with Session() as db:
        cap = _new_capsule(db)
        service.synthesize_voice(db, FakeTtsProvider(), cap.id)
        service.set_validation(db, cap.id, "validated")
        out = service.request_render(db, cap.id)
        assert out.status == "rendering"
        assert out.video_url is None
        assert calls == [cap.id]


def test_validate_auto_enqueues_render_when_voiced(client_db, tmp_path, monkeypatch) -> None:
    """Rendu auto à la validation : valider une capsule dont la voix est faite enfile le rendu
    et la passe en `rendering` — sans clic « Rendre » manuel."""
    monkeypatch.setattr(settings, "audio_storage_dir", str(tmp_path))
    calls: list[int] = []
    monkeypatch.setattr(queue_mod, "enqueue_render", lambda cid: (calls.append(cid), "job-1")[1])
    _, Session = client_db
    with Session() as db:
        cap = _new_capsule(db)
        service.synthesize_voice(db, FakeTtsProvider(), cap.id)
        out = service.validate_capsule(db, cap.id)
        assert out.validation_status == "validated"
        assert out.status == "rendering"
        assert calls == [cap.id]


def test_validate_without_voice_stays_validated_no_render(client_db, tmp_path, monkeypatch) -> None:
    """Sans voix synthétisée : la validation réussit mais aucun rendu n'est enfilé."""
    monkeypatch.setattr(settings, "audio_storage_dir", str(tmp_path))
    calls: list[int] = []
    monkeypatch.setattr(queue_mod, "enqueue_render", lambda cid: (calls.append(cid), "job-1")[1])
    _, Session = client_db
    with Session() as db:
        cap = _new_capsule(db)
        out = service.validate_capsule(db, cap.id)
        assert out.validation_status == "validated"
        assert out.status == "draft"
        assert calls == []


def test_validate_render_enqueue_failure_keeps_validated(client_db, tmp_path, monkeypatch) -> None:
    """Robustesse : si l'enfilement casse (Redis KO), la capsule reste validée et NON bloquée
    en « rendering » — elle retombe en `draft` pour un rendu manuel ultérieur."""
    monkeypatch.setattr(settings, "audio_storage_dir", str(tmp_path))

    def _boom(_cid):
        raise RuntimeError("redis indisponible")

    monkeypatch.setattr(queue_mod, "enqueue_render", _boom)
    _, Session = client_db
    with Session() as db:
        cap = _new_capsule(db)
        service.synthesize_voice(db, FakeTtsProvider(), cap.id)
        out = service.validate_capsule(db, cap.id)
        assert out.validation_status == "validated"
        assert out.status == "draft"
        assert out.video_url is None


def test_video_storage_disk_roundtrip(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "storage_backend", "disk")
    monkeypatch.setattr(settings, "audio_storage_dir", str(tmp_path))
    storage.video_backend.cache_clear()
    try:
        assert storage.read_video(42) is None
        storage.put_video(42, b"\x00\x01MP4")
        assert storage.read_video(42) == b"\x00\x01MP4"
        storage.delete_capsule_video(42)
        assert storage.read_video(42) is None
    finally:
        storage.video_backend.cache_clear()


def test_list_published_filters_validated_with_video(client_db, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "audio_storage_dir", str(tmp_path))
    _, Session = client_db
    with Session() as db:
        rendered = _new_capsule(db)
        no_video = _new_capsule(db)
        service.set_validation(db, rendered.id, "validated")
        service.set_render_status(
            db, rendered.id, render_status="published", video_url=f"/api/capsules/{rendered.id}/video"
        )
        service.set_validation(db, no_video.id, "validated")  # validée mais pas de MP4

        ids = [c.id for c in service.list_published(db)]
        assert rendered.id in ids
        assert no_video.id not in ids


def test_massimo_library_and_video_stream(client_db, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "audio_storage_dir", str(tmp_path))
    monkeypatch.setattr(settings, "storage_backend", "disk")
    # Valider enfile désormais le rendu (rendu auto) : on mocke la file (aucun Redis en test).
    monkeypatch.setattr(queue_mod, "enqueue_render", lambda cid: "job-auto")
    storage.video_backend.cache_clear()

    from app.main import app
    from app.modules.auth.deps import get_current_user

    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}
    client, Session = client_db
    try:
        cid = client.post(
            "/api/capsules/generate", json={"subject_id": 1, "instruction": "Explique."}
        ).json()["id"]
        client.post(f"/api/capsules/{cid}/voice")
        client.post(f"/api/capsules/{cid}/validate")

        # Simule le worker : MP4 déposé + capsule publiée.
        with Session() as db:
            storage.put_video(cid, b"MP4DATA")
            service.set_render_status(
                db, cid, render_status="published", video_url=f"/api/capsules/{cid}/video"
            )

        lib = client.get("/api/capsules/library")
        assert lib.status_code == 200
        assert any(item["id"] == cid for item in lib.json())

        # <video> : 401 sans token, 200 + octets avec token JWT valide.
        assert client.get(f"/api/capsules/{cid}/video").status_code == 401
        token = client.post(
            "/api/auth/login", json={"username": "papa", "password": "papa1234"}
        ).json()["access_token"]
        rv = client.get(f"/api/capsules/{cid}/video?token={token}")
        assert rv.status_code == 200
        assert rv.content == b"MP4DATA"
    finally:
        storage.video_backend.cache_clear()
