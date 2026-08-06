from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.db.models import AIJob
from app.modules.ai import travaux
from app.modules.auth.deps import get_current_user
from app.modules.tts import get_tts
from app.modules.tts.provider import TtsProvider, TtsRequest

router = APIRouter(prefix="/api/ai", tags=["ai"])


class JobOut(BaseModel):
    id: int
    job_type: str
    status: str
    output: dict | None = None
    duration_ms: int | None = None
    # ⚠️ Ajouté par l'ADR-0041 §3 : un job `failed` était jusqu'ici **MUET** côté client — le
    # motif existait en base et ne sortait jamais. Une barre qui dit « échec » sans dire pourquoi
    # oblige à ouvrir les logs du serveur.
    error: str | None = None
    # ⚠️ L'instant de DÉMARRAGE, et il n'est pas un ornement (ADR-0041 §9) : c'est lui qui ancre
    # l'estimation des barres locales. Sans lui, elles mesurent l'âge de leur AFFICHAGE et
    # repartent de zéro à chaque montage — et deux surfaces qui estiment chacune de leur côté
    # finissent par se contredire, ce qui est très exactement le défaut que ce chantier ferme.
    started_at: datetime | None = None
    # 🔴 **La durée attendue vient du SERVEUR** (ADR-0041 §9). C'est ce champ qui tue les
    # vingt-trois constantes des composants Papa : la barre locale d'un écran n'a plus rien à
    # deviner, elle lit. Et la valeur est la **médiane des exécutions réussies** de ce `job_type` —
    # une mesure, là où les constantes qu'elle remplace étaient des devinettes divergentes (cinq
    # durées pour un même cours). Voir `ai/travaux.py`.
    estimated_ms: int | None = None


@router.get("/jobs/{job_id}", response_model=JobOut)
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> JobOut:
    job = db.get(AIJob, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job IA introuvable")
    return JobOut(
        id=job.id,
        job_type=job.job_type,
        status=job.status,
        output=job.output_json,
        duration_ms=job.duration_ms,
        error=job.error_message,
        started_at=job.started_at,
        estimated_ms=travaux.estimation_ms(travaux.estimations(db), job.job_type),
    )


class TtsSpeakRequest(BaseModel):
    text: str


@router.post("/tts")
def tts(
    req: TtsSpeakRequest,
    engine: TtsProvider = Depends(get_tts),
    _: dict = Depends(get_current_user),
) -> Response:
    """Voix de ZETIS pour l'UI (ex. « Massimo, je prépare ton ELI5 »).

    Utilise le MÊME moteur TTS que la narration des capsules (ADR-0007) → une seule
    voix ZETIS partout. Voix indisponible (binaire/modèle absent) → 503 : le frontend
    dégrade en silence (aucune bascule vers une voix tierce).
    """
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Texte vide.")
    try:
        audio = engine.synthesize(TtsRequest(text=text))
    except Exception as exc:  # noqa: BLE001 — binaire piper absent / échec synthèse
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Voix indisponible : {exc}"
        ) from exc
    return Response(content=audio.audio_wav, media_type="audio/wav")
