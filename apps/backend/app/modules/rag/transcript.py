"""Extraction de transcription vidéo (zetis-clip Lot 2, étape 20).

Réintroduit un fetch sortant côté serveur — borné par une **allowlist d'hôtes**
(exception documentée dans ADR-0006, addendum étape 20). Toute URL hors allowlist,
non-http(s) ou avec un identifiant vidéo introuvable → `ValueError` (→ `400`).

Le récupérateur de transcription est abstrait derrière `TranscriptFetcher` pour des
tests offline déterministes (cf. `FakeTranscriptFetcher`), comme `LLMProvider`."""

import re
from typing import Protocol
from urllib.parse import parse_qs, urlparse

# Décision verrouillée (prompt étape 20) : YouTube uniquement pour le Lot 2.
ALLOWED_HOSTS = frozenset({"youtube.com", "www.youtube.com", "youtu.be"})

# Un id vidéo YouTube fait 11 caractères ; on reste tolérant mais borné.
_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,20}$")


class TranscriptError(Exception):
    """Transcription indisponible / désactivée pour cette vidéo (→ `400`, repli client)."""


def validate_video_url(url: str) -> str:
    """Valide/normalise l'URL et renvoie l'identifiant vidéo.

    Rejette : schéma non http(s), IP littérale ou hôte hors allowlist, id absent.
    Lève `ValueError` (message explicite) — jamais de fetch avant cette validation."""
    parsed = urlparse((url or "").strip())
    if parsed.scheme not in ("http", "https"):
        raise ValueError("URL invalide : seul http(s) est accepté.")

    host = (parsed.hostname or "").lower()
    if host not in ALLOWED_HOSTS:
        allowed = ", ".join(sorted(ALLOWED_HOSTS))
        raise ValueError(
            f"Hôte non autorisé : '{host or url}'. Plateformes acceptées : {allowed}."
        )

    video_id = _extract_video_id(host, parsed.path, parsed.query)
    if not _VIDEO_ID_RE.match(video_id):
        raise ValueError("Identifiant vidéo introuvable dans l'URL.")
    return video_id


def _extract_video_id(host: str, path: str, query: str) -> str:
    if host == "youtu.be":
        return path.lstrip("/").split("/", 1)[0]
    # youtube.com : /watch?v=…, /shorts/…, /embed/…
    v = parse_qs(query).get("v", [""])[0]
    if v:
        return v
    for prefix in ("/shorts/", "/embed/", "/live/"):
        if path.startswith(prefix):
            return path[len(prefix) :].split("/", 1)[0]
    return ""


class TranscriptFetcher(Protocol):
    """Récupérateur de transcription (abstraction mockable)."""

    def fetch(self, video_id: str) -> tuple[str, str]:
        """Renvoie `(texte joint, code langue d'origine)`. Lève `TranscriptError`
        si aucune transcription n'est disponible. Ne traduit jamais."""
        ...


class YouTubeTranscriptFetcher:
    """Implémentation réelle via `youtube-transcript-api`.

    Import paresseux (comme pypdf dans `extract.py`) : l'app démarre et les tests
    tournent sans la lib installée (les tests passent par `FakeTranscriptFetcher`).
    Préfère une transcription rédigée par un humain à une auto-générée, et conserve
    la langue d'origine (Massimo a Anglais/Espagnol en matières)."""

    def fetch(self, video_id: str) -> tuple[str, str]:
        try:
            from youtube_transcript_api import YouTubeTranscriptApi
        except ImportError as exc:  # pragma: no cover - dépend de l'install
            raise TranscriptError(
                "Dépendance 'youtube-transcript-api' absente côté serveur."
            ) from exc

        try:
            listing = _list_transcripts(YouTubeTranscriptApi, video_id)
            transcript = _pick_transcript(listing)
            segments = transcript.fetch()
            language = getattr(transcript, "language_code", "") or ""
        except TranscriptError:
            raise
        except Exception as exc:  # transcript désactivé, vidéo indispo, réseau…
            raise TranscriptError(str(exc) or "Transcription introuvable.") from exc

        text = _join_segments(segments)
        if not text:
            raise TranscriptError("Transcription vide.")
        return text, language


def _list_transcripts(api_cls: object, video_id: str) -> object:
    """Liste les transcriptions disponibles, quelle que soit la version de la lib.

    0.6.x : classmethod `YouTubeTranscriptApi.list_transcripts(video_id)`.
    1.x    : méthode d'instance `YouTubeTranscriptApi().list(video_id)`."""
    if hasattr(api_cls, "list_transcripts"):
        return api_cls.list_transcripts(video_id)  # type: ignore[attr-defined]
    return api_cls().list(video_id)  # type: ignore[operator]


def _pick_transcript(listing: object):
    """Préfère une transcription humaine (non auto-générée), sinon la première dispo.
    Ne force aucune langue : on garde celle de la vidéo."""
    manual, generated = [], []
    for t in listing:  # le listing est itérable (Transcript objects)
        (generated if getattr(t, "is_generated", False) else manual).append(t)
    if manual:
        return manual[0]
    if generated:
        return generated[0]
    raise TranscriptError("Aucune transcription disponible.")


def _join_segments(segments: object) -> str:
    """Concatène les segments en texte propre. Tolère l'API 0.6.x (dicts) et 1.x
    (objets à attribut `.text`)."""
    parts: list[str] = []
    for seg in segments:  # type: ignore[attr-defined]
        piece = getattr(seg, "text", None)
        if piece is None and isinstance(seg, dict):
            piece = seg.get("text")
        if piece:
            parts.append(str(piece).strip())
    return " ".join(p for p in parts if p).strip()


def get_transcript_fetcher() -> TranscriptFetcher:
    """Dépendance FastAPI : récupérateur de transcription (réel = YouTube)."""
    return YouTubeTranscriptFetcher()
