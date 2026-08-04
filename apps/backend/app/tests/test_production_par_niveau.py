"""La production jouée aux TROIS niveaux de ZETIS — une boucle par régime (ADR-0032).

## Pourquoi une boucle et pas trois tests écrits à la main

Les paliers ne sont pas une option de configuration : ils **changent ce que ZETIS a le droit de
faire**. Le même geste de Papa — « Produire » sur une demande de Massimo — donne trois résultats
différents selon le régime, et jusqu'ici **aucun test ne jouait le chemin complet à plus d'un
seul** d'entre eux. C'est exactement le trou par lequel est passé le cul-de-sac du 2026-08-04 :
une demande de **cours** en régime *Manuel* ne peut structurellement rien produire, l'écran
l'offrait quand même, et rien en CI ne le disait.

Une boucle paramétrée rend la table de vérité **exhaustive par construction** : le jour où un
quatrième régime apparaît, il entre dans `NIVEAUX` et les tests le jouent sans qu'on y pense. Trois
tests recopiés à la main, eux, auraient laissé le nouveau régime non couvert — en silence.

## Ce que chaque boucle affirme

| Régime      | A0a       | A1        | demande de COURS        | demande de FICHE          |
|-------------|-----------|-----------|-------------------------|---------------------------|
| `manuel`    | 2 valide  | 2 valide  | **rien** (gate du §7)   | produite, **à relire**    |
| `semi`      | 3 sert    | 2 valide  | **rien** (gate du §7)   | produite, **servie**      |
| `autonome`  | 3 sert    | 3 sert    | **rédigée** par ZETIS   | produite, **servie**      |

⚠️ Les deux « rien » ne sont pas des pannes : c'est le gate qui fonctionne. Ce qui manquait, c'est
que **quelqu'un le dise avant le clic** — voir l'aperçu du lot-pièce.
"""

from datetime import datetime, timezone

import pytest
from sqlalchemy import select

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.production import runner
from app.modules.production.runner import BLOCKED_COURSE_MISSING
from app.modules.settings.service import NIVEAUX, write_autonomy
from app.tests.fakes import FakeEmbeddingProvider, FakeLLMProvider
from app.tests.test_galaxy import _seed_svt


def _as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


@pytest.fixture(params=tuple(NIVEAUX))
def niveau(request) -> str:
    """Les trois régimes nommés, lus de `NIVEAUX` — jamais recopiés ici.

    Une liste en dur dans ce fichier divergerait au premier régime ajouté, et la boucle croirait
    couvrir un monde qui aurait changé.
    """
    return request.param


def _regle(Session, niveau: str) -> None:
    with Session() as db:
        write_autonomy(db, dict(NIVEAUX[niveau]))


def _demande(Session, ids: dict, kind: str) -> int:
    with Session() as db:
        req = m.ContentRequest(
            student_id=ids["student_id"],
            skill_id=ids["mitose_id"],
            content_kind=kind,
            status="pending",
        )
        db.add(req)
        db.commit()
        return req.id


def _produire(client, Session, req_id: int) -> int:
    """Le clic de Papa, puis l'exécution du lot — le worker n'existe pas en test."""
    _as_papa()
    resp = client.post(f"/api/production/runs/from-request?request_id={req_id}")
    assert resp.status_code == 202, resp.text
    run_id = resp.json()["id"]
    with Session() as db:
        runner.execute(db, run_id=run_id, llm=FakeLLMProvider(), embedder=FakeEmbeddingProvider())
    return run_id


def test_une_demande_de_cours_selon_le_niveau(client_db, niveau) -> None:
    """Le cas RÉEL du 2026-08-04 : « Accord du COD — 📖 Cours », leçon validée mais cours VIDE.

    `lesson_content=None` reproduit l'état trouvé en base : 39 leçons `validated` sans une ligne de
    contenu, parce que valider les leçons d'un chapitre les passe toutes en `validated` sans
    regarder s'il y a un texte. Le gate lit ce champ et bloque — à raison, mais avec un motif qui
    dit « à valider » d'une leçon qui l'est déjà.
    """
    client, Session = client_db
    ids = _seed_svt(Session, lesson_content=None)
    _regle(Session, niveau)
    req_id = _demande(Session, ids, "cours")

    run_id = _produire(client, Session, req_id)

    with Session() as db:
        run = db.get(m.ProductionRun, run_id)
        lesson = db.get(m.Lesson, ids["lesson_id"])
        demande = db.get(m.ContentRequest, req_id)
        journal = db.scalars(
            select(m.ProductionEvent).where(m.ProductionEvent.run_id == run_id)
        ).all()

        if niveau == "autonome":
            assert lesson.content_markdown, "ZETIS avait le droit d'écrire ce cours"
            assert run.total_notions == 1 and run.done_notions == 1
            assert demande.status == "done", "le contenu existe : la demande n'a plus lieu d'attendre"
        else:
            assert not lesson.content_markdown, "un cours a été écrit sous un palier qui l'interdit"
            assert run.total_notions == 0, "la notion devait être écartée AVANT la production"
            assert [(e.outcome, e.detail) for e in journal] == [
                ("blocked", BLOCKED_COURSE_MISSING)
            ], "le lot doit DIRE pourquoi il n'a rien fait"
            assert demande.status == "pending", "rien n'a été servi : la demande reste ouverte"


def test_la_file_annonce_le_blocage_AVANT_le_clic(client_db, niveau) -> None:
    """Le verdict de SITUATION (addendum ADR-0036) — la même demande, lue aux trois régimes.

    C'est le test qui ferme le cul-de-sac : là où le lot ne produirait rien, la file le dit **avant**
    que Papa clique. Et il le dit avec le motif exact — pas « à valider » d'une leçon qui l'est
    déjà.

    ⚠️ Il joue sur les trois régimes exprès : un verdict qui répondrait « bloqué » partout serait
    vert au *Manuel* pour la mauvaise raison. C'est la ligne `autonome` qui prouve qu'il regarde
    vraiment le palier.
    """
    from app.modules.content_requests import service as content_requests

    _, Session = client_db
    ids = _seed_svt(Session, lesson_content=None)
    _regle(Session, niveau)
    _demande(Session, ids, "cours")

    with Session() as db:
        demande = content_requests.list_requests(db)[0]

    assert demande["producible"] is True, "le TYPE reste productible — c'est la situation qui bloque"
    if niveau == "autonome":
        assert demande["blocked_reason"] is None
    else:
        assert demande["blocked_reason"] == BLOCKED_COURSE_MISSING


def test_le_journal_dit_le_regime_sous_lequel_le_lot_a_tourne(client_db, niveau) -> None:
    """Le lot CAPTURE son régime au démarrage — le Journal le relit, il ne le devine pas.

    ⚠️ **La preuve tient au changement de réglage APRÈS coup.** Sans lui, ce test passerait aussi
    avec un Journal qui lit les paliers d'aujourd'hui : c'est exactement le défaut qu'on ferme.
    Un lot que Papa a relu ne doit pas se lire « servi sans relecture » parce qu'il a changé d'avis
    depuis.
    """
    from app.modules.production import journal
    from app.modules.settings.service import write_autonomy as ecrire

    client, Session = client_db
    ids = _seed_svt(Session)
    _regle(Session, niveau)
    req_id = _demande(Session, ids, "fiche")
    run_id = _produire(client, Session, req_id)

    # Papa change de régime après coup — le lot passé ne doit pas bouger d'un mot.
    autre = "autonome" if niveau != "autonome" else "manuel"
    with Session() as db:
        ecrire(db, dict(NIVEAUX[autre]))

    with Session() as db:
        lot = next(r for r in journal.list_journal(db)["runs"] if r["id"] == run_id)

    assert lot["zetis_mode"] == niveau


def test_un_lot_anterieur_a_la_capture_ne_se_voit_attribuer_aucun_regime(client_db) -> None:
    """`None`, jamais le régime du jour : le Journal ne reconstitue pas le passé (doctrine §F.4)."""
    from app.modules.production import journal

    _, Session = client_db
    ids = _seed_svt(Session)
    with Session() as db:
        run = m.ProductionRun(
            student_id=ids["student_id"],
            trigger="manual",
            authorized_by="parent_direct",
            status="done",
            scope_skill_id=ids["mitose_id"],
            scope_kind="fiche",
            created_at=datetime(2026, 7, 1, tzinfo=timezone.utc),
        )
        db.add(run)
        db.commit()

        lot = journal.list_journal(db)["runs"][0]

    assert lot["zetis_mode"] is None


def test_un_derive_est_relu_ou_servi_selon_le_niveau(client_db, niveau) -> None:
    """La même demande de fiche produit la même fiche — mais Massimo ne la voit pas au même moment.

    C'est A0a qui tranche, et lui seul : en *Manuel* la fiche naît `pending` et attend Papa ; dès
    *Semi*, elle est servie d'office. Le lot, lui, ne change pas d'un caractère.
    """
    client, Session = client_db
    ids = _seed_svt(Session)  # cours présent : le prérequis du dérivé est rempli
    _regle(Session, niveau)
    req_id = _demande(Session, ids, "fiche")

    _produire(client, Session, req_id)

    with Session() as db:
        fiche = db.scalar(select(m.Fiche).where(m.Fiche.lesson_id == ids["lesson_id"]))
        assert fiche is not None, "la fiche demandée n'a pas été produite"
        attendu = "pending" if niveau == "manuel" else "validated"
        assert fiche.validation_status == attendu
