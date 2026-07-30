"""Routes élève du chat (ADR-0026, slice A) — `require_child` : Massimo SEUL.

Aucune route parent : Papa ne voit jamais un verbatim (§5, test-verrou). Les surfaces existantes
(Cahier de bord, lacunes, Conseil de classe) remontent l'activité via les `learning_events`, pas
par une route de chat.
"""

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.ai import get_embedder, get_provider
from app.modules.ai.provider import EmbeddingProvider, LLMProvider
from app.modules.auth.deps import require_child
from app.modules.chat import service
from app.modules.chat.schemas import ChatMessageIn, ChatMessageOut, ChatSessionOut, ChatSpeechIn
from app.modules.chat.store import ChatStore, get_chat_store
from app.modules.tts import get_tts
from app.modules.tts.provider import TtsProvider

student_router = APIRouter(prefix="/api/student/chat", tags=["chat"])


@student_router.post("/sessions", response_model=ChatSessionOut)
def create_session(
    db: Session = Depends(get_db),
    store: ChatStore = Depends(get_chat_store),
    _: dict = Depends(require_child),
) -> ChatSessionOut:
    return service.open_session(db, store)


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


@student_router.post("/sessions/{session_id}/close", status_code=status.HTTP_204_NO_CONTENT)
def close_session(
    session_id: str,
    db: Session = Depends(get_db),
    store: ChatStore = Depends(get_chat_store),
    _: dict = Depends(require_child),
) -> Response:
    service.close_session(db, store, session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
