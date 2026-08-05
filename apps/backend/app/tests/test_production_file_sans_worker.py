"""Une file sans consommateur n'est pas une attente — c'est un arrêt (2026-08-05).

## Le défaut que ces verrous tiennent

Quatre lots `fiche` identiques sur la notion « Complément d'objet » ont attendu six heures dans
Redis. `scripts/dev.sh` lançait l'infra, le backend et les deux frontends — **jamais**
`python -m app.production_worker`. Rien n'était cassé : le backend acceptait en `202`, la file
grossissait, l'écran affichait « en file d'attente », et Papa recliquait toutes les cinquante
minutes.

Trois questions différentes en sont sorties, et chacune a son verrou ici :

1. **Le serveur dit-il si quelqu'un écoute ?** (`worker_alive` sur `/runs/active`)
2. **Refuse-t-il un lot identique déjà en file ?** (garde de `create_run`)
3. **Retrouve-t-on un lot en cours sans l'avoir mémorisé ?** (`active_run` sur les demandes)

⚠️ La n°1 ne se teste PAS en comptant des workers : les tests n'ont pas de Redis (`file_rq_factice`
lève sur toute connexion). Ce qui se vérifie ici, c'est que la route POSE la question au bon
moment et n'invente pas la réponse.
"""

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
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


# --- 2. La garde anti-doublon ------------------------------------------------------------------


def test_un_lot_identique_en_file_est_refuse_et_le_dit(client_db) -> None:
    """Le refus qui manquait. Sans lui, quatre lots identiques naissent en une matinée.

    ⚠️ Le message nomme le lot existant (`#1`) : « une production est déjà en cours » sans dire
    laquelle enverrait Papa la chercher, et un refus qu'on ne peut pas vérifier se lit comme un
    bug.
    """
    _, Session = client_db
    with Session() as db:
        chapter = _chapitre(db)
        premier = runs.create_run(db, chapter_id=chapter.id)

        with pytest.raises(HTTPException) as refus:
            runs.create_run(db, chapter_id=chapter.id)

        assert refus.value.status_code == 409
        assert f"#{premier.id}" in refus.value.detail
        # Et RIEN n'a été créé : un refus qui laisse une trace est un demi-refus.
        assert db.scalar(select(m.ProductionRun.id).where(m.ProductionRun.id != premier.id)) is None


def test_le_meme_scope_redevient_productible_une_fois_le_lot_TERMINE(client_db) -> None:
    """⚠️ **Ce n'est pas de l'idempotence, et le distinguer est tout l'enjeu.**

    `run_exists_for` (ADR-0035) demande « ce lot a-t-il déjà été produit ? » sur toute l'histoire.
    Ici on demande « y en a-t-il un en TRAIN de le faire ? ». Confondre les deux interdirait de
    régénérer une fiche pour toujours — un refus permanent déguisé en garde-fou.
    """
    _, Session = client_db
    with Session() as db:
        chapter = _chapitre(db)
        premier = runs.create_run(db, chapter_id=chapter.id)
        premier.status = "done"
        premier.finished_at = datetime.now(timezone.utc)
        db.commit()

        second = runs.create_run(db, chapter_id=chapter.id)
        assert second.id != premier.id


def test_deux_scopes_DIFFERENTS_ne_se_bloquent_pas(client_db) -> None:
    """La garde porte sur le SCOPE, pas sur « une production tourne ».

    Sans cette précision elle deviendrait un verrou global à un lot à la fois — une décision
    d'ordonnancement que personne n'a prise, glissée dans un correctif d'affichage.
    """
    _, Session = client_db
    with Session() as db:
        _chapitre(db)
        une = _notion(db, "Complément d'objet")
        autre = _notion(db, "Complément circonstanciel")

        runs.create_run(db, scope_skill_id=une.id, scope_kind="fiche")
        # Même notion, AUTRE pièce : rien à voir.
        runs.create_run(db, scope_skill_id=une.id, scope_kind="quiz")
        # Autre notion, même pièce : rien à voir non plus.
        runs.create_run(db, scope_skill_id=autre.id, scope_kind="fiche")

        assert len(db.scalars(select(m.ProductionRun)).all()) == 3


# --- 4. Le contenu existe DÉJÀ : refus dit, pas un lot qui tourne pour rien --------------------


def _lecon_avec_notion(db) -> m.Skill:
    """Une notion portée par une leçon dont le cours est écrit et validé, sous l'année active."""
    chapter = _chapitre(db)
    skill = _notion(db, "Complément d'objet")
    lesson = _seed_lesson(db, chapter, title="Les compléments d'objet")
    db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
    db.commit()
    return skill


def test_une_fiche_deja_produite_fait_refuser_le_lot(client_db) -> None:
    """Le lot #28 du 2026-08-05 : lancé, exécuté en 76 ms, `skipped`, et RIEN dit à Papa.

    ⚠️ Le refus doit tomber **avant l'écriture** : un lot créé puis constaté stérile laisse une
    ligne au Journal, qui est un registre — elle ne s'efface pas.
    """
    _, Session = client_db
    with Session() as db:
        skill = _lecon_avec_notion(db)
        lesson_id = db.scalar(select(m.LessonSkill.lesson_id))
        db.add(m.Fiche(lesson_id=lesson_id, spec_json={}, validation_status="validated"))
        db.commit()

        with pytest.raises(HTTPException) as refus:
            runs.create_run(db, scope_skill_id=skill.id, scope_kind="fiche")

        assert refus.value.status_code == 409
        assert "existe déjà" in refus.value.detail
        assert db.scalar(select(m.ProductionRun.id)) is None  # rien créé


def test_une_fiche_PENDING_ne_bloque_pas_quand_ZETIS_peut_la_valider(client_db, monkeypatch) -> None:
    """⚠️ **« Existe » ne veut pas dire « rien à faire ».**

    Une fiche `pending` est inexploitable pour Massimo, et `equip_piece` la VALIDE quand le régime
    le permet : ce lot-là produit un vrai changement. Refuser ici supprimerait le seul geste qui
    restait utile — et laisserait la demande de Massimo ouverte pour toujours.
    """
    _, Session = client_db
    from app.modules.settings import service as settings_service

    monkeypatch.setattr(settings_service, "derivatives_are_served", lambda _db: True)
    with Session() as db:
        skill = _lecon_avec_notion(db)
        lesson_id = db.scalar(select(m.LessonSkill.lesson_id))
        db.add(m.Fiche(lesson_id=lesson_id, spec_json={}, validation_status="pending"))
        db.commit()

        lot = runs.create_run(db, scope_skill_id=skill.id, scope_kind="fiche")
        assert lot.status == "queued"


def test_un_lot_de_CHAPITRE_nest_jamais_refuse_pour_doublon(client_db) -> None:
    """Un lot de chapitre saute ses notions déjà équipées **une par une** et produit les autres.

    Le refuser en bloc parce qu'UNE de ses notions a déjà sa fiche supprimerait du travail réel —
    c'est la raison pour laquelle la garde ne répond que des lots-PIÈCE.
    """
    _, Session = client_db
    with Session() as db:
        skill = _lecon_avec_notion(db)
        lesson_id = db.scalar(select(m.LessonSkill.lesson_id))
        db.add(m.Fiche(lesson_id=lesson_id, spec_json={}, validation_status="validated"))
        db.commit()
        chapter_id = db.scalar(select(m.Chapter.id))

        lot = runs.create_run(db, chapter_id=chapter_id)
        assert lot.status == "queued"
        assert skill is not None


def test_le_verdict_reutilise_les_predicats_du_lot(client_db) -> None:
    """⚠️ Verrou d'ARCHITECTURE, pas de comportement.

    Le refus et l'exécution doivent lire la même chose. Si `piece_deja_produite` cessait d'utiliser
    les prédicats d'`equip_piece`, l'écran refuserait ce que le lot aurait produit — ou l'inverse —
    et le défaut ne se verrait qu'à l'usage, une fois. C'est le mal que l'ADR-0037 nomme.
    """
    import inspect

    from app.modules.production import equipment

    source = inspect.getsource(equipment.piece_deja_produite)
    for predicat in ("_existing_fiche", "_existing_mindmap", "_has_srs_cards", "_has_mission_quiz"):
        assert predicat in source, f"{predicat} n'est plus réutilisé — seconde implémentation."


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
