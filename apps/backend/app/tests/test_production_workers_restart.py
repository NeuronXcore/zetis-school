"""Redémarrer un worker (chantier A1) — les verrous de `POST /api/production/workers/{name}/restart`.

Le verrou qui compte est le premier : **non supervisé ⇒ refusé, avec le geste de remplacement dans
le motif**. « Redémarrer » n'existe que si quelque chose relance le worker ; ailleurs, le même
bouton tue le worker pour de bon — et un 409 motivé protège mieux qu'un avertissement qu'on lit
après avoir cliqué.
"""

import pytest

from app.core.config import settings
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.production import workers

PAPA = {"username": "papa", "role": "papa"}
CHILD = {"username": "massimo", "role": "child"}
API = "/api/production/workers"


def _as(role: dict) -> None:
    app.dependency_overrides[get_current_user] = lambda: role


@pytest.fixture(autouse=True)
def _papa(client_db) -> None:
    """⚠️ Dépend de `client_db` À DESSEIN — même motif que `test_settings_autonomy.py` : sans ça
    l'autouse passe AVANT lui, et le fixture de base réécrit l'override en rôle enfant."""
    _as(PAPA)


@pytest.fixture()
def _supervise(monkeypatch) -> None:
    monkeypatch.setattr(settings, "production_worker_supervised", True)


@pytest.fixture()
def _envois(monkeypatch) -> list[str]:
    """Capture les commandes d'arrêt SANS Redis : la CI n'en a pas, et un test qui arrêterait un
    vrai worker serait un test qui casse l'environnement qui le fait tourner."""
    envoyes: list[str] = []
    monkeypatch.setattr(workers, "noms_workers_production", lambda: ["w-prod-1", "w-prod-2"])

    monkeypatch.setattr(workers, "_envoyer_arret", envoyes.append)
    return envoyes


# --- 🔴 Le verrou de supervision -----------------------------------------------------------------


def test_non_supervise_est_refuse_avec_le_geste_de_remplacement(client_db, _envois) -> None:
    """Défaut = `False` = dev : rien ne relance le worker, donc on refuse de l'arrêter.

    Le motif dit QUOI FAIRE à la place (`pnpm dev:worker`) — un cadenas muet se lit comme une
    panne, et un refus sans issue se contourne."""
    client, _ = client_db

    reponse = client.post(f"{API}/w-prod-1/restart")

    assert reponse.status_code == 409
    assert "pnpm dev:worker" in reponse.json()["detail"]
    assert _envois == []  # rien n'est parti : le refus précède toute commande


def test_supervise_envoie_l_arret_gracieux_au_bon_worker(client_db, _supervise, _envois) -> None:
    """202, pas 200 : l'ordre est ACCEPTÉ, pas exécuté — la pièce en cours se termine d'abord."""
    client, _ = client_db

    reponse = client.post(f"{API}/w-prod-2/restart")

    assert reponse.status_code == 202
    assert _envois == ["w-prod-2"]
    # Le corps dit ce qui va se passer : terminer la pièce, sortir, être relancé à jour.
    assert "pièce en cours" in reponse.json()["detail"]


def test_un_worker_inconnu_est_un_404_et_rien_ne_part(client_db, _supervise, _envois) -> None:
    """Un nom périmé (worker déjà mort, liste pas rafraîchie) ne doit pas produire un envoi dans
    le vide qui aurait l'air d'avoir réussi."""
    client, _ = client_db

    reponse = client.post(f"{API}/w-fantome/restart")

    assert reponse.status_code == 404
    assert "w-fantome" in reponse.json()["detail"]
    assert _envois == []


def test_redis_injoignable_rend_503_et_le_dit(client_db, _supervise, monkeypatch) -> None:
    """Best-effort, même doctrine que `core/queue.py` : on préfère annoncer un doute qu'affirmer
    une santé — et le corps dit que RIEN n'a été envoyé."""
    client, _ = client_db

    def _boom() -> list[str]:
        raise ConnectionError("redis down")

    monkeypatch.setattr(workers, "noms_workers_production", _boom)

    reponse = client.post(f"{API}/w-prod-1/restart")

    assert reponse.status_code == 503
    assert "aucune commande" in reponse.json()["detail"]


# --- Portée --------------------------------------------------------------------------------------


def test_le_role_enfant_est_refuse(client_db, _supervise) -> None:
    """Le worker est un objet de la machine ; l'enfant n'a pas à savoir qu'elle a des rouages."""
    client, _ = client_db
    _as(CHILD)

    assert client.post(f"{API}/w-prod-1/restart").status_code == 403
