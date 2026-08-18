#!/usr/bin/env python3
"""Confronte ce que la base PROMET aux fichiers qui existent RÉELLEMENT.

## Ce qu'il ferme

**Une base peut survivre à une migration de machine sans que ses fichiers suivent.** Le contenu de
`storage/` est gitignoré (CLAUDE.md §sécurité) et absent des dumps SQL : un `pg_dump` restauré
ailleurs rend une base qui *parle* de treize capsules dont pas une n'a de vidéo, et rien ne le dit.
L'écran n'échoue qu'au moment où Massimo clique.

🔴 **Et il ferme un second défaut, celui qui a motivé son écriture : chercher au mauvais endroit.**
Le 2026-08-18, en migrant vers le Mac Studio, on a constaté « 13 capsules en base, 0 fichier dans
MinIO » et conclu à une perte de contenu. **C'était faux.** `STORAGE_BACKEND` vaut `disk` par
défaut : l'application n'écrivait pas une ligne dans MinIO, et les huit vidéos attendues étaient
sur le disque, intactes. Un contrôle qui devine le backend rend un faux positif alarmant.

D'où la règle de ce script : **il lit la configuration de l'application** (`app.core.config`) et
interroge **le backend réellement actif**. Il ne devine rien.

## Ce qu'il vérifie

| Contrôle | Le contrat |
|---|---|
| Vidéo | `capsules.video_url` non nul → la vidéo doit être **lisible par le backend actif** |
| Audio | `capsules.audio_url` non nul → `scene_0.wav` doit exister (l'URL nomme cette scène-là) |
| Orphelins | un dossier de capsule sur le disque sans ligne en base |
| RAG | un `rag_document` sans aucun chunk, un chunk sans texte ou **sans vecteur** |

⚠️ **Ce qu'il NE vérifie pas, faute de contrat** : le nombre de scènes audio attendues. La colonne
`storyboard_json` est NULL sur toutes les capsules mesurées — la base ne porte donc aucune vérité
sur ce nombre. Le script COMPTE les scènes trouvées et les affiche, il ne les juge pas. Inventer un
attendu ici produirait des alertes sans fondement.

## Sorties

| Code | Cas |
|---|---|
| `0` | cohérent — tout ce que la base promet existe |
| `1` | 🔴 **fichiers manquants** : la base promet ce qu'elle n'a pas (perte de contenu) |
| `2` | orphelins seulement : des fichiers que la base ne connaît pas (encombrement, pas perte) |

## Usage

    apps/backend/.venv/bin/python scripts/check_media_integrity.py

Sur une autre base (la prod, depuis le réseau du compose) :

    ZETIS_DATABASE_URL=... apps/backend/.venv/bin/python scripts/check_media_integrity.py
"""

from __future__ import annotations

import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[1]
BACKEND = RACINE / "apps" / "backend"
sys.path.insert(0, str(BACKEND))

from sqlalchemy import create_engine, text  # noqa: E402

from app.core.config import settings  # noqa: E402


def _repertoire_capsule(capsule_id: int) -> Path:
    """Miroir de `app.modules.capsules.storage._capsule_dir`.

    ⚠️ `audio_storage_dir` est RELATIF au cwd du backend (`apps/backend`), pas à la racine du
    dépôt : lancé d'ailleurs, un chemin relatif désignerait un dossier inexistant et le script
    crierait à la perte. On l'ancre donc explicitement.
    """
    base = Path(settings.audio_storage_dir)
    if not base.is_absolute():
        base = BACKEND / base
    return base / "capsules" / str(capsule_id)


def _video_presente(capsule_id: int) -> tuple[bool, str]:
    """Interroge le backend RÉELLEMENT configuré. Rend (présente, où on a regardé)."""
    if settings.storage_backend == "minio":
        from app.modules.capsules.storage import video_backend

        try:
            return video_backend().read_video(capsule_id) is not None, f"minio:{settings.minio_endpoint}"
        except Exception as erreur:  # MinIO éteint : on le DIT, on ne conclut pas à une perte
            return False, f"minio INJOIGNABLE ({type(erreur).__name__})"
    chemin = _repertoire_capsule(capsule_id) / "video.mp4"
    return chemin.exists(), str(chemin)


def main() -> int:
    manquants: list[str] = []
    orphelins: list[str] = []

    moteur = create_engine(settings.database_url)
    print(f"Base    : {settings.database_url.split('@')[-1]}")
    print(f"Stockage: {settings.storage_backend}   audio: {_repertoire_capsule(0).parent}")
    print()

    with moteur.connect() as cx:
        capsules = cx.execute(
            text("select id, status, audio_url, video_url from capsules order by id")
        ).fetchall()

        print(f"── Capsules ({len(capsules)})")
        for cid, statut, audio_url, video_url in capsules:
            dossier = _repertoire_capsule(cid)
            scenes = sorted(dossier.glob("scene_*.wav")) if dossier.is_dir() else []
            ligne = f"  #{cid:<3} {statut:<10} {len(scenes)} scène(s)"

            if video_url:
                presente, ou = _video_presente(cid)
                if presente:
                    ligne += "  vidéo ✓"
                else:
                    ligne += "  vidéo ✖ MANQUANTE"
                    manquants.append(f"capsule #{cid} — vidéo attendue : {ou}")
            if audio_url and not (dossier / "scene_0.wav").exists():
                ligne += "  audio ✖ MANQUANT"
                manquants.append(f"capsule #{cid} — audio attendu : {dossier / 'scene_0.wav'}")
            print(ligne)

        # Orphelins : des fichiers que la base ne revendique pas.
        connus = {c[0] for c in capsules}
        racine_audio = _repertoire_capsule(0).parent
        if racine_audio.is_dir():
            for dossier in sorted(racine_audio.iterdir()):
                if dossier.is_dir() and dossier.name.isdigit() and int(dossier.name) not in connus:
                    orphelins.append(f"{dossier} — aucune capsule #{dossier.name} en base")

        print()
        docs = cx.execute(
            text(
                "select d.id, left(d.title, 40), count(c.id), count(c.content), count(c.embedding) "
                "from rag_documents d left join rag_chunks c on c.document_id = d.id "
                "group by d.id, d.title order by d.id"
            )
        ).fetchall()
        print(f"── Documents RAG ({len(docs)})")
        for did, titre, n_chunks, n_texte, n_vecteur in docs:
            etat = "✓"
            if n_chunks == 0:
                etat = "✖ AUCUN CHUNK"
                manquants.append(f"rag_document #{did} « {titre} » — aucun chunk : import incomplet")
            elif n_texte < n_chunks or n_vecteur < n_chunks:
                etat = f"✖ {n_chunks - n_texte} sans texte, {n_chunks - n_vecteur} sans vecteur"
                manquants.append(f"rag_document #{did} « {titre} » — chunks incomplets")
            print(f"  #{did:<3} {titre:<42} {n_chunks:>3} chunk(s)  {etat}")

    print()
    print("═" * 60)
    if manquants:
        print(f"🔴 {len(manquants)} élément(s) que la base promet et qui N'EXISTENT PAS :")
        for m in manquants:
            print(f"  ✖ {m}")
    else:
        print("✅ Tout ce que la base promet existe.")
    if orphelins:
        print(f"\n⚠️  {len(orphelins)} orphelin(s) — présents sur le disque, inconnus de la base :")
        for o in orphelins:
            print(f"  • {o}")

    if manquants:
        return 1
    return 2 if orphelins else 0


if __name__ == "__main__":
    raise SystemExit(main())
