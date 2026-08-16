#!/usr/bin/env python3
"""Lecture du registre ADR — parsing partagé par les scripts de réorganisation.

Principe directeur : ce module LIT et RAPPORTE. Il ne devine jamais.
Tout champ qu'il ne peut pas établir avec certitude est laissé à None et
remonté dans un rapport, jamais rempli par défaut.

Trois formats de statut coexistent dans le corpus (mesuré le 2026-08-16) :
  A. section  « ## Statut » puis le texte à la ligne suivante        — 92 fichiers
  B. puce     « - Statut : Accepté » sous le titre                   —  1 fichier
  C. citation « > Statut : **Accepté — 2026-08-10**. » dans le bloc  — 11 fichiers
Le format C est celui des addendums qui déclarent aussi où se concaténer.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

# --- Motifs ------------------------------------------------------------------

RE_ID_FICHIER = re.compile(r"^adr-(\d{4})")
RE_H1 = re.compile(r"^#\s+(.*)$")
RE_DATE = re.compile(r"(20\d{2}-\d{2}-\d{2})")
RE_PR = re.compile(r"\bPR\s*#(\d+)")
RE_CONCAT = re.compile(r"concaténer[^`]*`(?:docs/decisions/)?(adr-[a-z0-9\-]+)\.md`")
RE_REF_ADR = re.compile(r"ADR-(\d{4})")

# Ce qui, dans un texte de statut, désigne la ratification.
STATUTS = {
    "abandonn": "abandonne",
    "remplac": "remplace",
    "accept": "accepte",
    "propos": "propose",
}

# Un titre porte souvent son propre préfixe ; on le retire pour l'index.
RE_PREFIXE_TITRE = re.compile(
    r"^(?:ADR-\d{4}\s*[—–-]\s*)?(?:Addendum\s+(?:à\s+l'|)ADR-\d{4}\s*[—–-]\s*)?"
    r"(?:§?[A-Z0-9]{1,3}\s*·\s*)?(?:\d{4}-\d{2}-\d{2}\s*·\s*)?"
)


@dataclass
class ADR:
    chemin: Path
    id: str
    est_addendum: bool
    titre: str | None = None
    statut: str | None = None
    statut_brut: str | None = None
    date: str | None = None
    pr: int | None = None
    parent_declare: str | None = None      # depuis « À concaténer dans `adr-xxxx-...` »
    revocations: list[str] = field(default_factory=list)
    refs: set[str] = field(default_factory=set)
    manques: list[str] = field(default_factory=list)

    @property
    def parent(self) -> str | None:
        return self.id if self.est_addendum else None


def _texte_statut(lignes: list[str]) -> str | None:
    """Rend le texte de statut, quel que soit le format (A, B ou C)."""
    # Format A — section dédiée
    for i, l in enumerate(lignes):
        if l.strip() == "## Statut":
            for suite in lignes[i + 1 : i + 6]:
                if suite.strip():
                    return suite.strip()
            return None
    # Formats B et C — dans les 15 premières lignes
    for l in lignes[:15]:
        s = l.strip().lstrip("> ").lstrip("- ")
        if s.lower().startswith("statut"):
            return s
    return None


def _classer_statut(texte: str | None) -> str | None:
    if not texte:
        return None
    bas = texte.lower()
    # 🔴 Le statut est le PREMIER mot-clé du texte, pas le premier de notre liste.
    # Mesuré : `adr-0031` porte « Proposé — 2026-08-02. **REMPLACE l'ADR-0023** ».
    # Un ordre de priorité fixe le classait « remplace » — il est REMPLAÇANT, pas remplacé.
    # Même piège sur `adr-0023` (« Remplacé …, accepté le 2026-07-28 ») : là aussi,
    # c'est le premier mot qui dit le statut, et les deux cas se résolvent pareil.
    positions = [(bas.find(cle), val) for cle, val in STATUTS.items() if cle in bas]
    if not positions:
        return None
    return min(positions)[1]


def _revocations(contenu: str) -> list[str]:
    """Lignes qui déclarent une révocation. RAPPORTÉES, jamais interprétées."""
    trouvees = []
    for ligne in contenu.splitlines():
        bas = ligne.lower()
        if any(m in bas for m in ("révoque", "revoque", "révoqué", "remplace le §")):
            trouvees.append(ligne.strip().lstrip("> ").strip()[:200])
    return trouvees[:8]


def lire(chemin: Path) -> ADR:
    contenu = chemin.read_text(encoding="utf-8")
    lignes = contenu.splitlines()

    # 🔴 Le front-matter se saute AVANT toute lecture. Sans ça, le script est
    # non idempotent : au deuxième passage le H1 n'est plus dans les premières
    # lignes, les titres tombent à « — » et l'index se vide en silence.
    # Mesuré au premier enchaînement complet du 2026-08-16.
    if lignes and lignes[0].strip() == "---":
        for i, l in enumerate(lignes[1:], 1):
            if l.strip() == "---":
                lignes = lignes[i + 1 :]
                contenu = "\n".join(lignes)
                break

    m = RE_ID_FICHIER.match(chemin.name)
    if not m:
        raise ValueError(f"nom de fichier hors convention : {chemin.name}")

    adr = ADR(
        chemin=chemin,
        id=m.group(1),
        est_addendum="addendum" in chemin.name,
    )

    # Titre
    for l in lignes[:3]:
        h = RE_H1.match(l)
        if h:
            adr.titre = RE_PREFIXE_TITRE.sub("", h.group(1)).strip()
            break
    if not adr.titre:
        adr.manques.append("titre")

    # Statut
    adr.statut_brut = _texte_statut(lignes)
    adr.statut = _classer_statut(adr.statut_brut)
    if not adr.statut:
        adr.manques.append("statut")

    # Date — celle du bloc de statut fait foi ; à défaut, l'en-tête du fichier
    # (`adr-0012` porte « - Date : 2026-07-04 » sur la puce suivante).
    # Les cinq ADR du bootstrap (0001→0005) n'en ont AUCUNE : c'est un fait,
    # pas un défaut de lecture — on le rapporte au lieu d'inventer.
    for source in (adr.statut_brut, contenu[:2000]):
        if not source:
            continue
        d = RE_DATE.search(source)
        if d:
            adr.date = d.group(1)
            break
    if not adr.date:
        adr.manques.append("date")

    # PR — fait vérifiable, jamais deviné
    p = RE_PR.search(contenu)
    if p:
        adr.pr = int(p.group(1))

    # Parent déclaré par le document lui-même
    c = RE_CONCAT.search(contenu)
    if c:
        adr.parent_declare = c.group(1)

    adr.revocations = _revocations(contenu)
    adr.refs = set(RE_REF_ADR.findall(contenu)) - {adr.id}
    return adr


def charger(racine: Path) -> list[ADR]:
    return sorted(
        (lire(p) for p in racine.glob("adr-*.md")),
        key=lambda a: (a.id, a.est_addendum, a.chemin.name),
    )
