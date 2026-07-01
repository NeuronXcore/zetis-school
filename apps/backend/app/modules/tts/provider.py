"""Abstraction TTS (synthèse vocale) — miroir de LLMProvider/EmbeddingProvider.

Implémentation locale via Piper (privé, offline). Le provider appelle le binaire `piper`
en sous-processus (aucun `import piper` : pas de dépendance Python à l'import) et renvoie le
WAV + sa durée. La durée sert à caler la scène (« la voix pilote la durée », ADR-0007).
"""

import io
import os
import subprocess
import tempfile
import wave
from dataclasses import dataclass
from typing import Protocol


@dataclass
class TtsRequest:
    text: str


@dataclass
class TtsResponse:
    audio_wav: bytes
    duration_seconds: float


class TtsProvider(Protocol):
    """Abstraction TTS (un seul provider à cette étape : Piper local)."""

    def synthesize(self, request: TtsRequest) -> TtsResponse:
        ...


def wav_duration_seconds(wav_bytes: bytes) -> float:
    """Durée d'un WAV en secondes (module stdlib `wave`, pas de dépendance externe)."""
    with wave.open(io.BytesIO(wav_bytes), "rb") as w:
        rate = w.getframerate() or 1
        return w.getnframes() / rate


class PiperProvider:
    """Synthèse locale via le binaire Piper (neural). `voice_model` = chemin d'un .onnx FR.
    `length_scale` > 1 ralentit la diction (ton plus posé, rassurant)."""

    def __init__(
        self,
        binary: str,
        voice_model: str,
        length_scale: float = 1.0,
        speaker: int | None = None,
        timeout: float = 60.0,
    ) -> None:
        self.binary = binary
        self.voice_model = voice_model
        self.length_scale = length_scale
        self.speaker = speaker  # index de locuteur pour un modèle multi-voix (ex. upmc : pierre=1)
        self.timeout = timeout

    def synthesize(self, request: TtsRequest) -> TtsResponse:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            out_path = tmp.name
        try:
            cmd = [self.binary, "--model", self.voice_model, "--output_file", out_path]
            if self.length_scale and self.length_scale != 1.0:
                cmd += ["--length-scale", str(self.length_scale)]
            if self.speaker is not None:
                cmd += ["-s", str(self.speaker)]
            proc = subprocess.run(
                cmd,
                input=request.text.encode("utf-8"),
                capture_output=True,
                timeout=self.timeout,
            )
            if proc.returncode != 0:
                detail = proc.stderr.decode("utf-8", "replace")[:300]
                raise RuntimeError(f"piper a échoué (code {proc.returncode}) : {detail}")
            with open(out_path, "rb") as f:
                audio = f.read()
            return TtsResponse(audio_wav=audio, duration_seconds=wav_duration_seconds(audio))
        finally:
            try:
                os.unlink(out_path)
            except OSError:
                pass


class SayProvider:
    """TTS macOS via la commande `say` (dev local : aucun modèle à télécharger). `voice` = une
    voix française installée (ex. 'Jacques', 'Amelie'). N'est PAS un choix de production."""

    def __init__(
        self, voice: str | None = None, rate: int | None = None, timeout: float = 60.0
    ) -> None:
        self.voice = voice
        self.rate = rate  # mots/minute ; plus bas = diction plus lente et posée
        self.timeout = timeout

    def synthesize(self, request: TtsRequest) -> TtsResponse:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            out_path = tmp.name
        try:
            cmd = ["say", "-o", out_path, "--data-format=LEI16@22050"]
            if self.voice:
                cmd += ["-v", self.voice]
            if self.rate:
                cmd += ["-r", str(self.rate)]
            cmd.append(request.text)
            proc = subprocess.run(cmd, capture_output=True, timeout=self.timeout)
            if proc.returncode != 0:
                detail = proc.stderr.decode("utf-8", "replace")[:300]
                raise RuntimeError(f"say a échoué (code {proc.returncode}) : {detail}")
            with open(out_path, "rb") as f:
                audio = f.read()
            return TtsResponse(audio_wav=audio, duration_seconds=wav_duration_seconds(audio))
        finally:
            try:
                os.unlink(out_path)
            except OSError:
                pass
