#!/usr/bin/env python3
"""Régénère le tableau « ### Amendements » en tête des ADR fusionnés.

Ce script existe parce que `fusion_addendums.py` ne peut plus le faire. Sa fonction
`tableau_amendements()` itère sur des objets `ADR` lus depuis des **fichiers d'addendum
séparés** (`a.chemin`, `a.date`, `a.statut`, `a.revocations`). La fusion du 2026-08-16
(PR #136) a supprimé ces fichiers : les addenda sont devenus des sections
`## Amendement N — <titre> — <date>` À L'INTÉRIEUR du fichier parent. Depuis ce jour, la
mention « ne pas éditer à la main » désignait un script devenu incapable de tenir la
promesse — et le 2026-08-17 l'Amendement 8 de l'ADR-0025 a dû être écrit à la main.

🔴 **La source de vérité, ici, ce sont les SECTIONS — pas le tableau.** Le tableau n'est
qu'une vue. Ce script lit les sections du fichier lui-même et réécrit la vue ; il ne lit
jamais l'ancien tableau pour en déduire quoi que ce soit.

╭─ GARANTIE ────────────────────────────────────────────────────────────────╮
│ 1. La SEULE zone réécrite est le bloc allant de `> ### Amendements` à la   │
│    ligne `> *Tableau généré…*`. Tout le reste du fichier est reporté au    │
│    caractère près — vérifié après coup, avant écriture.                    │
│ 2. Aucun champ n'est deviné. Une section sans date, sans statut lisible    │
│    ou mal numérotée est RAPPORTÉE, et le fichier n'est pas écrit.          │
│ 3. Un titre à l'intérieur d'un bloc de code n'est JAMAIS lu comme une      │
│    section (le corpus en contient : blocs ```txt à lignes en #).           │
│ 4. Zéro fichier trouvé est une ERREUR, jamais un succès silencieux.        │
│ 5. Un fichier portant des marqueurs de fusion non résolus est REFUSÉ :     │
│    c'est deux documents superposés, pas un document.                       │
╰───────────────────────────────────────────────────────────────────────────╯

🔴 **La colonne « Révoque » ne se déduit PAS des mots du texte.** Elle l'a été, et elle
mentait sur **12 des 46 lignes** : la détection héritée d'`adr_lib._revocations` cherchait
le mot « révoque » n'importe où dans la section, si bien que « **Ne révoque rien** » était
compté « oui ». Le verdict est désormais **déclaré**, section par section, dans
`REVOCATION_DECLAREE`, avec la citation qui l'établit — voir le commentaire de la table
pour les trois cas qui prouvent qu'aucune heuristique ne pouvait s'en sortir.

Usage :
    python3 scripts/gen_tableau_amendements.py docs/decisions              # rapport seul
    python3 scripts/gen_tableau_amendements.py docs/decisions --write      # applique
    python3 scripts/gen_tableau_amendements.py docs/decisions --check      # verrou de CI
    python3 scripts/gen_tableau_amendements.py docs/decisions --diagnostic # clés orphelines

`--check` est ce qui rend la mention VRAIE au lieu de pieuse : sans lui, le premier
amendement écrit à la main sans relancer le script fait redériver le tableau, en silence,
exactement comme le 2026-08-17.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from adr_lib import _classer_statut  # noqa: E402

RE_FENCE = re.compile(r"^\s*(```|~~~)")

# Marqueurs laissés par une fusion non résolue. Le `=======` doit être EXACT : une
# ligne de soulignement Setext (`====`) est du markdown parfaitement légitime.
RE_MARQUEUR_CONFLIT = re.compile(r"^(<{7} |={7}$|>{7} |\|{7} )")

# `## Amendement 8 — Le passé se raconte, et la matière prend la couleur — 2026-08-17`
# La date est facultative dans le motif pour pouvoir DIRE qu'elle manque, plutôt que de
# ne pas reconnaître la section du tout et la faire disparaître du tableau en silence.
RE_AMENDEMENT = re.compile(
    r"^##\s+Amendement\s+(\d+)\s+—\s+(.*?)(?:\s+—\s+(\d{4}-\d{2}-\d{2}))?\s*$"
)

DEBUT_BLOC = "> ### Amendements"
# Les deux mentions sont reconnues : l'ancienne (pour pouvoir la migrer) et la nouvelle
# (pour que le script soit idempotent sur ce qu'il a lui-même écrit).
RE_MENTION = re.compile(
    r"^>\s*\*Tableau généré par `scripts/(?:fusion_addendums|gen_tableau_amendements)\.py`"
)
MENTION = (
    "> *Tableau généré par `scripts/gen_tableau_amendements.py` — ne pas éditer à la main.*"
)

# Le statut d'un amendement, par ordre de fiabilité décroissante.
# 1. Le marqueur écrit par la fusion       — « Statut d'origine : **Accepté**. »
RE_STATUT_FUSION = re.compile(r"Statut d'origine\s*:\s*\*\*(.+?)\*\*")
# 2. Une sous-section dédiée               — « ### Statut » puis le texte
RE_SOUS_SECTION_STATUT = re.compile(r"^#{3,6}\s+Statut\s*$")
# 3. Une ligne de statut en citation       — « > Statut : **Accepté — 2026-08-10**. »
RE_STATUT_LIGNE = re.compile(r"^>?\s*\*{0,2}Statut\*{0,2}\s*:", re.I)

# --- Colonne « Révoque » -----------------------------------------------------
#
# 🔴 La détection de surface est FAUSSE, et elle l'a été sur 12 des 46 lignes. Elle
# héritait d'`adr_lib._revocations` : la présence du mot « révoque » quelque part dans
# la section. Or le mot apparaît massivement dans des phrases qui disent le CONTRAIRE
# (« **Ne révoque rien** », « le §2a est amendé, pas révoqué ») ou qui parlent d'autre
# chose que du parent — un amendement qui révoque **son propre brouillon du matin**
# (adr-0015 Am.1, adr-0032 Am.1) ou une **assertion de test** (adr-0024 Am.7).
#
# Aucune heuristique ne s'en sort, et ce n'est pas faute d'avoir cherché : adr-0024 Am.7
# ne déclare que « **révise une lecture** » et révoque pourtant une doctrine à moitié,
# tandis qu'adr-0032 Am.1 déclare « **Ne rouvre aucune des décisions §1–§6** » et porte
# quand même le mot huit fois. Le fait n'est pas dans la forme des phrases : il est dans
# ce que le document décide. Il se LIT, une fois, et se DÉCLARE ici — même principe
# qu'`ORDRE_DECLARE` dans `fusion_addendums.py`, avec la citation qui l'établit.
#
# La clé est « <fichier>::<titre de la section> » — surtout PAS le numéro, qui est
# positionnel : insérer un amendement au milieu décalerait tous les suivants et
# réattribuerait les verdicts en silence.
REVOCATION_DECLAREE: dict[str, bool] = {
    # — Révoquent une décision du parent ————————————————————————————————
    "adr-0024::La Galaxy prend sa route ; l'Accueil cesse de payer la 3D": True,
    #   « l'amendement du §6 daté du 2026-07-28 (graphe global 3D sur l'Accueil), **révoqué** »
    "adr-0024::Addendum « La galaxie revient sur l'Accueil » : la vie vaut son prix": True,
    #   « Il **révoque le §B** du premier addendum »
    "adr-0024::Addendum « Constellations complètes » : tout est là, et tout tourne autour du centre": True,
    #   « Il **révoque le §C** du premier addendum »
    "adr-0024::La page matière porte l'effort de Massimo, et se range en onglets": True,
    #   « dont il **révise une lecture** — voir §1 » ; le §1 lève l'interdit « ni niveau, ni XP »
    "adr-0025::Témoin de nouveauté ≠ compteur d'arriéré": True,
    #   « **Révoque une interdiction explicite** portée par `page-agenda.md` »
    "adr-0025::L'échéance mène à son cours": True,
    #   « 🔴 **RÉVOQUE le §13.3** (« aucun `lesson_id` persisté »), écrit le matin même »
    "adr-0025::La bande ouvre un jour, et le passé cesse d'être hors d'atteinte": True,
    #   « **Révoque une phrase de `page-agenda.md`** »
    "adr-0025::le regard vit à `/agenda`, et nulle part ailleurs": True,
    #   « **RÉVOQUE la Décision validée n°2 de l'Amendement 1** »
    "adr-0025::Le passé se raconte, et la matière prend la couleur": True,
    #   « **RÉVOQUE quatre décisions** … nommées une à une au §R »
    "adr-0025::Trois questions, trois sections": True,
    #   « **RÉVOQUE §D8** … et **BORNE §4 / §B7** sans les révoquer »
    "adr-0030::le témoin du Diagnostic, et l'exception assumée à « NOUVEAU jamais DÛ »": True,
    #   « **AMENDE l'`adr-0030` Décision 1** … et **RÉVOQUE** … »
    "adr-0032::ZETIS LEVELS : le réglage passe en tête, et il dit ce qu'il fait": True,
    #   « ⚠️ **RÉVOQUE une décision écrite** — la primauté du bloc « où vous en êtes » »
    "adr-0034::Le Journal se trie et se filtre, et pour ça son passé cesse de bouger": True,
    #   « **Révoque une phrase**, nommément, au §5 »
    "adr-0035::Les devoirs déclenchent aussi, et l'échéance commande enfin ses missions": True,
    #   « **Ce document RÉVOQUE le §1 de l'ADR-0035**, vieux de quelques heures »
    "adr-0038::Progression nomme ce qu'elle compte, et on peut agir depuis là": True,
    #   « ⚠️ **RÉVOQUE une décision de l'ADR-0038 §6**, écrite le matin même »

    # — Ne révoquent rien ————————————————————————————————————————————————
    # Les huit premières le DISENT, mot pour mot ; la détection de surface les comptait
    # « oui » parce que la phrase qui nie contient le mot qu'elle nie.
    "adr-0025::L'intitulé se choisit dans le référentiel": False,
    #   « **Ne révoque rien** : §8 (« le texte brut est conservé ») reste entier »
    "adr-0025::« Leçon à apprendre », le quatrième type": False,
    #   « **Ne révoque rien.** Élargit `AGENDA_KINDS` d'une valeur »
    "adr-0028::Le KPI qui manque : « À renforcer »": False,
    #   « **Ne révoque rien.** Il **complète** le §5 »
    "adr-0028::La carte mémoire ne pouvait montrer aucun événement": False,
    #   « **Ne révoque rien, et borne une chose.** »
    "adr-0028::Deux cartes ne pouvaient que s'éteindre": False,
    #   « **Ne révoque rien.** Il **complète** le §5 »
    "adr-0034::Le Journal dit sous quel régime, mène à ce qui débloque, et sait ce qui l'est déjà": False,
    #   « **Ne révoque rien.** Il ajoute une colonne et un champ de lecture. »
    "adr-0036::Le bouton qui ne peut pas aboutir : le verdict porte sur la SITUATION, pas sur le TYPE": False,
    #   « **Ne révoque rien.** Il **étend** un verdict … »
    "adr-0036::Une file que personne n'écoute n'est pas une attente": False,
    #   « **Ne révoque rien.** Il étend l'ADR-0036 côté **exécution** »
    "adr-0059::La production était déjà propre": False,
    #   « **Ne révoque rien.** Le §18 reste entier »

    # Les trois suivantes ne le disent PAS avec cette formule — et c'est pour elles que
    # la correction ne pouvait pas être un simple « sauf si "ne révoque rien" ».
    "adr-0025::Papa n'existe pas dans l'espace de Massimo": False,
    #   déclare « **Amende le §2a** » ; §16.2 : « Le §2a est amendé, **pas révoqué** »
    "adr-0032::L'état de ZETIS se lit sans ouvrir les Paramètres": False,
    #   déclare « **Ne rouvre aucune des décisions §1–§6** » ; la mention enfouie
    #   (« Révoqué le 2026-08-04 par le commanditaire ») porte sur son PROPRE brouillon
    #   du matin — « Cette section a d'abord décidé l'inverse ».
    "adr-0015::La fiche que Massimo fabrique lui-même": False,
    #   « La version initiale posait un **verrou** … Elle est **révoquée** » — son propre
    #   brouillon, révisé le jour même par le commanditaire. Le parent n'est pas touché.

    # — N'emploient jamais le mot ————————————————————————————————————————
    # Vingt et une sections ne parlent de révocation NULLE PART. Elles sont
    # déclarées quand même : sans elles, l'avertissement de repli crierait à chaque
    # passage sur des lignes connues justes, et un avertissement permanent finit par
    # ne plus être lu. Ainsi il ne signale que du neuf.
    "adr-0009::Cours validé comme source canonique des dérivés + lien `lesson_skills`": False,
    "adr-0011::Fraîcheur des dérivés (péremption)": False,
    "adr-0011::Provenance de la validation": False,
    "adr-0011::L'autorité monte d'un cran : `parent_rule` et le veto paresseux": False,
    "adr-0016::Pilotage Papa : aperçu fidèle, brique de canvas partagée, cycle de vie éditorial": False,
    "adr-0020::Le Conseil de classe peut ne parler que d'une matière": False,
    "adr-0024::Un Accueil vivant, sans cadrage de perte": False,
    "adr-0024::Addendum « Galaxie animée » : tout voir, et voir ça arriver": False,
    "adr-0024::La page matière est un index de notions": False,
    "adr-0026::Le retour de demande se ferme dans le chat (`announced_at`)": False,
    "adr-0027::Liste d'attente de contenus pour Papa (`content_requests`)": False,
    "adr-0027::Demander un contenu depuis une surface élève": False,
    "adr-0028::Une bulle qu'on clique dit enfin QUELLES notions, et pas seulement combien": False,
    "adr-0029::Addendum « Construction depuis root » : une croissance, pas une lecture": False,
    "adr-0029::Addendum « La galaxie dans le bandeau » : le chrome cesse de décorer pour rien": False,
    "adr-0030::le témoin de Matières, et les bornes des trois nouveaux témoins": False,
    "adr-0030::le témoin d'ELI5, ou le §2 payé plutôt que contourné": False,
    "adr-0030::le témoin du Quiz, et un témoin qui naît d'une production": False,
    "adr-0031::Les deux passes du §7 : le gate vit dans la sélection, pas dans l'orchestrateur": False,
    "adr-0041::ADR-0041 addendum — Un travail dit ce qu'il a produit": False,
    "adr-0057::ADR-0057 · Addendum — Missions : le tri se fait sur une NOTION, pas sur une leçon": False,
}

# Repli pour une section non déclarée (un amendement écrit après ce tableau). Il ne
# DEVINE pas en silence : `main()` liste toute section qui y tombe, pour qu'un humain
# la déclare. Négation d'abord — c'est le cas le plus fréquent et le plus mal lu.
RE_NE_REVOQUE_PAS = re.compile(
    r"ne\s+r[ée]voqu\w*\s+(?:rien|aucun)|"
    r"ne\s+rouvre\s+aucune|"
    r"amendé,?\s+pas\s+r[ée]voqué",
    re.I,
)
RE_REVOQUE = re.compile(r"r[ée]voque|r[ée]voqué|remplace le §", re.I)

LIBELLE_STATUT = {
    "propose": "Proposé",
    "accepte": "Accepté",
    "livre": "Livré",
    "remplace": "Remplacé",
    "abandonne": "Abandonné",
}


class Amendement:
    def __init__(self, numero: int, titre: str, date: str | None, corps: list[str],
                 prefixe: str = ""):
        self.numero = numero
        self.titre = titre
        self.date = date
        self.corps = corps
        self.cle = f"{prefixe}::{titre}"
        self.manques: list[str] = []

        if not date:
            self.manques.append("date")
        if not titre:
            self.manques.append("titre")

        self.statut = self._lire_statut()
        if not self.statut:
            self.manques.append("statut")

        self.revoque, self.revocation_declaree = self._lire_revocation()

    def _lire_revocation(self) -> tuple[bool, bool]:
        """Rend (révoque, le fait est-il DÉCLARÉ). Voir `REVOCATION_DECLAREE`."""
        if self.cle in REVOCATION_DECLAREE:
            return (REVOCATION_DECLAREE[self.cle], True)

        # Repli, signalé par `main()` : négation d'abord, puis mention positive.
        blob = "\n".join(self.corps)
        if RE_NE_REVOQUE_PAS.search(blob):
            return (False, False)
        return (bool(RE_REVOQUE.search(blob)), False)

    def _lire_statut(self) -> str | None:
        blob = "\n".join(self.corps)

        m = RE_STATUT_FUSION.search(blob)
        if m:
            return LIBELLE_STATUT.get(_classer_statut(m.group(1)))

        for i, l in enumerate(self.corps):
            if RE_SOUS_SECTION_STATUT.match(l.strip()):
                for suite in self.corps[i + 1 : i + 6]:
                    if suite.strip():
                        return LIBELLE_STATUT.get(_classer_statut(suite))
                return None

        for l in self.corps[:15]:
            if RE_STATUT_LIGNE.match(l.strip()):
                return LIBELLE_STATUT.get(_classer_statut(l))

        return None

    def ligne(self) -> str:
        return (
            f"> | {self.numero} | {self.date or '—'} | {self.titre} "
            f"| {self.statut or '?'} | {'oui' if self.revoque else '—'} |"
        )


def masque_hors_code(lignes: list[str]) -> list[bool]:
    """Rend un masque : True si la ligne est HORS d'un bloc de code."""
    dehors, masque, cloture = True, [], None
    for l in lignes:
        f = RE_FENCE.match(l)
        if f:
            marque = f.group(1)
            if dehors:
                dehors, cloture = False, marque
                masque.append(False)
                continue
            if marque == cloture:
                dehors, cloture = True, None
            masque.append(False)
            continue
        masque.append(dehors)
    return masque


def lire_amendements(lignes: list[str], prefixe: str = "") -> list[Amendement]:
    masque = masque_hors_code(lignes)
    bornes = [
        i for i, (l, dehors) in enumerate(zip(lignes, masque))
        if dehors and RE_AMENDEMENT.match(l)
    ]
    amendements = []
    for k, i in enumerate(bornes):
        fin = bornes[k + 1] if k + 1 < len(bornes) else len(lignes)
        m = RE_AMENDEMENT.match(lignes[i])
        amendements.append(
            Amendement(int(m.group(1)), m.group(2).strip(), m.group(3),
                       lignes[i + 1 : fin], prefixe)
        )
    return amendements


def prefixe_de(chemin: Path) -> str:
    """« adr-0024-zetis-galaxy-progression.md » → « adr-0024 »."""
    m = re.match(r"^(adr-\d{4})", chemin.name)
    return m.group(1) if m else chemin.stem


def bornes_bloc(lignes: list[str]) -> tuple[int, int] | None:
    """Rend (début, fin exclue) du bloc de tableau, ou None s'il n'y en a pas."""
    masque = masque_hors_code(lignes)
    debut = None
    for i, (l, dehors) in enumerate(zip(lignes, masque)):
        if not dehors:
            continue
        if l.strip() == DEBUT_BLOC:
            if debut is not None:
                raise ValueError("deux blocs « ### Amendements » — à trancher à la main")
            debut = i
        elif debut is not None and RE_MENTION.match(l):
            return (debut, i + 1)
    if debut is not None:
        raise ValueError("bloc « ### Amendements » ouvert mais sans ligne de mention")
    return None


def bloc(amendements: list[Amendement]) -> list[str]:
    t = [DEBUT_BLOC, ">", "> | # | Date | Titre | Statut | Révoque |", "> |---|---|---|---|---|"]
    t += [a.ligne() for a in amendements]
    t += [">", MENTION]
    return t


def traiter(chemin: Path) -> tuple[str | None, list[str], list[Amendement]]:
    """Rend (contenu neuf ou None si inchangé, fautes, amendements)."""
    original = chemin.read_text(encoding="utf-8")
    lignes = original.splitlines()

    # 🔴 Un fichier en cours de fusion n'est pas un document : c'est deux documents
    # superposés, dont un humain n'a pas encore dit lequel gagne. Écrire dedans
    # écraserait une résolution en cours.
    #
    # Ce n'est pas une précaution théorique. Le 2026-08-17, une autre session fusionnait
    # cette branche dans `feat/agenda-v2` pendant que je tournais : `adr-0025` portait ses
    # marqueurs, et le script a produit une sortie **sans broncher** — il ne réécrit que le
    # bloc du tableau, si bien que le `>>>>>>>` survivait tranquillement en dessous.
    conflits = [i + 1 for i, l in enumerate(lignes)
                if RE_MARQUEUR_CONFLIT.match(l)]
    if conflits:
        apercu = ", ".join(str(n) for n in conflits[:6])
        return (None, [f"marqueur(s) de conflit Git — ligne(s) {apercu}"], [])

    zone = bornes_bloc(lignes)
    if zone is None:
        return (None, [], [])

    amendements = lire_amendements(lignes, prefixe_de(chemin))
    fautes = []

    if not amendements:
        fautes.append("un tableau, mais aucune section « ## Amendement N »")

    for a in amendements:
        if a.manques:
            fautes.append(f"Amendement {a.numero} « {a.titre[:40]} » : {', '.join(a.manques)}")

    attendus = list(range(1, len(amendements) + 1))
    trouves = [a.numero for a in amendements]
    if trouves != attendus:
        fautes.append(f"numérotation {trouves} — attendu {attendus}")

    if fautes:
        return (None, fautes, amendements)

    debut, fin = zone
    sortie = "\n".join(lignes[:debut] + bloc(amendements) + lignes[fin:]) + "\n"

    # Garantie 1 — hors du bloc, pas un caractère ne bouge.
    neuf = sortie.splitlines()
    zone_neuve = bornes_bloc(neuf)
    if lignes[:debut] != neuf[: zone_neuve[0]] or lignes[fin:] != neuf[zone_neuve[1] :]:
        return (None, ["🔴 GARANTIE VIOLÉE : du texte hors du tableau a bougé"], amendements)

    return (sortie if sortie != original else None, [], amendements)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("racine", type=Path)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--check", action="store_true",
                    help="sort en erreur si un tableau a dérivé (verrou de CI)")
    ap.add_argument("--diagnostic", action="store_true",
                    help="liste les sections dont la révocation n'est pas déclarée")
    args = ap.parse_args()

    if not args.racine.is_dir():
        print(f"🔴 {args.racine} n'est pas un répertoire")
        return 1

    fichiers = sorted(args.racine.glob("adr-*.md"))
    if not fichiers:
        print(f"🔴 aucun fichier `adr-*.md` sous {args.racine} — rien à faire, et c'est anormal")
        return 1

    avec_tableau, changes, echecs, total_a = 0, 0, 0, 0
    non_declarees: list[str] = []
    cles_vues: set[str] = set()

    for f in fichiers:
        try:
            sortie, fautes, amendements = traiter(f)
        except ValueError as e:
            print(f"🔴 {f.name} : {e}")
            echecs += 1
            continue

        if not amendements and sortie is None and not fautes:
            continue  # pas de tableau : ADR sans amendement, on passe

        avec_tableau += 1
        total_a += len(amendements)

        for a in amendements:
            cles_vues.add(a.cle)
            if not a.revocation_declaree:
                non_declarees.append(
                    f"{a.cle}  → repli : {'oui' if a.revoque else '—'}"
                )

        if fautes:
            print(f"🔴 {f.name} : rien n'est écrit")
            for x in fautes:
                print(f"     {x}")
            echecs += 1
            continue

        if sortie is None:
            print(f"·  {f.name} : {len(amendements)} amendement(s), tableau déjà juste")
            continue

        changes += 1
        print(f"✅ {f.name} : {len(amendements)} amendement(s), tableau réécrit")
        if args.write:
            f.write_text(sortie, encoding="utf-8")

    print(
        f"\n{avec_tableau} ADR avec tableau, {total_a} amendement(s), "
        f"{changes} tableau(x) à réécrire, {echecs} échec(s)"
    )

    # Une section non déclarée n'est jamais une faute — un amendement neuf en est une
    # par construction. Mais elle ne doit pas passer INAPERÇUE : son verdict vient d'un
    # repli sur les mots, et c'est précisément ce qui avait produit 12 lignes fausses.
    if non_declarees:
        print(
            f"\n⚠️  {len(non_declarees)} section(s) sans révocation déclarée — verdict "
            "obtenu par repli, à confirmer puis inscrire dans `REVOCATION_DECLAREE` :"
        )
        for d in non_declarees:
            print(f"     {d}")

    orphelines = sorted(set(REVOCATION_DECLAREE) - cles_vues)
    if orphelines and args.diagnostic:
        # Pas une faute : une branche peut légitimement ne pas porter un amendement que
        # `main` porte (c'est le cas de l'ADR-0025 Am.8 tant que l'agenda v2 n'est pas
        # mergé). Mais une clé orpheline PERMANENTE est une faute de frappe qui fait
        # retomber sa section sur le repli, en silence.
        print(f"\n⚠️  {len(orphelines)} clé(s) déclarée(s) sans section correspondante :")
        for c in orphelines:
            print(f"     {c}")

    if args.check and changes:
        print(
            f"\n🔴 {changes} tableau(x) ont dérivé de leurs sections.\n"
            "   Un amendement a été écrit sans régénérer la vue. Relancer :\n"
            "     python3 scripts/gen_tableau_amendements.py docs/decisions --write"
        )
        return 1

    if not args.write and not args.check and changes:
        print("\n(rapport seul — relancer avec --write pour appliquer)")
    return 1 if echecs else 0


if __name__ == "__main__":
    raise SystemExit(main())
