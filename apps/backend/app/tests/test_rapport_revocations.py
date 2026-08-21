"""Test-verrou — `annexes/rapport-revocations.md` ne doit jamais RÉTRÉCIR.

Le 2026-08-21, `gen_frontmatter.py --write` a réduit ce rapport de **27 ADR / 85 lignes** à
**1 ADR / 1 ligne**. Cause : la boucle de `main()` faisait `continue` sur tout ADR portant déjà
un front-matter **avant** de collecter ses révocations, puis rouvrait le fichier en `open("w")`.
Une fois les 67 ADR pourvus de leur front-matter, le rapport n'était donc plus reconstruit qu'à
partir des ADR **neufs** — et le reste était écrasé.

🔴 **Le défaut était INTERMITTENT, et c'est ce qui compte pour qui lira ceci.** Le fichier n'est
réécrit que `if rapport` ; or les ADR 0061→0065 ne portent aucune ligne de révocation. Cinq
cadrages ont donc lancé le script sans rien casser, et le sixième a tout effacé. Un piège qui ne
mord qu'une fois sur six a l'air réparé entre deux morsures — c'est pour ça qu'il lui faut un
verrou plutôt qu'une relecture attentive.

Aggravant : `.claude/commands/cadrage.md` fait lancer ce script **à chaque cadrage**.

Deux verrous, et ils ne prouvent pas la même chose :

1. `test_la_collecte_ne_depend_pas_du_front_matter` — **comportemental**, sur un registre jouet.
   Il rejoue le défaut exact. C'est lui qui mord si quelqu'un redéplace la collecte.
2. `test_le_rapport_liste_tous_les_adr_qui_declarent_une_revocation` — **complétude**, sur le vrai
   registre. Il exige que le fichier commité soit à jour, pas qu'il soit beau. Même esprit que
   `test_carte_des_ports.py`.

⚠️ Un échec du second ne se répare pas en ajustant l'assertion : il se répare en relançant
`python3 scripts/gen_frontmatter.py docs/decisions --write`.
"""

import re
import subprocess
import sys
from pathlib import Path

_RACINE = Path(__file__).resolve().parents[4]
SCRIPT = _RACINE / "scripts" / "gen_frontmatter.py"
DECISIONS = _RACINE / "docs" / "decisions"
RAPPORT = DECISIONS / "annexes" / "rapport-revocations.md"

RE_ENTREE = re.compile(r"^## `(.+)`$", re.M)

# ⚠️ Les registres jouets ci-dessous ne portent leur numéro qu'en minuscules (`adr-9001-…`) et
# JAMAIS sous la forme préfixée en majuscules. Ce n'est pas un hasard de rédaction :
# `scripts/check_adr_refs.sh` cherche cette forme-là dans tout `.py` du dépôt et exige que chaque
# numéro cité corresponde à un fichier réel de `docs/decisions/`. Un jouet nommé à la majuscule
# rend ce verrou de CI ROUGE — mesuré en le lançant, le 2026-08-21, et le premier jet de ce
# fichier est tombé dedans. Y compris dans ce commentaire : l'écrire pour l'interdire suffit à
# déclencher le refus.

# Un ADR qui a DÉJÀ son front-matter — c'est-à-dire le cas de la totalité du registre — et qui
# déclare une révocation dans son corps. Avant le correctif, il était sauté sans être collecté.
ADR_AVEC_FRONT_MATTER = """---
id: "9001"
titre: "Un ADR déjà pourvu de son front-matter"
type: surface
statut: propose
date: 2026-08-21
pr: null
revoque: []
revoque_par: []
refs: []
---
# Décision jouet 9001 — déjà pourvue de son front-matter

## Décision

Ce document **RÉVOQUE** le §4 d'une décision antérieure, et cette ligne doit se retrouver
dans le rapport.
"""

# ⚠️ Volontairement SANS révocation. C'est ce qui rend la contre-épreuve exacte : avant le
# correctif, la liste `rapport` restait vide, donc le garde `if args.write and rapport` empêchait
# toute écriture — le rapport n'était même pas créé. Lui donner une révocation masquerait le bug.
ADR_SANS_FRONT_MATTER = """# Décision jouet 9002 — pas encore pourvue de son front-matter

## Décision

Rien n'est annulé ici.
"""


def test_la_collecte_ne_depend_pas_du_front_matter(tmp_path):
    """Le verrou du défaut : un ADR déjà front-mattré doit figurer au rapport."""
    (tmp_path / "adr-9001-deja-pourvu.md").write_text(ADR_AVEC_FRONT_MATTER, encoding="utf-8")
    (tmp_path / "adr-9002-pas-encore.md").write_text(ADR_SANS_FRONT_MATTER, encoding="utf-8")

    sortie = subprocess.run(
        [sys.executable, str(SCRIPT), str(tmp_path), "--write"],
        capture_output=True,
        text=True,
        check=True,
    )

    rapport = tmp_path / "annexes" / "rapport-revocations.md"
    assert rapport.is_file(), (
        "Le rapport n'a même pas été écrit : la collecte a sauté le seul ADR qui déclare une "
        f"révocation, parce qu'il portait déjà un front-matter.\n{sortie.stdout}"
    )
    assert "adr-9001-deja-pourvu.md" in rapport.read_text(encoding="utf-8"), (
        "L'ADR déjà front-mattré est absent du rapport — la collecte est redevenue "
        "conditionnelle à la POSE du front-matter."
    )


def test_le_rapport_liste_tous_les_adr_qui_declarent_une_revocation():
    """Complétude sur le vrai registre : aucun ADR déclarant une révocation ne manque."""
    sys.path.insert(0, str(_RACINE / "scripts"))
    from adr_lib import charger  # noqa: PLC0415 — le script n'est pas un paquet installé

    attendus = {a.chemin.name for a in charger(DECISIONS) if a.revocations}
    listes = set(RE_ENTREE.findall(RAPPORT.read_text(encoding="utf-8")))

    manquants = attendus - listes
    assert not manquants, (
        f"{len(manquants)} ADR déclarent une révocation sans figurer au rapport : "
        f"{', '.join(sorted(manquants))}.\n"
        "→ relancer `python3 scripts/gen_frontmatter.py docs/decisions --write`, "
        "surtout PAS ajuster cette assertion."
    )


def test_le_rapport_ne_retrecit_pas_sous_le_registre():
    """Le rapport ne peut pas lister MOINS d'ADR que le registre n'en déclare.

    Formulé en COMPTE et non en noms : c'est la formulation qui rougit sur une troncature
    massive même si quelqu'un renommait les fichiers au passage.
    """
    sys.path.insert(0, str(_RACINE / "scripts"))
    from adr_lib import charger  # noqa: PLC0415

    declarants = sum(1 for a in charger(DECISIONS) if a.revocations)
    listes = len(RE_ENTREE.findall(RAPPORT.read_text(encoding="utf-8")))

    assert listes >= declarants, (
        f"Le rapport ne liste que {listes} ADR alors que {declarants} en déclarent une. "
        "C'est la signature exacte de la troncature du 2026-08-21."
    )
