"""Stockage disque des pistes audio de capsule (MVP ; MinIO en suite).

Chemins sous `settings.audio_storage_dir/capsules/{id}/scene_{i}.wav`. Le contenu de
`storage/` est gitignoré (cf. CLAUDE.md §sécurité).
"""

import shutil
from pathlib import Path

from app.core.config import settings


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
