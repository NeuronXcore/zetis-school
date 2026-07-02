"""Tâche RQ `render_capsule` : orchestration DB + rendu + stockage + trace `ai_jobs`.

Enfilée par le backend via `enqueue("worker_media.jobs.render_capsule", capsule_id)`. Le
backend ne fait que la mettre en file ; tout le travail lourd (Chromium, ffmpeg) vit ici.
"""

from datetime import datetime, timezone

from app.db.base import SessionLocal
from app.db.models import AIJob, Capsule
from app.modules.capsules import service, storage

from .render import render_spec_to_mp4


def render_capsule(capsule_id: int) -> dict:
    """Rend le MP4 d'une capsule, l'envoie au stockage objet et met à jour la DB.

    Retourne un petit dict de résultat (utile aux logs RQ). En cas d'échec, la capsule passe
    en `failed` et l'exception est relancée (RQ marque le job échoué).
    """
    db = SessionLocal()
    now = datetime.now(timezone.utc)
    job = AIJob(
        job_type="capsule_render",
        status="running",
        input_json={"capsule_id": capsule_id},
        created_by="worker-media",
        created_at=now,
        started_at=now,
    )
    db.add(job)
    db.commit()

    try:
        capsule = db.get(Capsule, capsule_id)
        if capsule is None:
            raise ValueError(f"Capsule {capsule_id} introuvable")
        spec = capsule.spec_json if isinstance(capsule.spec_json, dict) else {}

        def audio_reader(i: int) -> bytes | None:
            path = storage.scene_audio_path(capsule_id, i)
            return path.read_bytes() if path.exists() else None

        mp4 = render_spec_to_mp4(spec, audio_reader)
        storage.put_video(capsule_id, mp4)

        # video_url = chemin API relatif (résolu côté front avec token), comme audio_url.
        video_url = f"/api/capsules/{capsule_id}/video"
        service.set_render_status(
            db, capsule_id, render_status="published", video_url=video_url
        )

        job.status = "succeeded"
        job.output_json = {"video_url": video_url, "size_bytes": len(mp4)}
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        return {"capsule_id": capsule_id, "video_url": video_url, "size_bytes": len(mp4)}
    except Exception as exc:  # noqa: BLE001 — on trace, on marque `failed`, puis on relance.
        db.rollback()
        try:
            service.set_render_status(db, capsule_id, render_status="failed")
        except Exception:  # noqa: BLE001 — best-effort : ne masque pas l'erreur d'origine.
            db.rollback()
        job.status = "failed"
        job.error_message = str(exc)[:1000]
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise
    finally:
        db.close()
