"""Test-verrou de l'ADR-0046 §1 — la prod se relève seule, ou elle ne se relève pas.

L'ADR-0046 pose `restart: unless-stopped` sur le `worker` et en donne la doctrine :

> « Un dispositif dont une pièce doit être lancée à la main finit toujours par tourner sans elle. »

Elle n'a d'abord été appliquée qu'au worker et à `worker-media` (ADR-0031). Mesuré le 2026-08-17 :
les **six autres** services de `docker-compose.prod.yml` n'avaient **aucune** politique de
redémarrage. Après un arrêt du Mac Studio, la base, le backend et les deux frontends ne revenaient
pas — le worker, lui, se relevait dans le vide. Une pièce supervisée dans un dispositif qui ne
l'est pas ne supervise rien.

Ce fichier n'est pas un test de régression ordinaire : il tient la règle pour le **9e service**,
celui que personne n'a encore écrit. C'est là que la propriété se reperd — pas dans les huit qu'on
vient de corriger.

⚠️ `unless-stopped`, jamais `always`, et c'est un arbitrage : un `pnpm prod:down` volontaire doit
rester un arrêt. `always` ferait repartir les conteneurs au redémarrage du démon alors qu'un humain
les avait arrêtés.

Un échec ici ne se répare pas en ajustant l'assertion : il se répare en ajoutant la ligne au
service qui la perd.
"""

import re
from pathlib import Path

COMPOSE = Path(__file__).resolve().parents[4] / "docker-compose.prod.yml"

#: Un service = une clé à exactement deux espaces d'indentation dans le bloc `services:`.
_SERVICE = re.compile(r"^  ([a-z0-9][a-z0-9-]*):\s*$")


def _blocs_de_services() -> dict[str, list[str]]:
    """Rend {nom du service: ses lignes}, sans dépendre d'un parseur YAML.

    PyYAML **n'est pas déclaré** dans `pyproject.toml` : il se trouve dans le venv local sans y
    avoir été demandé. S'en servir ici ferait passer le test en local et échouer la CI — le défaut
    exact que l'en-tête de `.github/workflows/ci.yml` documente pour `faster_whisper` et `piper`.
    """
    lignes = COMPOSE.read_text(encoding="utf-8").splitlines()
    blocs: dict[str, list[str]] = {}
    courant: str | None = None
    dans_services = False

    for ligne in lignes:
        if not ligne.startswith(" ") and ligne.strip():
            # Retour à la colonne 0 : `services:`, `networks:`, `volumes:`…
            dans_services = ligne.startswith("services:")
            courant = None
            continue
        if not dans_services:
            continue
        trouve = _SERVICE.match(ligne)
        if trouve:
            courant = trouve.group(1)
            blocs[courant] = []
        elif courant is not None:
            blocs[courant].append(ligne)
    return blocs


def test_le_fichier_prod_existe_et_declare_des_services() -> None:
    """Garde-fou du verrou lui-même : un parseur qui ne trouve rien passerait tous les tests."""
    blocs = _blocs_de_services()
    assert COMPOSE.is_file(), f"{COMPOSE} introuvable"
    assert len(blocs) >= 8, f"seulement {len(blocs)} service(s) reconnu(s) : {sorted(blocs)}"


def test_chaque_service_de_prod_se_releve_seul() -> None:
    """ADR-0046 §1 — aucun service de production sans politique de redémarrage."""
    sans_policy = [
        nom
        for nom, lignes in _blocs_de_services().items()
        if not any(l.strip() == "restart: unless-stopped" for l in lignes)
    ]
    assert not sans_policy, (
        "Services de production sans `restart: unless-stopped` : "
        f"{sorted(sans_policy)}. Un service qui ne revient pas après un redémarrage du Mac "
        "rend muette la supervision des autres (ADR-0046 §1)."
    )


def test_aucun_service_n_utilise_always() -> None:
    """`always` ferait redémarrer ce qu'un humain a volontairement arrêté (`pnpm prod:down`)."""
    fautifs = [
        nom
        for nom, lignes in _blocs_de_services().items()
        if any(l.strip() == "restart: always" for l in lignes)
    ]
    assert not fautifs, f"`restart: always` interdit, utiliser `unless-stopped` : {sorted(fautifs)}"
