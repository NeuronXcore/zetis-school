"""Tâche RQ `render_capsule` : orchestration DB + rendu + stockage + trace `ai_jobs`.

Enfilée par le backend via `enqueue("worker_media.jobs.render_capsule", capsule_id)`. Le
backend ne fait que la mettre en file ; tout le travail lourd (Chromium, ffmpeg) vit ici.
"""

from datetime import datetime, timezone

from app.db.base import SessionLocal
from app.db.models import AIJob, Capsule
from app.modules.capsules import service, storage

from .render import render_spec_to_mp4


def _travail_en_file(db, capsule_id: int) -> AIJob | None:
    """La ligne `queued` que le backend a posée pour CE rendu, s'il y en a une.

    Filtrage en Python sur `input_json` plutôt qu'en SQL : les rendus en attente se comptent sur
    les doigts d'une main (un seul worker média, un seul rendu à la fois), et une requête JSON
    portable entre PostgreSQL et SQLite coûterait plus cher à lire qu'elle ne rapporte.
    """
    from sqlalchemy import select

    for job in db.scalars(
        select(AIJob)
        .where(AIJob.job_type == "capsule_render", AIJob.status == "queued")
        .order_by(AIJob.id.desc())
    ):
        charge = job.input_json if isinstance(job.input_json, dict) else {}
        if charge.get("capsule_id") == capsule_id:
            return job
    return None


def render_capsule(capsule_id: int) -> dict:
    """Rend le MP4 d'une capsule, l'envoie au stockage objet et met à jour la DB.

    Retourne un petit dict de résultat (utile aux logs RQ). En cas d'échec, la capsule passe
    en `failed` et l'exception est relancée (RQ marque le job échoué).
    """
    db = SessionLocal()
    now = datetime.now(timezone.utc)
    # Le backend a posé la ligne EN FILE au moment de l'enfilement (addendum 2 ADR-0041 §22) : on
    # la reprend plutôt que d'en créer une seconde, sinon le même rendu apparaîtrait deux fois
    # dans la barre — une fois en attente pour toujours, une fois en cours.
    #
    # ⚠️ Le repli reste, et il n'est pas décoratif : un rendu enfilé AVANT ce changement, ou relancé
    # à la main depuis RQ, n'a pas de ligne à reprendre. Mieux vaut un travail tracé deux fois
    # qu'un travail qui n'apparaît nulle part.
    job = _travail_en_file(db, capsule_id)
    if job is None:
        job = AIJob(
            job_type="capsule_render",
            status="running",
            input_json={"capsule_id": capsule_id},
            created_by="worker-media",
            created_at=now,
        )
        db.add(job)
    job.status = "running"
    job.started_at = now
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
