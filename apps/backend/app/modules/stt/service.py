"""Transcrire un audio téléversé — **neutre, sans domaine** (ADR-0012).

Ce corps vivait dans `eli5/service.transcribe`, où il était générique **à un détail près** : le
`job_type` codé en dur. La dictée de l'atelier des fiches (addendum ADR-0015, slice 2) en a besoin
à l'identique, et la faire appeler une route ELI5 aurait fait mentir la dépendance sur ce qu'elle
est. Extrait ici le 2026-08-13, à comportement constant.

Ce que ce module garantit, quel que soit l'appelant :

- **rien de durable côté serveur** : l'audio brut n'est jamais conservé, seule la transcription
  et sa durée entrent dans la trace ;
- **une trace `ai_jobs` par appel**, comme toute tâche IA du dépôt — c'est ce qui rend la dictée
  auditable au même titre que le reste ;
- **une dégradation propre** : `SttUnavailable` → **503**, et le frontend masque le micro. Jamais
  de bascule vers une API vocale tierce — les données vocales de Massimo ne sortent pas de la
  machine (`CLAUDE.md` § sécurité, ADR-0012).
"""

from datetime import datetime, timezone

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.db.models import AIJob
from app.modules.stt.provider import SttProvider, SttRequest, SttUnavailable

# 25 Mo — largement au-dessus d'une dictée d'enfant, assez bas pour qu'un téléversement accidentel
# ne traverse pas le modèle.
MAX_AUDIO_BYTES = 25 * 1024 * 1024


def transcribe_upload(
    db: Session,
    stt: SttProvider,
    file: UploadFile,
    *,
    job_type: str,
    created_by: str = "child",
) -> dict:
    """Transcrit un audio téléversé et trace l'appel. `job_type` dit QUI a demandé.

    ⚠️ `job_type` est le **seul** paramètre de domaine : tout le reste est identique d'un
    appelant à l'autre. S'il devait s'en ajouter un second, c'est que la fonction aurait cessé
    d'être neutre — et il faudrait alors se demander pourquoi.
    """
    raw = file.file.read()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Audio vide.")
    if len(raw) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Dictée trop longue.",
        )

    now = datetime.now(timezone.utc)
    job = AIJob(
        job_type=job_type,
        status="running",
        input_json={"content_type": file.content_type, "bytes": len(raw)},
        created_by=created_by,
        created_at=now,
        started_at=now,
    )
    db.add(job)
    db.flush()

    try:
        result = stt.transcribe(SttRequest(audio=raw, mime=file.content_type))
    except SttUnavailable as exc:
        _echec(db, job, exc)
        # Dégradation propre : le frontend masque le micro sur 503 (jamais de bascule tierce).
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Dictée indisponible : {exc}",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        _echec(db, job, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Transcription échouée : {exc}"
        ) from exc

    transcript = result.text.strip()
    job.status = "succeeded"
    job.output_json = {"transcript": transcript, "duration_seconds": result.duration_seconds}
    job.duration_ms = int(result.duration_seconds * 1000)
    job.finished_at = datetime.now(timezone.utc)
    db.commit()
    return {"transcript": transcript, "duration_seconds": result.duration_seconds}


def _echec(db: Session, job: AIJob, exc: Exception) -> None:
    """Un échec se TRACE avant de remonter : une dictée qui rate en silence n'existe pas."""
    job.status = "failed"
    job.error_message = str(exc)[:1000]
    job.finished_at = datetime.now(timezone.utc)
    db.commit()
