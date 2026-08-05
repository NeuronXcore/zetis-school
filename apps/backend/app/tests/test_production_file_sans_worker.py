"""Une file sans consommateur n'est pas une attente — c'est un arrêt (2026-08-05).

## Le défaut que ces verrous tiennent

Quatre lots `fiche` identiques sur la notion « Complément d'objet » ont attendu six heures dans
Redis. `scripts/dev.sh` lançait l'infra, le backend et les deux frontends — **jamais**
`python -m app.production_worker`. Rien n'était cassé : le backend acceptait en `202`, la file
grossissait, l'écran affichait « en file d'attente », et Papa recliquait toutes les cinquante
minutes.

La question que ces verrous tiennent : **le serveur dit-il si quelqu'un écoute ?**
(`worker_alive` sur `/runs/active`), et **depuis quand un lot tourne-t-il** (`started_at`).

⚠️ Elle ne se teste PAS en comptant des workers : les tests n'ont pas de Redis (`file_rq_factice`
lève sur toute connexion). Ce qui se vérifie ici, c'est que la route POSE la question au bon
moment et n'invente pas la réponse.
"""

from datetime import datetime, timezone

import pytest
from sqlalchemy import select

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.production import runs
from app.tests.test_production_coverage import _seed_lesson, _seed_year

PAPA = {"username": "papa", "role": "papa"}


@pytest.fixture(autouse=True)
def _papa(client_db) -> None:
    """⚠️ Dépend de `client_db` À DESSEIN — sinon l'autouse passe AVANT lui et le rôle retombe à
    `child` : toutes les routes de production en 403, et les assertions échouent en accusant le
    code testé. Patron repris de `test_production_journal`, où le piège est déjà documenté."""
    app.dependency_overrides[get_current_user] = lambda: PAPA


def _chapitre(db) -> m.Chapter:
    """Un chapitre ATTEIGNABLE, créé au besoin — le conftest n'en sème aucun.

    ⚠️ **Semé par `_seed_year`, jamais à la main.** Un `Chapter` s'accroche à un
    `school_year_subject_id` et doit être `validated` sous l'année ACTIVE pour que
    `lessons_by_skill` le voie. Une première version de ce fichier créait un chapitre via un
    `Theme` : il existait en base, aucune notion ne le résolvait, et les verrous du doublon
    passaient au vert **en ne testant rien**. Le test a attrapé son propre fixture.
    """
    existing = db.scalar(select(m.Chapter))
    if existing is not None:
        return existing
    _student, _subject, chapter = _seed_year(db)
    db.commit()
    return chapter


def _notion(db, nom: str) -> m.Skill:
    skill = m.Skill(subject_id=db.scalar(select(m.Subject.id)), name=nom)
    db.add(skill)
    db.commit()
    return skill


# --- 1. Le serveur dit si quelqu'un écoute -----------------------------------------------------


def test_un_lot_en_file_fait_poser_la_question_du_worker(client_db, monkeypatch) -> None:
    """⚠️ **Le verrou porte sur l'APPEL, pas sur la réponse.**

    La réponse vient de Redis, absent en test. Ce qui doit être tenu, c'est que la route interroge
    la file quand un lot attend — le 2026-08-04 avait déjà montré qu'une règle juste, écrite au
    mauvais endroit, ne protège que l'endroit où elle est écrite.
    """
    client, Session = client_db
    from app.modules.production import runs_router

    demande = {"vu": False}

    def _faux_verdict() -> bool:
        demande["vu"] = True
        return False

    monkeypatch.setattr(runs_router, "production_worker_alive", _faux_verdict)

    with Session() as db:
        chapter = _chapitre(db)
        runs.create_run(db, chapter_id=chapter.id)  # reste `queued`

    reponse = client.get("/api/production/runs/active")
    assert reponse.status_code == 200
    assert demande["vu"] is True
    assert reponse.json()["worker_alive"] is False


def test_un_lot_qui_TOURNE_ne_fait_pas_poser_la_question(client_db, monkeypatch) -> None:
    """Un lot `running` a forcément quelqu'un qui l'exécute — l'aller-retour Redis serait payé
    pour une réponse connue d'avance, quatre fois par minute sur toutes les pages Papa."""
    client, Session = client_db
    from app.modules.production import runs_router

    demande = {"vu": False}

    def _faux_verdict() -> bool:
        demande["vu"] = True
        return False

    monkeypatch.setattr(runs_router, "production_worker_alive", _faux_verdict)

    with Session() as db:
        chapter = _chapitre(db)
        lot = runs.create_run(db, chapter_id=chapter.id)
        lot.status = "running"
        lot.started_at = datetime.now(timezone.utc)
        db.commit()

    reponse = client.get("/api/production/runs/active")
    assert demande["vu"] is False
    assert reponse.json()["worker_alive"] is True


def test_started_at_voyage_avec_le_lot(client_db) -> None:
    """Sans lui, l'estimation client mesure l'âge de l'AFFICHAGE et repart de zéro à chaque
    navigation — le « ça remet tout à zéro » signalé par le user."""
    client, Session = client_db
    with Session() as db:
        chapter = _chapitre(db)
        lot = runs.create_run(db, chapter_id=chapter.id)
        lot.status = "running"
        lot.started_at = datetime.now(timezone.utc)
        db.commit()
        lot_id = lot.id

    corps = client.get(f"/api/production/runs/{lot_id}").json()
    assert corps["started_at"] is not None
