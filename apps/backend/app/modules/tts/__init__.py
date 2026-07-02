from app.core.config import settings
from app.modules.tts.provider import PiperProvider, SayProvider, TtsProvider


def get_tts() -> TtsProvider:
    """Dépendance FastAPI : fournit le moteur TTS configuré. 'piper' = défaut/production ;
    'macos' = commande `say` (dev local Mac, sans modèle à télécharger)."""
    if settings.tts_provider == "piper":
        return PiperProvider(
            binary=settings.piper_binary,
            voice_model=settings.piper_voice_model,
            length_scale=settings.piper_length_scale,
            speaker=settings.piper_speaker,
        )
    if settings.tts_provider == "macos":
        return SayProvider(voice=settings.say_voice or None, rate=settings.say_rate or None)
    raise NotImplementedError(f"TTS_PROVIDER '{settings.tts_provider}' non supporté.")
