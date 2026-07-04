"""Abstraction STT (speech-to-text) — miroir de TtsProvider (ADR-0012).

Implémentation locale via faster-whisper (CTranslate2) : 100 % local, aucun tiers
(vie privée de Massimo). Le modèle est téléchargé une fois puis mis en cache ;
l'inférence n'appelle AUCUN service externe.

Dépendance OPTIONNELLE : `faster-whisper` n'est importé qu'à l'usage (pas à l'import
du module). Sans le paquet — ou si le modèle est introuvable — `transcribe` lève
`SttUnavailable`, que l'endpoint mappe en 503 : le frontend masque alors le micro
(dégradation propre, comme la dérogation Anthropic « sans clé »).
"""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from typing import Protocol


@dataclass
class SttRequest:
    audio: bytes
    mime: str | None = None  # ex. "audio/webm" ; indicatif (le décodage est automatique)


@dataclass
class SttResponse:
    text: str
    duration_seconds: float


class SttUnavailable(RuntimeError):
    """Moteur STT indisponible (dépendance absente / modèle introuvable) → 503, pas 502."""


class SttProvider(Protocol):
    """Abstraction STT (un seul provider à cette étape : faster-whisper local)."""

    def transcribe(self, request: SttRequest) -> SttResponse:
        ...


# Modèle faster-whisper chargé paresseusement et mémoïsé (coûteux : à ne charger qu'une fois
# par process, pas à chaque requête).
_MODELS: dict[tuple[str, str, str], object] = {}


def _load_model(model: str, device: str, compute_type: str) -> object:
    key = (model, device, compute_type)
    cached = _MODELS.get(key)
    if cached is not None:
        return cached
    try:
        from faster_whisper import WhisperModel  # import optionnel, à l'usage
    except ImportError as exc:  # dépendance non installée
        raise SttUnavailable(
            "faster-whisper n'est pas installé (pip install -e '.[stt]')."
        ) from exc
    try:
        engine = WhisperModel(model, device=device, compute_type=compute_type)
    except Exception as exc:  # noqa: BLE001 — modèle introuvable / device indisponible
        raise SttUnavailable(f"Modèle Whisper indisponible : {exc}") from exc
    _MODELS[key] = engine
    return engine


def _suffix_for(mime: str | None) -> str:
    """Extension de fichier temporaire selon le MIME (aide le décodeur à choisir le démux)."""
    if not mime:
        return ".bin"
    if "webm" in mime:
        return ".webm"
    if "ogg" in mime or "opus" in mime:
        return ".ogg"
    if "wav" in mime:
        return ".wav"
    if "mp4" in mime or "m4a" in mime or "aac" in mime:
        return ".mp4"
    if "mpeg" in mime or "mp3" in mime:
        return ".mp3"
    return ".bin"


class FasterWhisperProvider:
    """STT local via faster-whisper. `model` = taille ('base'/'small'/…). `language` fixé au
    français (élève francophone). `device`/`compute_type` réglés pour CPU / Apple Silicon."""

    def __init__(
        self,
        model: str = "small",
        device: str = "cpu",
        compute_type: str = "int8",
        language: str = "fr",
    ) -> None:
        self.model = model
        self.device = device
        self.compute_type = compute_type
        self.language = language

    def transcribe(self, request: SttRequest) -> SttResponse:
        if not request.audio:
            raise ValueError("Audio vide.")
        engine = _load_model(self.model, self.device, self.compute_type)
        # faster-whisper décode via PyAV (ffmpeg embarqué) : on écrit l'audio brut dans un
        # fichier temporaire et on lui passe le chemin (robuste pour WebM/Opus, MP4, WAV…).
        with tempfile.NamedTemporaryFile(suffix=_suffix_for(request.mime), delete=False) as tmp:
            tmp.write(request.audio)
            path = tmp.name
        try:
            # vad_filter=False : le VAD Silero jugeait « pas de parole » sur l'audio réel
            # (Opus micro, plus faible que la voix `say`) et jetait TOUT → transcript vide.
            # Pour une dictée courte, on transcrit tout : plus robuste qu'un pré-filtre agressif.
            segments, info = engine.transcribe(path, language=self.language, vad_filter=False)
            text = " ".join(seg.text.strip() for seg in segments).strip()
            duration = float(getattr(info, "duration", 0.0) or 0.0)
            return SttResponse(text=text, duration_seconds=duration)
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass
