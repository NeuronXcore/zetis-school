"""Routes HTTP capsules — Lot 1 (ADR-0007), Papa uniquement.

Génération + persistance + CRUD + validation. Pas de rendu MP4 ici (Lot 2) : l'aperçu se
fait côté front via `@remotion/player` à partir du `spec_json` renvoyé.
"""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.ai import get_provider
from app.modules.ai.provider import LLMProvider
from app.modules.auth.deps import require_parent
from app.modules.auth.service import decode_token
from app.modules.capsules import service, storage
from app.modules.capsules.schemas import (
    CapsuleCreateRequest,
    CapsuleListItem,
    CapsuleOut,
    CapsuleRegenerateRequest,
    CapsuleUpdateSpecRequest,
)
from app.modules.tts import get_tts
from app.modules.tts.provider import TtsProvider

_PARENT_ROLES = {"papa", "parent", "admin"}

router = APIRouter(prefix="/api/capsules", tags=["capsules"], dependencies=[Depends(require_parent)])


@router.post("/generate", response_model=CapsuleOut, status_code=status.HTTP_201_CREATED)
def generate(
    req: CapsuleCreateRequest,
    db: Session = Depends(get_db),
    provider: LLMProvider = Depends(get_provider),
) -> dict:
    """Papa : génère un CapsuleSpec et persiste la capsule (statut `pending`)."""
    try:
        capsule = service.create_capsule(
            db,
            provider,
            req.subject_id,
            req.instruction,
            level=req.level,
            skill_id=req.skill_id,
            visual=req.visual,
            duration=req.duration,
        )
    except service.CapsuleGenerationError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=f"Génération échouée : {exc}") from exc
    return service.capsule_out(db, capsule)


@router.get("", response_model=list[CapsuleListItem])
def list_all(db: Session = Depends(get_db)) -> list[dict]:
    return [service.capsule_list_item(db, c) for c in service.list_capsules(db)]


@router.get("/{capsule_id}", response_model=CapsuleOut)
def get_one(capsule_id: int, db: Session = Depends(get_db)) -> dict:
    return service.capsule_out(db, service.get_capsule(db, capsule_id))


@router.put("/{capsule_id}/spec", response_model=CapsuleOut)
def update_spec(
    capsule_id: int, req: CapsuleUpdateSpecRequest, db: Session = Depends(get_db)
) -> dict:
    """Remplace le spec (revalidé par le schéma) ; la capsule repasse en `pending`."""
    return service.capsule_out(db, service.update_spec(db, capsule_id, req.spec))


@router.post("/{capsule_id}/regenerate", response_model=CapsuleOut)
def regenerate(
    capsule_id: int,
    req: CapsuleRegenerateRequest,
    db: Session = Depends(get_db),
    provider: LLMProvider = Depends(get_provider),
) -> dict:
    try:
        capsule = service.regenerate_capsule(
            db,
            provider,
            capsule_id,
            instruction=req.instruction,
            visual=req.visual,
            duration=req.duration,
        )
    except service.CapsuleGenerationError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=f"Régénération échouée : {exc}") from exc
    return service.capsule_out(db, capsule)


@router.post("/{capsule_id}/voice", response_model=CapsuleOut)
def voice(
    capsule_id: int,
    db: Session = Depends(get_db),
    tts: TtsProvider = Depends(get_tts),
) -> dict:
    """Papa : synthétise la voix (Piper) et cale les durées sur la narration."""
    try:
        capsule = service.synthesize_voice(db, tts, capsule_id)
    except service.CapsuleGenerationError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return service.capsule_out(db, capsule)


@router.post("/{capsule_id}/validate", response_model=CapsuleOut)
def validate(capsule_id: int, db: Session = Depends(get_db)) -> dict:
    return service.capsule_out(db, service.set_validation(db, capsule_id, "validated"))


@router.post("/{capsule_id}/reject", response_model=CapsuleOut)
def reject(capsule_id: int, db: Session = Depends(get_db)) -> dict:
    return service.capsule_out(db, service.set_validation(db, capsule_id, "rejected"))


@router.delete("/{capsule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(capsule_id: int, db: Session = Depends(get_db)) -> Response:
    service.delete_capsule(db, capsule_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Router SÉPARÉ (sans require_parent) : une balise <audio> ne peut pas envoyer d'en-tête
# Authorization en cross-origin. L'accès Papa est vérifié via le JWT en query `?token=`.
audio_router = APIRouter(prefix="/api/capsules", tags=["capsules-audio"])


@audio_router.get("/{capsule_id}/audio/{scene_index}")
def get_audio(capsule_id: int, scene_index: int, token: str | None = None) -> FileResponse:
    """Sert le WAV d'une scène. Papa-only via JWT en query param."""
    user = decode_token(token) if token else None
    if user is None or user.get("role") not in _PARENT_ROLES:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Token invalide ou absent.")
    path = storage.scene_audio_path(capsule_id, scene_index)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Audio introuvable.")
    return FileResponse(path, media_type="audio/wav")
