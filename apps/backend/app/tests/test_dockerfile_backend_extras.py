"""Test-verrou : l'image backend de PROD installe la dictée, pas seulement la voix.

Le 2026-08-18, Massimo a signalé « pas de voix » sur le chat : le micro s'ouvrait, l'audio
partait, et `/transcribe` répondait 503 — « La dictée n'est pas dispo pour l'instant ». Cause :
`infra/docker/backend.Dockerfile` installait `apps/backend[tts]` **seulement**. La voix des
capsules (Piper) marchait donc, mais la dictée (faster-whisper) était absente de l'image. La
décision d'avoir une dictée 100 % locale existait pourtant depuis l'ADR-0012, et l'extra `[stt]`
était déjà déclaré dans `pyproject.toml`. L'intention était écrite ; l'image ne l'exécutait pas.

Ce fichier tient les DEUX moitiés de la remise en état :

  1. l'extra `[stt]` est bien installé (sans lui, pas de `faster_whisper`, donc 503) ;
  2. le modèle Whisper est BAKÉ dans l'image, comme la voix Piper — pour que le premier appui-micro
     de Massimo ne déclenche pas un téléchargement de ~150 Mo (qui peut échouer, et qui rejouerait
     la panne « pas de dictée »).

⚠️ LECTURE DE TEXTE, jamais d'import. La CI installe le backend en `.[dev]` seul : `faster_whisper`
et `piper` n'y sont PAS (cf. l'en-tête de `.github/workflows/ci.yml`). Un test qui les importerait
passerait en local — où ils sont installés — et tomberait en CI. On lit donc le Dockerfile comme un
fichier, sans rien exécuter.

Un échec ici ne se répare pas en ajustant l'assertion : il se répare en remettant l'extra ou le
warm-up manquant dans `backend.Dockerfile`.
"""

import re
from pathlib import Path

DOCKERFILE = (
    Path(__file__).resolve().parents[4] / "infra" / "docker" / "backend.Dockerfile"
)

#: La ligne d'installation editable du backend, avec sa liste d'extras entre crochets.
#: Ex. : RUN pip install --no-cache-dir -e 'apps/backend[tts,stt]'
_PIP_INSTALL = re.compile(r"pip install[^\n]*apps/backend\[([a-z0-9,\s]*)\]")


def _extras_installes() -> set[str]:
    """Rend l'ensemble des extras que le Dockerfile installe pour `apps/backend`."""
    texte = DOCKERFILE.read_text(encoding="utf-8")
    trouve = _PIP_INSTALL.search(texte)
    assert trouve, (
        "Aucune ligne `pip install -e 'apps/backend[...]'` trouvée dans "
        f"{DOCKERFILE.name} — l'image n'installe plus le backend en editable ?"
    )
    return {e.strip() for e in trouve.group(1).split(",") if e.strip()}


def test_l_extra_stt_est_installe() -> None:
    """Sans `[stt]`, `faster_whisper` manque et `/transcribe` répond 503 (dictée morte)."""
    extras = _extras_installes()
    assert "stt" in extras, (
        "L'image backend de prod n'installe pas l'extra [stt] : la dictée du chat/ELI5 "
        f"répondra 503. Extras vus : {sorted(extras)}. Cf. ADR-0012."
    )


def test_l_extra_tts_reste_installe() -> None:
    """La voix des capsules (Piper) ne doit pas repartir en ajoutant la dictée."""
    extras = _extras_installes()
    assert "tts" in extras, (
        f"L'image backend de prod n'installe plus l'extra [tts] (voix Piper). "
        f"Extras vus : {sorted(extras)}. Cf. ADR-0007."
    )


def test_le_modele_whisper_est_bake() -> None:
    """Le modèle STT est pré-chargé à la construction, comme la voix Piper — pas au 1er micro."""
    texte = DOCKERFILE.read_text(encoding="utf-8")
    assert "WhisperModel(" in texte, (
        "Le modèle faster-whisper n'est pas baké dans l'image : le premier appui-micro de "
        "Massimo déclencherait un téléchargement de ~150 Mo, qui peut échouer et rejouer la "
        "panne « pas de dictée ». Ajouter un warm-up `WhisperModel(...)` au build."
    )
    assert "HF_HOME" in texte, (
        "HF_HOME n'est pas fixé : le warm-up de build et le runtime liraient des caches "
        "différents, et le modèle baké ne serait pas retrouvé à l'exécution."
    )
