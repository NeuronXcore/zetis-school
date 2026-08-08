"""Le garde-fou anti-doublon du worker de production (ADR-0046, slice B).

🔴 **Ces verrous existent parce que le motif de détection a DEUX façons d'être faux**, et que les
deux ont été rencontrées pour de vrai le 2026-08-08 — l'une en production (un troisième worker
lancé sans que rien ne le signale), l'autre en écrivant ce correctif.

⚠️ **Limite assumée** : ces tests valident le motif sous le moteur `re` de Python, alors que
`pgrep` l'applique en ERE POSIX. Les deux s'accordent sur ce motif — les deux défauts ci-dessous
sont reproductibles dans les deux moteurs, et le motif retenu a été vérifié contre de vrais
processus. Un test hermétique ne peut pas aller plus loin sans lancer des processus, ce qui le
rendrait dépendant de la machine.
"""

import re
import subprocess

from app.production_worker import MOTIF_PROCESSUS_WORKER, workers_deja_actifs

# Les deux formes réelles, relevées avec `ps -o command=` sur des workers en vie.
LIGNES_DE_VRAIS_WORKERS = [
    ".venv/bin/python -m app.production_worker",
    "/usr/local/bin/python -m app.production_worker",
    "python -m app.production_worker",
    "python3.11 -m app.production_worker",
]

# Le wrapper que `pnpm dev:worker` et `scripts/dev.sh` interposent. Ce n'est PAS un worker.
LIGNE_DU_WRAPPER_SH = "sh -c cd apps/backend && .venv/bin/python -m app.production_worker"


def test_le_motif_attrape_les_vraies_lignes_de_worker() -> None:
    motif = re.compile(MOTIF_PROCESSUS_WORKER)
    for ligne in LIGNES_DE_VRAIS_WORKERS:
        assert motif.search(ligne), f"le worker échapperait au garde-fou : {ligne!r}"


def test_le_motif_n_attrape_PAS_le_wrapper_shell() -> None:
    """🔴 La SUR-détection — le défaut le plus contre-intuitif des deux.

    `^(.*/)?python[0-9.]* -m app\\.production_worker$` a l'air juste et ne l'est pas : `(.*/)?`
    avale `sh -c cd apps/backend && .venv/bin/`, qui se termine par un `/`. Le garde-fou attraperait
    alors **le shell qui vient de le lancer**, et le worker refuserait de démarrer à cause de son
    propre parent — un blocage permanent, sur une machine où aucun worker ne tourne.
    """
    assert not re.compile(MOTIF_PROCESSUS_WORKER).search(LIGNE_DU_WRAPPER_SH), (
        "le motif attrape le wrapper shell : le worker se bloquerait lui-même"
    )


def test_le_motif_n_est_pas_une_alternance_echappee() -> None:
    """🔴 La SOUS-détection — le défaut réellement survenu le 2026-08-08.

    `pgrep -fl "production_worker\\|rq worker"` cherche un `|` LITTÉRAL en ERE. Il ne rend jamais
    rien, donc il autorise toujours le démarrage : c'est ce faux négatif qui a laissé monter un
    troisième worker sur un seul GPU.
    """
    assert "\\|" not in MOTIF_PROCESSUS_WORKER, (
        "`\\|` n'est pas une alternance en ERE — ce motif ne trouverait JAMAIS rien"
    )


def test_le_motif_est_ancre_aux_deux_bouts() -> None:
    """Sans ancres, `[^ ]*` ne protège de rien : le motif redeviendrait une recherche de sous-chaîne."""
    assert MOTIF_PROCESSUS_WORKER.startswith("^")
    assert MOTIF_PROCESSUS_WORKER.endswith("$")


def test_le_pid_courant_est_exclu(monkeypatch) -> None:
    """Sans cette exclusion, le worker se verrait lui-même et refuserait toujours de démarrer."""

    def faux_pgrep(*_a, **_k):
        return subprocess.CompletedProcess(args=[], returncode=0, stdout="4242\n4243\n", stderr="")

    monkeypatch.setattr(subprocess, "run", faux_pgrep)
    assert workers_deja_actifs(pid_courant=4242) == [4243]


def test_aucun_autre_worker_rend_une_liste_vide(monkeypatch) -> None:
    def faux_pgrep(*_a, **_k):
        # `pgrep` sort en 1 quand rien ne correspond : ce n'est pas une erreur.
        return subprocess.CompletedProcess(args=[], returncode=1, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", faux_pgrep)
    assert workers_deja_actifs(pid_courant=4242) == []


def test_pgrep_absent_laisse_demarrer(monkeypatch) -> None:
    """Best-effort assumé : on ne refuse pas sur une mesure qu'on n'a pas.

    Un faux positif ici empêcherait le SEUL worker de la machine de tourner — c'est le défaut
    d'origine de l'ADR-0046, à l'envers, et en pire puisqu'il serait permanent.
    """

    def pgrep_introuvable(*_a, **_k):
        raise FileNotFoundError("pgrep")

    monkeypatch.setattr(subprocess, "run", pgrep_introuvable)
    assert workers_deja_actifs(pid_courant=4242) == []


def test_une_sortie_pgrep_illisible_ne_leve_pas(monkeypatch) -> None:
    def faux_pgrep(*_a, **_k):
        return subprocess.CompletedProcess(args=[], returncode=0, stdout="pas-un-pid\n4243\n", stderr="")

    monkeypatch.setattr(subprocess, "run", faux_pgrep)
    assert workers_deja_actifs(pid_courant=4242) == [4243]
