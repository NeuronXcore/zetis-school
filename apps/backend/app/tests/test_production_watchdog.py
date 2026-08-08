"""Le watchdog « personne ne consomme la file » (ADR-0046, slice C).

🔴 **PIÈGE DE GREFFE, déjà payé par ce dépôt** : `watchdog.py` fait
`from app.core.queue import _redis, production_worker_alive` — un import **au niveau module**. Les
deux noms vivent donc dans le namespace de `watchdog`, et patcher `app.core.queue._redis` serait
**vert et SANS EFFET**. On greffe sur `app.modules.production.watchdog.*`.

⚠️ `activity` et `mailer`, eux, sont importés comme **modules** (`from app.core import mailer`), donc
l'attribut est résolu à l'appel : les patcher sur le module d'origine fonctionne. La différence
n'est pas un détail de style — c'est ce qui sépare un verrou d'un test qui ne teste rien.
"""

from datetime import UTC, datetime, timedelta

import pytest

from app.modules.production import watchdog


class FauxRedis:
    """Le strict nécessaire : `get`, `set(ex=…)`, `delete`. Rend des `bytes`, comme redis-py."""

    def __init__(self) -> None:
        self.donnees: dict[str, bytes] = {}

    def get(self, cle: str) -> bytes | None:
        return self.donnees.get(cle)

    def set(self, cle: str, valeur: str, ex: int | None = None) -> None:
        self.donnees[cle] = valeur.encode()

    def delete(self, *cles: str) -> None:
        for cle in cles:
            self.donnees.pop(cle, None)


T0 = datetime(2026, 8, 8, 12, 0, tzinfo=UTC)


@pytest.fixture
def monde(monkeypatch):
    """Un couloir de production avec un travail EN FILE et AUCUN worker — l'anomalie nominale."""
    faux = FauxRedis()
    envois: list[tuple[str, str]] = []

    monkeypatch.setattr(watchdog, "_redis", lambda: faux)
    monkeypatch.setattr(watchdog, "production_worker_alive", lambda: False)
    monkeypatch.setattr(
        watchdog.activity, "read", lambda _db: {"current": {"status": "queued"}, "queued": []}
    )
    monkeypatch.setattr(
        watchdog.mailer, "envoyer", lambda sujet, corps: (envois.append((sujet, corps)), True)[1]
    )
    return {"redis": faux, "envois": envois, "monkeypatch": monkeypatch}


# ─── Le verrou central : le plancher de 8 minutes ───────────────────────────────────────────


def test_le_plancher_de_8_minutes_releve_un_reglage_trop_court(monkeypatch, caplog) -> None:
    """🔴 LE VERROU CENTRAL DE LA SLICE.

    Un worker `idle` ne rebat qu'à chaque tour de boucle de dequeue — 3,8 min d'ancienneté relevés
    le 2026-08-08, TTL de clé Redis à 8 min. Sous 8, l'alarme sonne sur un worker en parfaite
    santé, et une alerte qui crie à tort est celle qu'on apprend à ignorer.
    """
    monkeypatch.setattr(watchdog.settings, "production_alert_after_minutes", 7)
    with caplog.at_level("WARNING"):
        assert watchdog.delai_alerte_minutes() == watchdog.PLANCHER_ALERTE_MINUTES == 8
    assert "plancher" in caplog.text, "relever en silence laisserait croire au réglage demandé"


def test_un_reglage_au_dessus_du_plancher_est_respecte(monkeypatch) -> None:
    monkeypatch.setattr(watchdog.settings, "production_alert_after_minutes", 15)
    assert watchdog.delai_alerte_minutes() == 15


def test_le_plancher_releve_au_lieu_de_refuser(monkeypatch) -> None:
    """Un `ValidationError` ferait tomber tout le backend pour un réglage d'alerting : la panne
    serait causée par son propre détecteur."""
    monkeypatch.setattr(watchdog.settings, "production_alert_after_minutes", 0)
    assert watchdog.delai_alerte_minutes() == 8  # ne lève pas


# ─── Quand l'alerte ne doit PAS partir ──────────────────────────────────────────────────────


def test_rien_en_file_aucune_alerte_meme_sans_worker(monde) -> None:
    """L'état normal de la nuit : pas de worker, pas de travail. Ce n'est un problème pour personne."""
    monde["monkeypatch"].setattr(
        watchdog.activity, "read", lambda _db: {"current": None, "queued": []}
    )
    assert watchdog.verifier_une_fois(None, maintenant=T0 + timedelta(hours=3)) == "rien-en-file"
    assert monde["envois"] == []


def test_worker_vivant_aucune_alerte(monde) -> None:
    monde["monkeypatch"].setattr(watchdog, "production_worker_alive", lambda: True)
    assert watchdog.verifier_une_fois(None, maintenant=T0) == "worker-vivant"
    assert monde["envois"] == []


def test_avant_le_seuil_aucune_alerte(monde) -> None:
    assert watchdog.verifier_une_fois(None, maintenant=T0) == "trop-tot"
    assert watchdog.verifier_une_fois(None, maintenant=T0 + timedelta(minutes=14)) == "trop-tot"
    assert monde["envois"] == []


# ─── Quand elle doit partir, et une seule fois ──────────────────────────────────────────────


def test_une_alerte_part_apres_le_seuil(monde) -> None:
    watchdog.verifier_une_fois(None, maintenant=T0)  # première observation
    assert watchdog.verifier_une_fois(None, maintenant=T0 + timedelta(minutes=16)) == "alerte-envoyee"
    assert len(monde["envois"]) == 1


def test_elle_ne_part_PAS_deux_fois_pour_le_meme_episode(monde) -> None:
    """Une alerte qui se répète toutes les 15 min est une alerte qu'on filtre — et un filtre, une
    fois posé, couvre aussi la vraie panne suivante."""
    watchdog.verifier_une_fois(None, maintenant=T0)
    watchdog.verifier_une_fois(None, maintenant=T0 + timedelta(minutes=16))
    for minutes in (20, 40, 90, 300):
        issue = watchdog.verifier_une_fois(None, maintenant=T0 + timedelta(minutes=minutes))
        assert issue == "deja-alertee"
    assert len(monde["envois"]) == 1


def test_le_verrou_se_leve_et_une_NOUVELLE_panne_realerte(monde) -> None:
    """Sans cette levée, la première panne de la vie du système serait la dernière signalée."""
    watchdog.verifier_une_fois(None, maintenant=T0)
    watchdog.verifier_une_fois(None, maintenant=T0 + timedelta(minutes=16))
    assert len(monde["envois"]) == 1

    # Un worker répond → l'anomalie a cessé, tout est oublié.
    monde["monkeypatch"].setattr(watchdog, "production_worker_alive", lambda: True)
    assert watchdog.verifier_une_fois(None, maintenant=T0 + timedelta(hours=1)) == "worker-vivant"
    assert monde["redis"].donnees == {}

    # Nouvelle panne, plus tard : elle doit réalerter.
    monde["monkeypatch"].setattr(watchdog, "production_worker_alive", lambda: False)
    t1 = T0 + timedelta(hours=2)
    watchdog.verifier_une_fois(None, maintenant=t1)
    assert watchdog.verifier_une_fois(None, maintenant=t1 + timedelta(minutes=16)) == "alerte-envoyee"
    assert len(monde["envois"]) == 2


# ─── Dégradation propre ─────────────────────────────────────────────────────────────────────


def test_sans_canal_le_chemin_complet_ne_leve_pas(monde) -> None:
    """Une alerte d'infrastructure ne doit pas pouvoir faire tomber ce qu'elle surveille.

    ⚠️ Et le verrou d'unicité ne doit PAS être posé : sinon, configurer le SMTP après coup
    n'enverrait jamais l'alerte de la panne en cours.
    """
    monde["monkeypatch"].setattr(watchdog.mailer, "envoyer", lambda *_a: False)
    watchdog.verifier_une_fois(None, maintenant=T0)
    assert watchdog.verifier_une_fois(None, maintenant=T0 + timedelta(minutes=16)) == "canal-inerte"
    assert watchdog.CLE_ENVOYEE not in monde["redis"].donnees


# ─── Ce que le message dit, et ne dit pas ───────────────────────────────────────────────────


def test_le_message_nomme_l_instrument_et_jamais_personne(monde) -> None:
    watchdog.verifier_une_fois(None, maintenant=T0)
    watchdog.verifier_une_fois(None, maintenant=T0 + timedelta(minutes=16))
    sujet, corps = monde["envois"][0]

    assert "production" in sujet.lower()
    assert "rien n'est perdu" in corps.lower(), "sans ça, une alarme n'est pas une information"
    assert "pnpm dev:worker" in corps, "une alerte sans le geste de réparation est à moitié utile"
    # Aucune donnée de Massimo : un compte et une durée, rien d'autre.
    for interdit in ("massimo", "skill", "notion", "lacune", "score"):
        assert interdit not in corps.lower()
