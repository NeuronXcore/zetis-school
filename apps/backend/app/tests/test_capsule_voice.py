"""Tests de la narration vocale (Piper mocké par FakeTtsProvider ; pas de binaire piper).

Couvre : la voix pilote la durée (durationInFrames ≥ durée audio), audioUrl renseigné, trace
ai_jobs, garde Papa sur POST /voice, et la route audio (200 avec token, 401 sans).
`FakeLLMProvider` renvoie déjà une capsule avec `narration` sur chaque scène."""

import copy

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.core.config import settings
from app.db.models import AIJob, Capsule
from app.modules.capsules import service
from app.tests.fakes import FakeLLMProvider, FakeTtsProvider


def test_voice_drives_duration_and_sets_audio_url(client_db, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "audio_storage_dir", str(tmp_path))
    _, Session = client_db
    with Session() as db:
        cap = service.create_capsule(db, FakeLLMProvider(), subject_id=1, instruction="Explique.")
        orig0 = cap.spec_json["scenes"][0]["durationInFrames"]

        updated = service.synthesize_voice(db, FakeTtsProvider(), cap.id)
        scenes = updated.spec_json["scenes"]
        # Toutes les scènes narrées ont une piste audio et une durée ≥ 60.
        assert all(s["audioUrl"] == f"/api/capsules/{cap.id}/audio/{i}" for i, s in enumerate(scenes))
        assert all(s["durationInFrames"] >= 60 for s in scenes)
        # La 1re scène a été rallongée pour tenir sa narration.
        assert scenes[0]["durationInFrames"] > orig0
        # Fichier écrit + trace ai_jobs.
        assert (tmp_path / "capsules" / str(cap.id) / "scene_0.wav").exists()
        job = db.scalars(select(AIJob).where(AIJob.job_type == "capsule_voice")).one()
        assert job.status == "succeeded"
        assert job.output_json["narrated_scenes"] == len(scenes)


def test_voice_without_any_narration_raises_400(client_db, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "audio_storage_dir", str(tmp_path))
    _, Session = client_db
    with Session() as db:
        cap = service.create_capsule(db, FakeLLMProvider(), subject_id=1, instruction="Explique.")
        spec = copy.deepcopy(cap.spec_json)
        for scene in spec["scenes"]:
            scene["narration"] = None
        cap.spec_json = spec
        db.commit()
        with pytest.raises(HTTPException) as exc:
            service.synthesize_voice(db, FakeTtsProvider(), cap.id)
        assert exc.value.status_code == 400


def test_delete_capsule_removes_audio_files(client_db, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "audio_storage_dir", str(tmp_path))
    _, Session = client_db
    with Session() as db:
        cap = service.create_capsule(db, FakeLLMProvider(), subject_id=1, instruction="Explique.")
        service.synthesize_voice(db, FakeTtsProvider(), cap.id)
        audio_dir = tmp_path / "capsules" / str(cap.id)
        assert (audio_dir / "scene_0.wav").exists()

        service.delete_capsule(db, cap.id)
        assert not audio_dir.exists()  # dossier audio nettoyé à la suppression


def test_voice_endpoint_is_papa_only(client_db) -> None:
    client, _ = client_db  # utilisateur « child » par défaut
    assert client.post("/api/capsules/1/voice").status_code == 403


def test_voice_endpoint_and_audio_route_for_papa(client_db, tmp_path, monkeypatch, poster_et_executer) -> None:
    monkeypatch.setattr(settings, "audio_storage_dir", str(tmp_path))
    from app.main import app
    from app.modules.auth.deps import get_current_user

    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}
    client, TestSession = client_db

    # ⚠️ `202` sur les deux routes depuis l'ADR-0041 §4. La voix est le seul travail migré qui
    # n'appelle pas le LLM : son exécutant construit Piper lui-même (le worker n'a aucune
    # dépendance FastAPI), et le fixture le remplace par `FakeTtsProvider`.
    cid = poster_et_executer(
        client,
        TestSession,
        "/api/capsules/generate",
        json={"subject_id": 1, "instruction": "Explique les fractions."},
    )["capsule_id"]

    poster_et_executer(client, TestSession, f"/api/capsules/{cid}/voice")
    spec = client.get(f"/api/capsules/{cid}").json()["spec"]
    assert all(s["audioUrl"] for s in spec["scenes"])

    token = client.post(
        "/api/auth/login", json={"username": "papa", "password": "papa1234"}
    ).json()["access_token"]
    assert client.get(f"/api/capsules/{cid}/audio/0?token={token}").status_code == 200
    assert client.get(f"/api/capsules/{cid}/audio/0").status_code == 401  # sans token
