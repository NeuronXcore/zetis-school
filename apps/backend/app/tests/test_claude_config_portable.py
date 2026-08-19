"""Test-verrou — la configuration `.claude/` versionnée ne porte le chemin d'AUCUNE machine.

Le 2026-08-17, `graphify install --project` a écrit dans les deux hooks `PreToolUse` de
`.claude/settings.json` — fichier **versionné et partagé** — un chemin absolu propre à la machine
qui lançait l'installation :

    /Users/atlas/.local/share/uv/tools/graphifyy/bin/graphify hook-guard search

Mesuré : quand ce chemin n'existe pas, le hook sort en **127**, à *chaque* appel Bash, Grep, Read et
Glob. Or ZETIS se développe sur **deux machines** (Mac Studio + MacBook). Le nom court `graphify`
rend une sortie strictement identique : le chemin absolu ne payait rien et coûtait la portabilité.

🔴 **Pourquoi ce verrou existe et pas seulement une note** : `graphify install --project` **réécrit**
ce fichier. Le correctif est donc défait par la prochaine réinstallation ou mise à jour de l'outil,
en silence, sans que personne ne relise un JSON de configuration. Une note dans `MEMORY.md` ne
survit pas à ça — un test, oui.

⚠️ `.claude/settings.local.json` est **exclu** : il est gitignoré (cf. `.gitignore`, « réglages
locaux/personnels »), il ne part sur aucune autre machine, et un chemin absolu y est légitime.

Un échec ici ne se répare pas en ajustant l'assertion : il se répare en remplaçant le chemin par la
commande, dans `.claude/settings.json`.
"""

import json
import re
from pathlib import Path

CONFIG = Path(__file__).resolve().parents[4] / ".claude"
REGLAGES = CONFIG / "settings.json"

#: Le seul fichier de `.claude/` qui ne soit pas versionné — donc le seul qui ait le droit
#: de nommer une machine.
_HORS_VERSION = {"settings.local.json"}

#: Racines de répertoire personnel, les trois plateformes.
_CHEMIN_MACHINE = re.compile(r"/Users/|/home/|[A-Za-z]:\\\\?Users")


def _fichiers_versionnes() -> list[Path]:
    """⚠️ `.claude/worktrees/` est EXCLU, et ce n'est pas une tolérance (2026-08-19).

    Ce répertoire est déjà hors-dépôt (`.git/info/exclude`) : chaque worktree y est une copie
    COMPLÈTE du projet — `MEMORY.md`, `.venv`, tout. Le balayer faisait échouer ce verrou (donc
    TOUT `git push`, via le hook pre-push) dès qu'une session parallèle avait un worktree vivant :
    le verrou contredisait l'exclusion que le dépôt avait déjà posée. Un verrou de config
    VERSIONNÉE ne lit que ce qui se versionne."""
    worktrees = CONFIG / "worktrees"
    return sorted(
        f
        for f in CONFIG.rglob("*")
        if f.is_file()
        and f.name not in _HORS_VERSION
        and not f.name.startswith(".graphify_")
        and worktrees not in f.parents
    )


def test_le_verrou_voit_bien_des_fichiers() -> None:
    """Garde-fou : un parcours qui ne trouve rien validerait le vide."""
    fichiers = _fichiers_versionnes()
    assert REGLAGES.is_file(), f"{REGLAGES} introuvable"
    assert len(fichiers) >= 5, f"seulement {len(fichiers)} fichier(s) : {[f.name for f in fichiers]}"


def test_aucun_chemin_de_machine_dans_la_config_versionnee() -> None:
    """Un `/Users/<qui>` versionné casse le dépôt sur toute autre machine."""
    fautifs: list[str] = []
    for fichier in _fichiers_versionnes():
        try:
            texte = fichier.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue  # binaire : rien à y lire
        for numero, ligne in enumerate(texte.splitlines(), start=1):
            if _CHEMIN_MACHINE.search(ligne):
                relatif = fichier.relative_to(CONFIG.parent)
                fautifs.append(f"{relatif}:{numero} → {ligne.strip()[:100]}")

    assert not fautifs, (
        "Chemin de machine dans une configuration VERSIONNÉE :\n  "
        + "\n  ".join(fautifs)
        + "\nSur une autre machine ce chemin n'existe pas. Utiliser la commande nue "
        "(résolue par le PATH), pas son chemin absolu."
    )


def test_aucun_hook_n_invoque_un_executable_par_chemin_absolu() -> None:
    """Complète le test précédent : `/opt/homebrew/...` n'est pas sous `/Users/` mais casse pareil.

    Un hook versionné doit nommer sa commande et laisser le PATH la résoudre.
    """
    reglages = json.loads(REGLAGES.read_text(encoding="utf-8"))
    fautifs: list[str] = []
    for evenement, entrees in reglages.get("hooks", {}).items():
        for entree in entrees:
            for hook in entree.get("hooks", []):
                commande = str(hook.get("command", "")).strip()
                if commande.startswith("/"):
                    fautifs.append(f"{evenement} (matcher={entree.get('matcher')!r}) → {commande[:90]}")

    assert not fautifs, (
        "Hook(s) invoquant un exécutable par chemin absolu :\n  "
        + "\n  ".join(fautifs)
        + "\nCe chemin dépend de la machine qui a installé l'outil."
    )
