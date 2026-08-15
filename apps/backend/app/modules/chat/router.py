"""Routes élève du chat (ADR-0026, slice A) — `require_child` : Massimo SEUL.

Aucune route parent : Papa ne voit jamais un verbatim (§5, test-verrou). Les surfaces existantes
(Cahier de bord, lacunes, Conseil de classe) remontent l'activité via les `learning_events`, pas
par une route de chat.
"""

from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.ai import get_embedder, get_provider
from app.modules.ai.provider import EmbeddingProvider, LLMProvider
from app.modules.auth.deps import require_child
from app.modules.chat import service
from app.modules.chat.schemas import (
    ChatMessageIn,
    ChatMessageOut,
    ChatSessionOut,
    ChatSpeechIn,
    ChatTranscribeOut,
)
from app.modules.chat.store import ChatStore, get_chat_store
from app.modules.stt import get_stt
from app.modules.stt.provider import SttProvider
from app.modules.tts import get_tts
from app.modules.tts.provider import TtsProvider

student_router = APIRouter(prefix="/api/student/chat", tags=["chat"])


@student_router.post("/sessions", response_model=ChatSessionOut)
def create_session(
    db: Session = Depends(get_db),
    store: ChatStore = Depends(get_chat_store),
    embedder: EmbeddingProvider = Depends(get_embedder),
    _: dict = Depends(require_child),
) -> ChatSessionOut:
    # L'embedder sert à rejouer `resolve_skill` sur les `notion_requests` triées : sans `skill_id`
    # sur la table, c'est la SEULE façon de vérifier qu'une notion est vraiment entrée au
    # programme plutôt que de croire son statut (addendum ADR-0026 §3).
    return service.open_session(db, store, embedder)


@student_router.post("/sessions/{session_id}/messages", response_model=ChatMessageOut)
def post_message(
    session_id: str,
    body: ChatMessageIn,
    db: Session = Depends(get_db),
    store: ChatStore = Depends(get_chat_store),
    provider: LLMProvider = Depends(get_provider),
    embedder: EmbeddingProvider = Depends(get_embedder),
    _: dict = Depends(require_child),
) -> ChatMessageOut:
    return service.handle_message(
        db, store, provider, embedder, session_id=session_id, body=body
    )


@student_router.post("/tts")
def synthesize(
    body: ChatSpeechIn,
    tts: TtsProvider = Depends(get_tts),
    _: dict = Depends(require_child),
) -> Response:
    # Voix de ZETIS (Lot 2) : synthèse LOCALE à la volée, jamais persistée. 503 si le moteur
    # est absent → le client dégrade vers le karaoké muet (Lot 1). WAV renvoyé tel quel.
    wav = service.synthesize_speech(tts, body.text)
    return Response(content=wav, media_type="audio/wav")


@student_router.post("/transcribe", response_model=ChatTranscribeOut)
def transcribe(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    stt: SttProvider = Depends(get_stt),
    _: dict = Depends(require_child),
) -> dict:
    """Dictée du chat — sa PROPRE route, et pas celle d'ELI5 (`adr-0059` §18).

    Jusqu'au 2026-08-15, `ChatPage` appelait `/api/ai/eli5/transcribe`. Ça marchait, et c'était
    faux pour deux raisons :

    1. **La trace ne savait pas d'où elle venait.** ELI5, l'atelier des fiches et le chat
       écrivaient le même `job_type` : impossible de distinguer, dans les 78 lignes mesurées le
       2026-08-15, ce qui relevait du chat. Un `job_type` propre rend la surface lisible — et
       c'est ce qui permettra un jour de mesurer la dictée du chat pour elle-même.
    2. **La porte était celle d'un autre.** Une dépendance qui ment sur ce qu'elle est finit par
       être modifiée pour l'autre appelant ; c'est le motif qui a justifié l'extraction du module
       `stt` lui-même le 2026-08-13.

    ⚠️ `require_child`, comme toutes les routes de ce module : **aucune route de chat hors de la
    portée élève** (`adr-0026` §5, test-verrou `test_no_chat_route_outside_student_scope`). La
    route ELI5, elle, se contente de `get_current_user` — la copier aurait ouvert la dictée du
    chat à Papa.

    Le corps est le module `stt` partagé, inchangé : **il ne persiste plus aucun transcript, pour
    aucun appelant**. Le 503 sur moteur absent est conservé tel quel — le front masque le micro.
    """
    return service.transcribe_utterance(db, stt, file)


@student_router.post("/sessions/{session_id}/close", status_code=status.HTTP_204_NO_CONTENT)
def close_session(
    session_id: str,
    db: Session = Depends(get_db),
    store: ChatStore = Depends(get_chat_store),
    _: dict = Depends(require_child),
) -> Response:
    service.close_session(db, store, session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
