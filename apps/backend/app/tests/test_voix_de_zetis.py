"""VERROU DE DÉPÔT — Papa n'existe pas dans l'espace de Massimo (addendum ADR-0025 §16).

Jumeau serveur de `apps/frontend-massimo/src/voix-de-zetis.test.ts`. Il en faut **deux**, et le
constat qui l'impose a été fait le 2026-08-10 : le libellé du bouton de demande dans le chat de
Massimo est **fabriqué ici**, pas dans le front (`ChatAction.label`, servi tel quel). Un verrou
qui n'aurait balayé que le front aurait été **vert sur trois phrases fautives** — dont celle que
Massimo lit le plus souvent quand ZETIS n'a pas de contenu.

Le module `chat` est le seul du backend à composer du français **destiné à l'élève** ; ailleurs,
« Papa » n'apparaît que dans des docstrings et des commentaires, qui décrivent le produit et
doivent pouvoir le nommer.
"""

import re
from pathlib import Path

CHAT = Path(__file__).resolve().parents[1] / "modules" / "chat"

# Ligne de code qui n'est ni un commentaire ni le corps d'une docstring : la doctrine s'ÉCRIT, et
# elle nomme Papa pour expliquer pourquoi il ne doit pas s'afficher.
_LITTERAL = re.compile(r'(?:f?"[^"]*"|f?\'[^\']*\')')
_PAPA = re.compile(r"\bpapa\b", re.IGNORECASE)


def _chaines_servies(source: str) -> list[tuple[int, str]]:
    """Littéraux d'une ligne de code — les docstrings triple-quotes sont retirées d'abord."""
    sans_docstring = re.sub(r'"""[\s\S]*?"""', "", source)
    trouvees: list[tuple[int, str]] = []
    for numero, ligne in enumerate(sans_docstring.split("\n"), start=1):
        nue = ligne.split("#")[0]
        for litteral in _LITTERAL.findall(nue):
            if _PAPA.search(litteral):
                trouvees.append((numero, litteral))
    return trouvees


def test_le_chat_ne_nomme_jamais_papa_a_massimo() -> None:
    """Aucune phrase composée pour Massimo ne désigne l'adulte.

    ZETIS parle à la première personne dans le chat : « je le note » plutôt que « je le note pour
    Papa ». Nommer un tiers dans sa propre conversation le ferait sortir de sa voix — et cette
    voix doit tenir le jour où ZETIS produit seul (décision du 2026-08-02 sur les missions).
    """
    coupables: list[str] = []
    for fichier in sorted(CHAT.glob("*.py")):
        for numero, litteral in _chaines_servies(fichier.read_text(encoding="utf-8")):
            coupables.append(f"{fichier.name}:{numero} — {litteral}")

    assert not coupables, "Papa a reparu dans la voix de ZETIS :\n" + "\n".join(coupables)
