#!/usr/bin/env python3
"""Juge le décodage GLOUTON de la dictée sur de VRAIES voix (dette ADR-0059).

## La dette qu'il sert, et pourquoi elle ne se ferme pas toute seule

Le 2026-08-15, `stt/provider.py` est passé à `beam_size=1` (glouton) au lieu du défaut 5. Gain
mesuré : **~20 %** (1,23 s → 1,00 s), transcription **identique au mot près**… sur une voix de
**synthèse**. Or une voix de synthèse articule trop bien pour être un test : c'est précisément le
cas où le beam search ne sert à rien. **La question posée par la dette est celle qu'on n'a pas
mesurée** — un enfant, un micro de téléphone, une pièce qui résonne, des mots de collège.

Un seul point réel a été observé, et il n'est pas rassurant : *« alternes-internes »* transcrit
*« alternatifs interne »*. Rattrapé par ZETIS à la lecture, mais c'est une **observation**, pas une
mesure.

🔴 **Ce script ne peut pas produire la voix.** Il n'y a, nulle part dans ce dépôt, un seul
enregistrement humain : les `.wav` de `storage/generated/capsules/` sont des narrations **Piper**,
et les jobs de dictée ne gardent que la TAILLE de l'audio (`{"bytes": 78542}`), jamais le son —
c'est la conception de l'`adr-0059` §18 qui fonctionne. **L'enregistrement est un geste humain, et
il le restera.**

## Le protocole, en trois gestes

1. **Enregistrer 5 à 10 énoncés RÉELS.** Massimo, son téléphone, sa pièce. Des phrases de travail,
   pas « bonjour bonjour » : des mots de collège, des nombres, des noms propres — c'est là que le
   beam search gagne ou ne gagne pas. Sur macOS, l'app Dictaphone suffit (`.m4a` va très bien).
2. **Écrire ce qui a été dit**, une ligne par fichier, dans un `.txt` du même nom que l'audio.
   Sans référence, on compare deux transcriptions entre elles — on ne peut pas dire laquelle a
   raison. C'est facultatif, et ça change la nature du verdict (voir plus bas).
3. **Lancer ce script sur le dossier.**

```bash
python scripts/bench_stt_beam.py ~/dictees-massimo/
python scripts/bench_stt_beam.py fichier.m4a --beams 1 2 5 --passes 3
```

## Ce que le verdict veut dire

| Sortie | Cas |
|---|---|
| `0` | **beam 1 et beam 2 rendent le même texte** partout → le glouton ne coûte rien, il reste |
| `1` | **ils diffèrent** sur au moins un énoncé → lire les écarts, et décider. Le repli est `beam_size=2`, **jamais** le retour à 5 |
| `2` | rien à mesurer (aucun audio lisible, ou moteur STT indisponible) |

⚠️ **Sans référence écrite, un écart ne dit PAS qui a raison.** Le script le signale explicitement
plutôt que de laisser croire à un verdict. Avec référence, il compte les mots faux de chaque
réglage — et c'est seulement là que « meilleur » a un sens.

⚠️ **Le temps mesuré ici n'est pas la latence ressentie.** Le goulot de la chaîne est le moteur de
génération (~9,4 s sur le même tour) ; la dictée pèse ~1 s. Un gain de 200 ms sur le STT ne se voit
pas à l'usage — c'est la QUALITÉ qui décide de ce réglage, pas la vitesse. Le chiffre est affiché
pour mémoire, pas comme critère.
"""

from __future__ import annotations

import argparse
import difflib
import re
import sys
import time
import unicodedata
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
BACKEND = RACINE / "apps" / "backend"
sys.path.insert(0, str(BACKEND))

EXTENSIONS = {".wav", ".m4a", ".mp3", ".webm", ".ogg", ".flac", ".mp4", ".aac"}

RIEN_A_MESURER = 2


def _mots(texte: str) -> list[str]:
    """Mots normalisés — casse, accents et ponctuation retirés.

    On ne juge pas une transcription sur sa ponctuation : Whisper la place à sa guise, et elle
    n'a aucune incidence sur ce que ZETIS comprend d'une dictée.
    """
    sans_accent = "".join(
        c for c in unicodedata.normalize("NFD", texte.lower()) if unicodedata.category(c) != "Mn"
    )
    return re.findall(r"[a-z0-9']+", sans_accent)


def _fautes(rendu: str, reference: str) -> int:
    """Nombre de mots qui diffèrent de la référence (insertions + suppressions + substitutions)."""
    diff = difflib.SequenceMatcher(None, _mots(reference), _mots(rendu))
    return sum(
        max(i2 - i1, j2 - j1)
        for etiquette, i1, i2, j1, j2 in diff.get_opcodes()
        if etiquette != "equal"
    )


def _ecart_lisible(a: str, b: str) -> str:
    """Les mots qui changent, et eux seuls — un diff de phrases entières est illisible."""
    morceaux: list[str] = []
    for etiquette, i1, i2, j1, j2 in difflib.SequenceMatcher(None, _mots(a), _mots(b)).get_opcodes():
        if etiquette == "equal":
            continue
        gauche = " ".join(_mots(a)[i1:i2]) or "∅"
        droite = " ".join(_mots(b)[j1:j2]) or "∅"
        morceaux.append(f"« {gauche} » → « {droite} »")
    return " · ".join(morceaux) if morceaux else "(aucun)"


def _transcrire(engine, chemin: Path, beam: int, langue: str) -> str:
    """Mêmes options que `stt/provider.py`, **sauf `beam_size`** — c'est la variable de l'essai.

    ⚠️ Les options sont recopiées, pas importées : `transcribe()` du provider les fige et
    n'expose aucun moyen de varier le beam. Les recopier ici est le seul moyen de comparer à
    conditions égales. Si le provider change ses options, **ce script doit suivre** — sans quoi il
    mesurerait un décodage que la production n'utilise pas.
    """
    segments, _ = engine.transcribe(
        str(chemin),
        language=langue,
        vad_filter=False,
        beam_size=beam,
        condition_on_previous_text=False,
        without_timestamps=True,
    )
    return " ".join(seg.text.strip() for seg in segments).strip()


def main() -> int:
    parseur = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parseur.add_argument("chemin", type=Path, help="fichier audio, ou dossier d'audios")
    parseur.add_argument("--beams", type=int, nargs="+", default=[1, 2, 5])
    parseur.add_argument("--passes", type=int, default=1, help="passes chronométrées (le meilleur temps est gardé)")
    args = parseur.parse_args()

    audios = (
        sorted(p for p in args.chemin.iterdir() if p.suffix.lower() in EXTENSIONS)
        if args.chemin.is_dir()
        else [args.chemin]
    )
    if not audios:
        print(f"Aucun audio dans {args.chemin} (extensions : {', '.join(sorted(EXTENSIONS))}).")
        return RIEN_A_MESURER

    # On passe par la FABRIQUE de production plutôt que de relire la configuration à la main :
    # c'est elle qui décide du modèle, du device et du type de calcul. La relire ici ferait
    # mesurer un moteur que la production n'utilise pas — et les noms de réglages ne sont pas
    # ceux qu'on devine (`whisper_model`, pas `stt_model`).
    from app.modules.stt import get_stt
    from app.modules.stt.provider import SttUnavailable, _load_model

    provider = get_stt()
    try:
        engine = _load_model(provider.model, provider.device, provider.compute_type)
    except SttUnavailable as erreur:
        print(f"Moteur STT indisponible : {erreur}\n  → pip install -e 'apps/backend[stt]'")
        return RIEN_A_MESURER

    langue = provider.language
    print(f"Modèle  : {provider.model} / {provider.device} / {provider.compute_type} / {langue}")
    print(f"Énoncés : {len(audios)}   Beams : {args.beams}\n")

    divergences: list[tuple[str, str]] = []
    fautes_par_beam: dict[int, int] = {beam: 0 for beam in args.beams}
    references_lues = 0

    for audio in audios:
        reference_fichier = audio.with_suffix(".txt")
        reference = reference_fichier.read_text().strip() if reference_fichier.exists() else ""
        if reference:
            references_lues += 1

        print(f"── {audio.name}")
        if reference:
            print(f"   dit      : {reference}")

        rendus: dict[int, str] = {}
        for beam in args.beams:
            meilleur = float("inf")
            texte = ""
            for _ in range(args.passes):
                depart = time.perf_counter()
                texte = _transcrire(engine, audio, beam, langue)
                meilleur = min(meilleur, time.perf_counter() - depart)
            rendus[beam] = texte
            marque = f"  ({_fautes(texte, reference)} faute(s))" if reference else ""
            print(f"   beam {beam}   : {texte}     [{meilleur:.2f} s]{marque}")
            if reference:
                fautes_par_beam[beam] += _fautes(texte, reference)

        if 1 in rendus and 2 in rendus and _mots(rendus[1]) != _mots(rendus[2]):
            divergences.append((audio.name, _ecart_lisible(rendus[1], rendus[2])))
        print()

    # --- Verdict --------------------------------------------------------------------------------
    if not divergences:
        print("✅ beam 1 et beam 2 rendent le MÊME texte sur tous les énoncés.")
        print("   Le décodage glouton ne coûte rien ici : il reste.")
        if references_lues < len(audios):
            print(
                f"\n⚠️  {len(audios) - references_lues} énoncé(s) sans référence écrite. Le verdict"
                "\n   porte sur l'ACCORD des réglages, pas sur leur justesse : si les deux se"
                "\n   trompent pareil, ce script dit vert."
            )
        return 0

    print(f"🔴 beam 1 et beam 2 DIVERGENT sur {len(divergences)} énoncé(s) :\n")
    for nom, ecart in divergences:
        print(f"   {nom} : {ecart}")

    if references_lues:
        print("\n   Mots faux cumulés, par réglage :")
        for beam in args.beams:
            print(f"     beam {beam} : {fautes_par_beam[beam]}")
        print("\n   → si beam 2 fait NETTEMENT moins de fautes, basculer `stt/provider.py` sur")
        print("     `beam_size=2`. Jamais le retour à 5 : il coûte ~20 % pour un gain non démontré.")
    else:
        print(
            "\n⚠️  AUCUNE référence écrite : on voit que les réglages diffèrent, on ne peut PAS"
            "\n   dire lequel a raison. Écrire ce qui a été dit dans un `.txt` du même nom, puis"
            "\n   relancer — c'est ce qui transforme un écart en verdict."
        )
    return 1


if __name__ == "__main__":
    sys.exit(main())
