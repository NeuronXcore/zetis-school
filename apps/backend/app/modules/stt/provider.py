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

    def warmup(self) -> None:
        """Charge le modèle MAINTENANT plutôt qu'à la première dictée (`adr-0059` §5.4).

        `_load_model` est mémoïsé, mais **paresseux** : sans ce geste, c'est Massimo qui paie le
        chargement du modèle `small` — plusieurs secondes — la première fois qu'il appuie sur le
        micro après un démarrage. Le coût ne disparaît pas, il se déplace hors de l'usage.

        ⚠️ **Ne lève jamais.** Un warm-up est une optimisation, pas une précondition : sans
        `faster-whisper` installé, le serveur doit démarrer exactement comme avant et l'endpoint
        rendre son 503 au premier appel (dégradation propre, `adr-0012`). Faire échouer le
        démarrage rendrait TOUT ZETIS indisponible parce que la dictée l'est.

        ⚠️ Chaque worker paie le sien : le cache est un dict de PROCESSUS. Sous plusieurs workers
        uvicorn, le gain n'est acquis que si chacun exécute son démarrage.
        """
        try:
            _load_model(self.model, self.device, self.compute_type)
        except SttUnavailable:
            pass

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
            #
            # **Décodage GLOUTON** (`adr-0059` §5.3). Jusqu'au 2026-08-15, aucun paramètre de
            # décodage n'était passé : faster-whisper appliquait donc son défaut, **beam search à
            # 5** — cinq hypothèses menées de front sur chaque énoncé.
            #
            # 🔴 **MESURE du 2026-08-15, et elle dément la prévision.** Sur cette machine, énoncé
            # de 4,3 s, modèle `small`/int8/CPU, meilleur de 3 passes :
            #     beam=5 (défaut) → 1,23 s     beam=1 (ici) → 1,00 s
            # Soit **~20 %, pas « 2 à 3 fois »** comme l'annonçait le cadrage. La transcription
            # est **identique au mot près**. Le gain est réel et gratuit, mais il est petit : le
            # goulot de la chaîne est ailleurs (le moteur de génération, mesuré à **9,4 s** sur le
            # même tour). Écrit ici pour que personne ne rouvre ce réglage en espérant y trouver
            # des secondes qui n'y sont pas.
            #
            # ⚠️ Si la qualité se dégrade à l'oreille sur de vraies phrases de Massimo — jamais
            # sur une voix de synthèse, qui articule trop bien pour être un test — le repli est
            # `beam_size=2`, pas le retour à 5.
            #
            # `condition_on_previous_text=False` : le conditionnement sur le texte précédent n'a
            # aucun sens sur un énoncé ISOLÉ (chaque dictée est indépendante) et il est une source
            # connue de dérive — le modèle prolonge un contexte qui n'existe pas.
            #
            # `without_timestamps=True` : personne ne lit les bornes de segments ici. On ne les
            # fait pas calculer. (Le jour où le karaoké voudra des bornes de MOTS réelles, ce sera
            # `word_timestamps`, une autre option — et ce sera un choix, pas un défaut subi.)
            segments, info = engine.transcribe(
                path,
                language=self.language,
                vad_filter=False,
                beam_size=1,
                condition_on_previous_text=False,
                without_timestamps=True,
            )
            text = " ".join(seg.text.strip() for seg in segments).strip()
            duration = float(getattr(info, "duration", 0.0) or 0.0)
            return SttResponse(text=text, duration_seconds=duration)
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass
