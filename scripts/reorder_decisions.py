#!/usr/bin/env python3
"""Trie l'index DECISIONS.md par numéro d'ADR, par PERMUTATION PURE de blocs.

Pourquoi un script plutôt qu'un tri à la main : 18 entrées débordent sur
plusieurs lignes — jusqu'à 95 — avec des continuations indentées, et l'une
d'elles porte une sous-puce sans référence d'ADR. Un tri ligne à ligne les
disperserait.

Garantie : le fichier écrit contient exactement les mêmes blocs, réordonnés.
Le script REFUSE d'écrire si ce n'est pas le cas. Il ne ré-indente rien et ne
réécrit aucun contenu — ré-indenter modifierait un bloc et ferait perdre la
garantie de permutation pure.

Usage :
    python3 scripts/reorder_decisions.py DECISIONS.md            # rapport seul
    python3 scripts/reorder_decisions.py DECISIONS.md --write    # applique

Idempotent : relancé sur un fichier déjà trié, il rapporte « déplacées 0 » et
n'écrit rien.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from pathlib import Path

ENTRY_RE = re.compile(r"^(\s*)- `docs/decisions/(adr-(\d{4})[^`]*)\.md`")
LIST_HEADER = "## ADR disponibles"
# La liste s'arrête au premier titre de niveau 2 qui suit les entrées.
SECTION_RE = re.compile(r"^## ")


class NotAPermutation(RuntimeError):
    """Le résultat n'est pas une permutation pure de l'entrée."""


def split_document(lines: list[str]) -> tuple[list[str], list[str], list[str]]:
    """Découpe en (tête, région de liste, queue).

    La région de liste va de la première entrée jusqu'au titre de section
    suivant (exclu). Tout le reste est rendu verbatim.
    """
    first = next((i for i, l in enumerate(lines) if ENTRY_RE.match(l)), None)
    if first is None:
        raise SystemExit("aucune entrée `docs/decisions/adr-….md` trouvée")

    end = len(lines)
    for i in range(first, len(lines)):
        if SECTION_RE.match(lines[i]):
            end = i
            break

    return lines[:first], lines[first:end], lines[end:]


def parse_blocks(region: list[str]) -> list[list[str]]:
    """Un bloc = une entrée et toutes ses lignes de continuation.

    Les lignes vides en fin de bloc sont retirées : elles se retrouveraient au
    milieu de l'index une fois les blocs réordonnés.
    """
    starts = [i for i, l in enumerate(region) if ENTRY_RE.match(l)]
    blocks = []
    for n, s in enumerate(starts):
        e = starts[n + 1] if n + 1 < len(starts) else len(region)
        block = region[s:e]
        while block and not block[-1].strip():
            block.pop()
        blocks.append(block)
    return blocks


def sort_key(block: list[str], index: int) -> tuple[int, int, int]:
    """(numéro d'ADR, parent avant addendum, ordre d'origine).

    Le troisième terme rend le tri stable : deux entrées de même ADR gardent
    leur ordre relatif — c'est ce qui maintient un parent devant ses addenda
    quand le slug ne les distingue pas.
    """
    m = ENTRY_RE.match(block[0])
    assert m is not None
    num = int(m.group(3))
    is_addendum = 1 if "addendum" in m.group(2) else 0
    return (num, is_addendum, index)


def check_permutation(before: list[list[str]], after: list[list[str]]) -> None:
    """Vérifie que `after` est bien `before` réordonné, sans perte ni ajout."""
    if len(before) != len(after):
        raise NotAPermutation(f"{len(before)} blocs en entrée, {len(after)} en sortie")

    key = lambda b: "\n".join(b)
    cb, ca = Counter(map(key, before)), Counter(map(key, after))
    if cb != ca:
        lost = list((cb - ca).elements())
        gained = list((ca - cb).elements())
        detail = []
        if lost:
            detail.append(f"{len(lost)} bloc(s) perdu(s), 1er : {lost[0][:80]!r}")
        if gained:
            detail.append(f"{len(gained)} bloc(s) apparu(s), 1er : {gained[0][:80]!r}")
        raise NotAPermutation(" ; ".join(detail))


def render(head: list[str], blocks: list[list[str]], tail: list[str]) -> list[str]:
    out = list(head)
    for b in blocks:
        out.extend(b)
    if tail:
        out.append("")
    out.extend(tail)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("path", type=Path)
    ap.add_argument("--write", action="store_true", help="applique le tri")
    args = ap.parse_args()

    original = args.path.read_text(encoding="utf-8")
    lines = original.split("\n")

    head, region, tail = split_document(lines)
    blocks = parse_blocks(region)

    # L'énumération explicite (plutôt qu'un `blocks.index`) garde l'ordre
    # d'origine exact même si deux blocs étaient identiques.
    ordered = [b for _, b in sorted(
        ((sort_key(b, i), b) for i, b in enumerate(blocks)),
        key=lambda pair: pair[0],
    )]

    try:
        check_permutation(blocks, ordered)
    except NotAPermutation as exc:
        print(f"REFUS D'ÉCRIRE — ce n'est pas une permutation pure : {exc}", file=sys.stderr)
        return 2

    moved = sum(1 for a, b in zip(blocks, ordered) if a is not b)
    multiline = sum(1 for b in blocks if len(b) > 1)
    longest = max(len(b) for b in blocks)
    addenda_top = [
        ENTRY_RE.match(b[0]).group(2)  # type: ignore[union-attr]
        for b in blocks
        if (m := ENTRY_RE.match(b[0])) and "addendum" in m.group(2) and not m.group(1)
    ]
    numbers = {sort_key(b, 0)[0] for b in blocks}
    gaps = [n for n in range(1, max(numbers) + 1) if n not in numbers]

    new_lines = render(head, ordered, tail)

    # Contrôle indépendant du tri : le multiensemble des lignes non vides doit
    # être identique. Ce qui disparaît doit être exclusivement des lignes vides.
    ne_before = Counter(l for l in lines if l.strip())
    ne_after = Counter(l for l in new_lines if l.strip())
    lines_ok = ne_before == ne_after

    print(
        f"entrées détectées {len(blocks)} · déplacées {moved} · "
        f"multi-lignes {multiline} (max {longest}) · "
        f"lignes {len(lines)} → {len(new_lines)}"
    )
    print(
        "permutation pure vérifiée · "
        + (f"ADR-{gaps[0]:04d} absent" if gaps else "aucun numéro manquant")
        + (" · lignes non vides identiques" if lines_ok else " · ⚠️ LIGNES NON VIDES DIVERGENTES")
    )
    print(f"{len(addenda_top)} addenda restés au premier niveau (voir étape 2)")

    if not lines_ok:
        print("REFUS D'ÉCRIRE — le contrôle des lignes non vides a échoué", file=sys.stderr)
        return 2

    if not args.write:
        return 0
    if moved == 0:
        print("déjà trié — rien à écrire")
        return 0

    args.path.write_text("\n".join(new_lines), encoding="utf-8")
    print(f"écrit : {args.path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
