"""Cœur du rendu : préparation du spec « render-ready » + appel du renderer Node.

`build_render_input` est **pur** (testable sans Node ni DB) : il réécrit les `audioUrl` du
spec en noms de fichiers nus et collecte les WAV à déposer dans le `publicDir` que le bundle
Remotion résout via `staticFile`.
"""

import json
import os
import subprocess
import tempfile
from collections.abc import Callable
from pathlib import Path

# Repo root déduit depuis ce fichier : apps/worker-media/worker_media/render.py → parents[3].
_REPO_ROOT = Path(__file__).resolve().parents[3]
_DEFAULT_RENDER_SCRIPT = _REPO_ROOT / "apps" / "frontend-papa" / "src" / "remotion" / "render.mjs"
# Timeout de rendu (garde-fou ADR §7). Aligné sur RENDER_JOB_TIMEOUT côté file.
RENDER_TIMEOUT_SECONDS = int(os.environ.get("REMOTION_TIMEOUT", "600"))


def render_script_path() -> Path:
    return Path(os.environ.get("CAPSULE_RENDER_SCRIPT", str(_DEFAULT_RENDER_SCRIPT)))


def build_render_input(
    spec: dict, audio_reader: Callable[[int], bytes | None]
) -> tuple[dict, list[tuple[str, bytes]]]:
    """Retourne (spec_render, [(nom_fichier, octets_wav)]).

    - Chaque scène narrée (`audioUrl` présent) voit son `audioUrl` réécrit en `scene_{i}.wav`
      et son WAV collecté pour le `publicDir`.
    - Une scène dont le WAV est introuvable perd son `audioUrl` (rendue muette plutôt que de
      casser le rendu).
    """
    scenes_out: list[dict] = []
    staged: list[tuple[str, bytes]] = []
    for i, scene in enumerate(spec.get("scenes", [])):
        s = dict(scene)
        if s.get("audioUrl"):
            data = audio_reader(i)
            if data is not None:
                name = f"scene_{i}.wav"
                staged.append((name, data))
                s["audioUrl"] = name
            else:
                s.pop("audioUrl", None)
        scenes_out.append(s)
    return {**spec, "scenes": scenes_out}, staged


def _run_node(spec_path: Path, public_dir: Path, out_path: Path) -> None:
    script = render_script_path()
    if not script.exists():
        raise FileNotFoundError(f"render.mjs introuvable : {script}")
    proc = subprocess.run(
        ["node", str(script), str(spec_path), str(public_dir), str(out_path)],
        cwd=str(script.parent.parent.parent),  # apps/frontend-papa (résolution node_modules)
        capture_output=True,
        text=True,
        timeout=RENDER_TIMEOUT_SECONDS,
    )
    if proc.returncode != 0 or not out_path.exists():
        raise RuntimeError(
            f"Rendu Node échoué (code {proc.returncode}).\n"
            f"stderr:\n{proc.stderr[-2000:]}\nstdout:\n{proc.stdout[-500:]}"
        )


def render_spec_to_mp4(
    spec: dict, audio_reader: Callable[[int], bytes | None]
) -> bytes:
    """Rend un CapsuleSpec en MP4 (octets). Isole tout dans un dossier temporaire."""
    render_spec, staged = build_render_input(spec, audio_reader)
    with tempfile.TemporaryDirectory(prefix="capsule-render-") as tmp:
        tmpdir = Path(tmp)
        public_dir = tmpdir / "public"
        public_dir.mkdir()
        for name, data in staged:
            (public_dir / name).write_bytes(data)
        spec_path = tmpdir / "spec.json"
        spec_path.write_text(json.dumps(render_spec), encoding="utf-8")
        out_path = tmpdir / "out.mp4"
        _run_node(spec_path, public_dir, out_path)
        return out_path.read_bytes()
