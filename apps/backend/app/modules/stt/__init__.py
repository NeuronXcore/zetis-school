from app.core.config import settings
from app.modules.stt.provider import FasterWhisperProvider, SttProvider


def get_stt() -> SttProvider:
    """Dépendance FastAPI : moteur STT local configuré (faster-whisper). 100 % local (ADR-0012).

    Dépendance optionnelle : sans le paquet `faster-whisper`, l'appel lèvera
    `SttUnavailable` à l'usage → l'endpoint répond 503 et le frontend masque le micro.
    """
    if settings.stt_provider in ("faster-whisper", "whisper"):
        return FasterWhisperProvider(
            model=settings.whisper_model,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
        )
    raise NotImplementedError(f"STT_PROVIDER '{settings.stt_provider}' non supporté.")
