"""Test-verrou — `docs/devops/ports.md` ne doit pas mentir.

Une carte écrite à la main ment le jour où quelqu'un ajoute un port sans y penser. Ce dépôt l'a
vécu deux fois : la table « Ports recommandés en développement » de `DEPLOYMENT.md` donnait les
ports de la PROD comme ports de dev et ignorait six paires de `launch.json` ; et la carte de la
page paramètres « a menti deux fois le jour de sa livraison » (signal écrit d'avance par
l'ADR-0062 : *si elle dérive, elle doit être DÉRIVÉE, pas écrite*).

La carte porte de la prose qu'aucun script ne saurait produire — le piège du Wi-Fi `en0`, la
raison de l'inertie de MinIO, le garde-fou de `pnpm dev`. Elle est donc écrite, et **gardée** :
ce verrou n'exige pas qu'elle soit belle, il exige qu'elle soit **complète**. Tout port que les
sources déclarent doit y figurer, et toute collision doit y être nommée.

Complémentaire de `test_compose_ports_cohabitent.py`, qui garde les compose entre eux et ne dit
rien de la documentation ni de `launch.json`.

Un échec ici ne se répare pas en ajustant l'assertion : il se répare en écrivant le port manquant
dans la carte.
"""

import json
import re
from pathlib import Path

# Le parseur de compose vit déjà dans le verrou voisin : le redéclarer ici en ferait une seconde
# formulation à tenir synchrone — la dette exacte que `servable_quiz_ids` traîne dans ce dépôt.
from .test_compose_ports_cohabitent import DEV, PROD, _ports_publies

_RACINE = Path(__file__).resolve().parents[4]
CARTE = _RACINE / "docs" / "devops" / "ports.md"
LAUNCH = _RACINE / ".claude" / "launch.json"


def _ports_de_la_carte() -> set[int]:
    """Tout nombre à quatre chiffres du domaine des ports, où qu'il soit dans la page."""
    texte = CARTE.read_text(encoding="utf-8")
    return {int(n) for n in re.findall(r"\b(\d{4})\b", texte) if 1024 <= int(n) <= 65535}


def _ports_de_launch_json() -> dict[int, list[str]]:
    """{port: [noms des entrées]} — une liste, car deux entrées peuvent réclamer le même port."""
    conf = json.loads(LAUNCH.read_text(encoding="utf-8"))
    ports: dict[int, list[str]] = {}
    for entree in conf.get("configurations", []):
        nom, port = entree.get("name"), entree.get("port")
        if nom and port:
            ports.setdefault(int(port), []).append(nom)
    return ports


def test_la_carte_existe_et_le_parseur_trouve_quelque_chose() -> None:
    """Garde-fou du verrou : un parseur qui ne trouve rien passerait tous les tests."""
    assert CARTE.is_file(), f"{CARTE} manque — la carte des ports est la source unique."
    assert len(_ports_de_la_carte()) >= 10, _ports_de_la_carte()
    assert len(_ports_de_launch_json()) >= 10, _ports_de_launch_json()


def test_tout_port_de_launch_json_figure_dans_la_carte() -> None:
    """Une paire ajoutée sans un mot dans la carte rendrait la carte fausse le jour même."""
    documentes = _ports_de_la_carte()
    manquants = {p: noms for p, noms in _ports_de_launch_json().items() if p not in documentes}
    assert not manquants, (
        "Ports de `.claude/launch.json` absents de docs/devops/ports.md : "
        + ", ".join(f"{p} ({', '.join(noms)})" for p, noms in sorted(manquants.items()))
        + ". La carte est la source unique : l'y écrire, ne pas relâcher ce test."
    )


def test_tout_port_publie_par_un_compose_figure_dans_la_carte() -> None:
    """Y compris les publications inertes : un port réservé qui disparaît de la carte se reprend."""
    documentes = _ports_de_la_carte()
    manquants = {}
    for fichier in (DEV, PROD):
        for port, service in _ports_publies(fichier).items():
            if port not in documentes:
                manquants[port] = f"{fichier.name}:{service}"
    assert not manquants, (
        "Ports publiés par un compose et absents de docs/devops/ports.md : "
        + ", ".join(f"{p} ({o})" for p, o in sorted(manquants.items()))
    )


#: Le vocabulaire qui SIGNALE un heurt, par opposition au simple fait de lister deux fois un port.
#: 🔴 Exiger seulement que les deux noms voisinent ne verrouille RIEN : dans un tableau, deux
#: lignes successives se citent l'une l'autre à moins de 400 caractères, et le test passe alors
#: même si l'avertissement a été supprimé — mesuré à la contre-épreuve du 2026-08-21, où le
#: verrou est resté vert sur une carte amputée de son paragraphe. C'est le TERME qui mord.
TERMES_DE_COLLISION = ("heurt", "collision", "réclamé", "strictport", "tourner ensemble")


def test_toute_collision_de_launch_json_est_signalee_dans_la_carte() -> None:
    """Deux entrées sur un même port : la carte doit le DIRE, pas seulement lister le port.

    `--strictPort` fait échouer la seconde entrée à démarrer au lieu de glisser sur un port
    voisin — un lecteur qui ne le sait pas cherche la panne ailleurs. Au 2026-08-21 la collision
    connue est 5177 (`massimo-dev2` et `papa-srs`).
    """
    texte = CARTE.read_text(encoding="utf-8")
    for port, noms in sorted(_ports_de_launch_json().items()):
        if len(noms) < 2:
            continue
        signale = False
        for trouve in re.finditer(rf"\b{port}\b", texte):
            fenetre = texte[max(0, trouve.start() - 400) : trouve.start() + 400]
            cite_les_deux = all(nom in fenetre for nom in noms)
            avertit = any(terme in fenetre.lower() for terme in TERMES_DE_COLLISION)
            if cite_les_deux and avertit:
                signale = True
                break
        assert signale, (
            f"Le port {port} est réclamé par {noms} dans `launch.json`, et la carte ne "
            "l'AVERTIT nulle part : aucun passage ne cite les deux entrées avec un terme de "
            f"heurt ({', '.join(TERMES_DE_COLLISION)}). Les lister dans deux lignes de tableau "
            "ne suffit pas — un lecteur croira que les deux paires cohabitent."
        )
