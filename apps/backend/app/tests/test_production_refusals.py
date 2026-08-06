"""Un régulateur qui refuse laisse une trace (addendum 2 ADR-0041 §21).

Le trou bouché ici n'est pas un bug : c'est un silence. `triggers.py` attrapait déjà proprement le
`409` d'un régulateur et le rangeait dans un compte rendu — le retour d'un job RQ **que personne ne
lit**. Un refus survenu à 3 h du matin disparaissait là, et la journée passait sans production ni
explication.

⚠️ Le test qui compte le plus est la CONTRE-ÉPREUVE (`..._MANUEL_ne_laisse_AUCUNE_trace`) : sans
elle, une implémentation qui persiste **tous** les refus passerait le premier test au vert.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import select

import app.db.models as m
from app.core.config import settings
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.production import activity, refusals, runs, triggers
from app.tests.test_production_triggers import _arm, _controle, _seed


def _as_parent() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def _sature_le_plafond_automatique(db, chapter) -> None:
    """Assez de lots automatiques récents pour que le régulateur de volume dise non."""
    now = datetime.now(timezone.utc)
    for i in range(settings.production_auto_max_runs):
        db.add(
            m.ProductionRun(
                student_id=db.scalar(select(m.StudentProfile)).id,
                trigger="agenda",
                authorized_by="parent_rule",
                status="done",
                chapter_id=chapter.id,
                created_at=now - timedelta(hours=i + 1),
            )
        )
    db.commit()


def test_un_refus_automatique_laisse_une_trace(client_db) -> None:
    """Le scan nocturne refuse, et ZETIS s'en souvient — motif compris."""
    _, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        _arm(db)
        _sature_le_plafond_automatique(db, chapter)
        _controle(db, chapter)

        assert triggers.scan_agenda(db)["created"] == []

        retenus = db.scalars(select(m.ProductionRefusal)).all()
        assert len(retenus) == 1
        refus = retenus[0]
        assert refus.regulator == "auto_volume"
        assert refus.trigger == "agenda"
        assert refus.chapter_id == chapter.id
        # Le motif est rendu TEL QUEL (§8) : une table « technique → phrase douce » a été écartée.
        assert "plafond" in refus.detail
        assert refus.acknowledged_at is None


# ─── LA CONTRE-ÉPREUVE ─────────────────────────────────────────────────────────────────────────
def test_un_refus_MANUEL_ne_laisse_AUCUNE_trace(client_db) -> None:
    """🔴 Sans ce test, « persister tous les refus » passerait le précédent au vert.

    Quand Papa clique, il lit le motif à l'écran dans la seconde. Le retenir en ferait une
    notification en double — et elle resterait affichée après qu'il a compris.
    """
    _, Session = client_db
    with Session() as db:
        _seed(db)
        # Le chemin réel, sans passer par le filtre en le sachant : le régulateur d'arriéré est le
        # seul des cinq qui s'applique AUSSI à un geste manuel.
        rendu = refusals.record(
            db,
            trigger="manual",
            regulator="pending_backlog",
            detail="30 contenus attendent déjà votre relecture.",
        )
        assert rendu is None
        assert db.scalars(select(m.ProductionRefusal)).all() == []


def test_un_defaut_de_donnee_n_est_PAS_un_refus(client_db) -> None:
    """⚠️ La garantie sur laquelle repose le tri de `triggers.py`.

    Un chapitre introuvable est un défaut de donnée, pas une décision de politique. L'afficher sous
    le mot « refusé » ferait passer un bug pour un régulateur qui fonctionne — et il resterait à
    l'écran jusqu'à ce que Papa l'acquitte, sans que rien ne soit réparable de son côté.
    """
    _, Session = client_db
    with Session() as db:
        _seed(db)
        with pytest.raises(HTTPException) as capture:
            runs.create_run(db, chapter_id=999_999, trigger="manual", authorized_by="parent_direct")
        assert capture.value.status_code == 404
        assert not isinstance(capture.value, runs.ProductionRefused), (
            "un 404 qui hériterait de ProductionRefused entrerait dans la table des refus"
        )


def test_le_scan_ne_retient_QUE_les_refus_de_regulateur(client_db, monkeypatch) -> None:
    """La garde `isinstance` de `triggers.py`, couverte pour de bon.

    Le test précédent prouve qu'un `404` n'hérite pas de `ProductionRefused` — c'est la
    PRÉCONDITION. Celui-ci prouve que le scan s'en sert : sans lui, retirer le `isinstance`
    laisserait tous les tests au vert, puisque aucun autre n'amène une exception non-régulateur
    jusqu'à ce `except`.
    """
    _, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        _arm(db)
        _controle(db, chapter)

        def _tombe(*_args, **_kwargs):
            raise HTTPException(404, detail="Chapitre introuvable.")

        monkeypatch.setattr(triggers.runs, "create_run", _tombe)
        assert triggers.scan_agenda(db)["created"] == []

        assert db.scalars(select(m.ProductionRefusal)).all() == [], (
            "un défaut de donnée serait affiché à Papa sous le mot « refusé », et il resterait "
            "jusqu'à ce qu'il l'acquitte sans avoir rien à réparer"
        )


def test_un_regulateur_hors_vocabulaire_ne_passe_pas() -> None:
    """Le vocabulaire est fermé : un code inconnu se signale, il ne se rend pas.

    Sans cette garde, une faute de frappe produirait un refus que l'écran ne saurait pas classer,
    et qui se lirait comme un état inconnu plutôt que comme une erreur de code.
    """
    with pytest.raises(AssertionError):
        runs.ProductionRefused("plafond_invente", "peu importe")


def test_activity_sert_les_refus_A_PART_des_echecs(client_db) -> None:
    """⚠️ Deux listes, jamais une. Un régulateur qui dit non n'est pas une panne.

    Les confondre apprendrait à Papa à ignorer les deux — et lui ferait chercher une réparation là
    où il n'y a qu'une limite qu'il a lui-même posée.
    """
    client, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        _arm(db)
        _sature_le_plafond_automatique(db, chapter)
        _controle(db, chapter)
        triggers.scan_agenda(db)

    _as_parent()
    body = client.get("/api/production/activity").json()
    assert body["failed"] == [], "un refus n'est pas un échec"
    assert len(body["refused"]) == 1
    assert body["refused"][0]["regulator"] == "auto_volume"
    assert "plafond" in body["refused"][0]["detail"]


def test_un_refus_acquitte_ne_revient_pas(client_db) -> None:
    """Serveur, jamais `localStorage` : sinon il reviendrait au rechargement et sur chaque appareil."""
    client, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        _arm(db)
        _sature_le_plafond_automatique(db, chapter)
        _controle(db, chapter)
        triggers.scan_agenda(db)
        refus_id = db.scalar(select(m.ProductionRefusal.id))

    _as_parent()
    assert client.post(f"/api/production/activity/refusal/{refus_id}/ack").status_code == 204
    assert client.get("/api/production/activity").json()["refused"] == []

    # Et un identifiant inconnu se dit, il ne passe pas en silence.
    assert client.post("/api/production/activity/refusal/999999/ack").status_code == 404


def test_le_refus_ne_consomme_pas_l_echeance_et_ne_se_dedouble_pas(client_db) -> None:
    """Deux réveils, deux refus — et l'échéance reste éligible.

    ⚠️ C'est volontaire et il faut le savoir : retenir un refus ne le déduplique pas. Un scan qui
    tourne toutes les trois heures sur une limite non levée empilera ses refus, et c'est
    exactement ce que Papa doit voir — la limite n'a pas bougé, ZETIS n'a rien produit de la
    journée. En masquer les répétitions ferait croire à un incident isolé.
    """
    _, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        _arm(db)
        _sature_le_plafond_automatique(db, chapter)
        item = _controle(db, chapter)

        triggers.scan_agenda(db)
        triggers.scan_agenda(db)

        assert len(db.scalars(select(m.ProductionRefusal)).all()) == 2
        # L'échéance n'a pas été consommée : elle redeviendra productible dès la limite levée.
        assert runs.run_exists_for(db, trigger="agenda", reference_id=item.id) is False


def test_les_refus_sont_bornes_comme_le_reste(client_db) -> None:
    """Au-delà de 20, l'écran ne se lit plus — et le popover borne déjà tout de la même façon."""
    _, Session = client_db
    with Session() as db:
        _seed(db)
        for i in range(refusals.LIMITE + 5):
            refusals.record(
                db, trigger="agenda", regulator="auto_volume", detail=f"refus {i}"
            )
        assert len(refusals.unacknowledged(db)) == refusals.LIMITE
        # Et ce sont les plus RÉCENTS : un refus d'il y a trois jours n'apprend plus rien.
        assert refusals.unacknowledged(db)[0].detail == f"refus {refusals.LIMITE + 4}"


def test_le_refus_ne_perturbe_pas_la_lecture_d_activite(client_db) -> None:
    """Sans rien en vol, la présence d'un refus ne fabrique pas un travail courant."""
    client, Session = client_db
    with Session() as db:
        _seed(db)
        refusals.record(db, trigger="agenda", regulator="pending_backlog", detail="trop d'attente")

    _as_parent()
    body = client.get("/api/production/activity").json()
    assert body["current"] is None
    assert body["queued_count"] == 0
    assert len(body["refused"]) == 1


def test_lecture_directe_du_service(client_db) -> None:
    """`activity.acknowledge` refuse un identifiant inconnu plutôt que de ne rien faire."""
    _, Session = client_db
    with Session() as db:
        with pytest.raises(HTTPException) as capture:
            activity.acknowledge(db, kind="refusal", item_id=424_242)
        assert capture.value.status_code == 404
