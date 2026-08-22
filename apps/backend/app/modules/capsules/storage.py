"""Stockage des médias de capsule.

- **Audio** (pistes voix Piper, Lot 1) : sur disque sous
  `settings.audio_storage_dir/capsules/{id}/scene_{i}.wav`. Inchangé au Lot 2.
- **Vidéo** (MP4 rendu, Lot 2) : derrière une petite interface `VideoBackend`. `minio` en
  cible (partagé backend ↔ worker-media), `disk` en fallback dev. Choix via
  `settings.storage_backend` (`disk` | `minio`).

Le contenu de `storage/` est gitignoré (cf. CLAUDE.md §sécurité).
"""

import io
import shutil
from functools import lru_cache
from pathlib import Path
from typing import Protocol

from app.core.config import settings

# ---------------------------------------------------------------------------
# Audio (Lot 1) — disque, inchangé.
# ---------------------------------------------------------------------------


def _capsule_dir(capsule_id: int) -> Path:
    return Path(settings.audio_storage_dir) / "capsules" / str(capsule_id)


def scene_audio_path(capsule_id: int, scene_index: int) -> Path:
    return _capsule_dir(capsule_id) / f"scene_{scene_index}.wav"


def write_scene_audio(capsule_id: int, scene_index: int, wav_bytes: bytes) -> Path:
    path = scene_audio_path(capsule_id, scene_index)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(wav_bytes)
    return path


def delete_capsule_audio(capsule_id: int) -> None:
    """Supprime le dossier audio d'une capsule (best-effort, ignore s'il n'existe pas)."""
    shutil.rmtree(_capsule_dir(capsule_id), ignore_errors=True)


# ---------------------------------------------------------------------------
# Vidéo (Lot 2) — interface + backends disque / MinIO.
# ---------------------------------------------------------------------------


class VideoBackend(Protocol):
    """Contrat minimal de stockage du MP4 d'une capsule (clé = capsule_id)."""

    def ensure_ready(self) -> None: ...
    def put_video(self, capsule_id: int, data: bytes) -> None: ...
    def read_video(self, capsule_id: int) -> bytes | None: ...
    def delete_video(self, capsule_id: int) -> None: ...
    #: Le poids total des vidéos de CE backend (ADR-0069 §2), ou `None` s'il est injoignable —
    #: c'est le backend qui sait se mesurer, l'appelant n'a pas à connaître son stockage.
    def taille_videos(self) -> int | None: ...


class DiskVideoBackend:
    """Fallback dev : MP4 sur disque à côté de l'audio."""

    def _path(self, capsule_id: int) -> Path:
        return _capsule_dir(capsule_id) / "video.mp4"

    def ensure_ready(self) -> None:  # rien à préparer côté disque
        return None

    def put_video(self, capsule_id: int, data: bytes) -> None:
        path = self._path(capsule_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def read_video(self, capsule_id: int) -> bytes | None:
        path = self._path(capsule_id)
        return path.read_bytes() if path.exists() else None

    def delete_video(self, capsule_id: int) -> None:
        self._path(capsule_id).unlink(missing_ok=True)

    def taille_videos(self) -> int | None:
        """⚠️ Ces octets vivent DANS `audio_storage_dir` — qui les compte déjà.

        `occupation._medias()` ne s'en sert donc pas sous `disk` : les additionner doublerait
        chaque MP4. La méthode existe pour que le contrat du Protocol tienne, et pour qu'un
        appelant qui veut la vidéo SEULE puisse la demander.
        """
        total = 0
        for chemin in (Path(settings.audio_storage_dir) / "capsules").glob("*/video.mp4"):
            try:
                total += chemin.stat().st_size
            except OSError:
                continue
        return total


class MinioVideoBackend:
    """Cible prod : MP4 dans un bucket MinIO, partagé par le backend et worker-media."""

    def __init__(self) -> None:
        from minio import Minio  # import paresseux : inutile si backend=disk

        self._client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
        self._bucket = settings.minio_bucket_capsules

    def _key(self, capsule_id: int) -> str:
        return f"capsules/{capsule_id}/video.mp4"

    def ensure_ready(self) -> None:
        if not self._client.bucket_exists(self._bucket):
            self._client.make_bucket(self._bucket)

    def put_video(self, capsule_id: int, data: bytes) -> None:
        self.ensure_ready()
        self._client.put_object(
            self._bucket,
            self._key(capsule_id),
            io.BytesIO(data),
            length=len(data),
            content_type="video/mp4",
        )

    def read_video(self, capsule_id: int) -> bytes | None:
        from minio.error import S3Error

        try:
            resp = self._client.get_object(self._bucket, self._key(capsule_id))
        except S3Error:
            return None
        try:
            return resp.read()
        finally:
            resp.close()
            resp.release_conn()

    def delete_video(self, capsule_id: int) -> None:
        from minio.error import S3Error

        try:
            self._client.remove_object(self._bucket, self._key(capsule_id))
        except S3Error:
            pass

    def taille_videos(self) -> int | None:
        """Le poids du bucket. Bucket absent ⇒ **0** (rien n'y a jamais été écrit) ; MinIO
        injoignable ⇒ **`None`** — « je ne sais pas » n'est pas « c'est vide », et c'est
        exactement la confusion qui a fait diagnostiquer une perte de contenu le 2026-08-18."""
        try:
            if not self._client.bucket_exists(self._bucket):
                return 0
            return sum(
                objet.size or 0
                for objet in self._client.list_objects(self._bucket, recursive=True)
            )
        except Exception:  # noqa: BLE001 — réseau, credentials, S3Error : tous « non mesurable »
            return None


@lru_cache(maxsize=1)
def video_backend() -> VideoBackend:
    """Backend vidéo choisi par `settings.storage_backend` (mémoïsé pour le process)."""
    if settings.storage_backend == "minio":
        return MinioVideoBackend()
    return DiskVideoBackend()


def put_video(capsule_id: int, data: bytes) -> None:
    video_backend().put_video(capsule_id, data)


def read_video(capsule_id: int) -> bytes | None:
    return video_backend().read_video(capsule_id)


def taille_videos() -> int | None:
    """Le poids des vidéos du backend ACTIF (ADR-0069 §2) — `None` s'il est injoignable."""
    return video_backend().taille_videos()


def delete_capsule_video(capsule_id: int) -> None:
    """Supprime le MP4 d'une capsule (best-effort)."""
    try:
        video_backend().delete_video(capsule_id)
    except Exception:  # noqa: BLE001 — nettoyage best-effort, ne bloque jamais un delete.
        pass
