"""Transcrire un audio téléversé — **neutre, sans domaine** (ADR-0012).

Ce corps vivait dans `eli5/service.transcribe`, où il était générique **à un détail près** : le
`job_type` codé en dur. La dictée de l'atelier des fiches (addendum ADR-0015, slice 2) en a besoin
à l'identique, et la faire appeler une route ELI5 aurait fait mentir la dépendance sur ce qu'elle
est. Extrait ici le 2026-08-13, à comportement constant.

Ce que ce module garantit, quel que soit l'appelant :

- 🔴 **rien de durable côté serveur — et depuis l'`adr-0059` §18, c'est enfin VRAI.** Cette
  docstring l'affirmait déjà, et la ligne juste en dessous écrivait `output_json = {"transcript":
  …}`. Mesure du 2026-08-15 : **78 lignes `ai_jobs` portant les mots de Massimo**, du 2026-07-04
  au 2026-08-14, dont 33 phrases réelles. Le verrou de l'`adr-0026` §1c ne les voyait pas — il
  filtrait `job_type == "chat_turn"`, et la fuite passait par `eli5_transcribe`.
  **La trace ne porte plus que des métadonnées** : type MIME, taille, durée de l'audio, temps de
  traitement. Le transcript est rendu à l'appelant et n'est écrit nulle part.
  ⚠️ **Universel, et non réservé au chat.** L'ADR ne l'exigeait que des surfaces de chat, mais
  c'est la même voix du même enfant qui dicte dans ELI5 et dans l'atelier des fiches — et les 78
  lignes mesurées mélangent les trois sans qu'on puisse les distinguer. Le faire au cas par cas
  aurait demandé un second paramètre de domaine, ce que le contrat ci-dessous interdit.
  Vérifié avant de couper : **aucun lecteur**, ni backend, ni front, ni test.
- **une trace `ai_jobs` par appel**, comme toute tâche IA du dépôt — c'est ce qui rend la dictée
  auditable au même titre que le reste ;
- 🔴 **`duration_ms` mesure le TRAITEMENT**, comme partout ailleurs dans le dépôt
  (`ollama_provider.py`, `mlx_provider.py`, `anthropic_provider.py` : un `time.monotonic()`
  écoulé). Il portait jusqu'ici la durée de l'**audio** — une phrase de 3 s transcrite en 6 s
  s'enregistrait à `3000`. **Le seul instrument disponible pour chiffrer le coût du STT mesurait
  donc autre chose que son nom**, et toute optimisation « mesurée » sur cette colonne aurait été
  fausse (`adr-0059` §6). La durée de l'audio reste disponible, dans `output_json`, où elle est
  une métadonnée légitime ;
- **une dégradation propre** : `SttUnavailable` → **503**, et le frontend masque le micro. Jamais
  de bascule vers une API vocale tierce — les données vocales de Massimo ne sortent pas de la
  machine (`CLAUDE.md` § sécurité, ADR-0012).
"""

import time
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

    debut = time.monotonic()
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

    traitement_ms = int((time.monotonic() - debut) * 1000)

    transcript = result.text.strip()
    job.status = "succeeded"
    # ⚠️ **Le transcript n'entre PAS ici** — cf. le premier point de la docstring. `output_json` ne
    # porte que des métadonnées : la durée de l'audio (utile pour rapporter le temps de traitement
    # à la longueur de ce qui a été dit) et rien d'autre.
    job.output_json = {"audio_seconds": result.duration_seconds}
    job.duration_ms = traitement_ms
    job.finished_at = datetime.now(timezone.utc)
    db.commit()
    return {"transcript": transcript, "duration_seconds": result.duration_seconds}


def _echec(db: Session, job: AIJob, exc: Exception) -> None:
    """Un échec se TRACE avant de remonter : une dictée qui rate en silence n'existe pas."""
    job.status = "failed"
    job.error_message = str(exc)[:1000]
    job.finished_at = datetime.now(timezone.utc)
    db.commit()
