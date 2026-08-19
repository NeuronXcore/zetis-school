"""Suspendre ZETIS (ADR-0063) — les verrous du sixième régulateur.

Trois verrous portent la décision :

1. **le régulateur parle EN PREMIER** — un motif de plafond rendu à quelqu'un qui a lui-même coupé
   le courant serait un refus exact et incompréhensible ;
2. **son refus ne se persiste JAMAIS** — Papa connaît la cause, il l'a causée ; le retenir à
   chaque réveil du scan noierait les refus qui apprennent quelque chose ;
3. **un lot en vol s'arrête entre deux PIÈCES, et se raconte** — le grain que l'ADR-0031 §3 a
   décidé, pas celui que le code appliquait.
"""

import pytest
from sqlalchemy import select

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.production import runner, runs, triggers
from app.modules.settings import service as svc
from app.tests.fakes import FakeEmbeddingProvider, FakeLLMProvider
from app.tests.test_production_triggers import _arm, _controle, _seed

PAPA = {"username": "papa", "role": "papa"}
CHILD = {"username": "massimo", "role": "child"}
API = "/api/settings/production-suspension"


def _as(role: dict) -> None:
    app.dependency_overrides[get_current_user] = lambda: role


@pytest.fixture(autouse=True)
def _papa(client_db) -> None:
    """⚠️ Dépend de `client_db` À DESSEIN — même motif que `test_settings_autonomy.py`."""
    _as(PAPA)


# --- La clé et sa route ---------------------------------------------------------------------------


def test_le_defaut_est_en_route(client_db) -> None:
    """Aucune ligne → ZETIS tourne. Suspendre est un geste, jamais un état de naissance."""
    client, _ = client_db

    assert client.get(API).json() == {"suspended": False}


def test_la_bascule_s_ecrit_et_se_relit_dans_les_deux_sens(client_db) -> None:
    client, Session = client_db

    assert client.put(API, json={"suspended": True}).json() == {"suspended": True}
    assert client.get(API).json() == {"suspended": True}
    # Et la clé est bien EN BASE — c'est elle qui fait survivre la suspension au redémarrage
    # (ADR-0063 §4) : pas de cache, pas de variable de processus.
    with Session() as db:
        assert db.get(m.AppSetting, svc.PRODUCTION_SUSPENDED_KEY).value == "true"

    assert client.put(API, json={"suspended": False}).json() == {"suspended": False}
    assert client.get(API).json() == {"suspended": False}


def test_suspendre_ne_touche_ni_au_regime_ni_au_declencheur(client_db) -> None:
    """ADR-0063 §7 : le veto retire une pièce, ceci arrête la machine — et rien d'autre."""
    client, _ = client_db
    avant = client.get("/api/settings/autonomy").json()

    client.put(API, json={"suspended": True})

    assert client.get("/api/settings/autonomy").json() == avant


def test_le_role_enfant_est_refuse(client_db) -> None:
    client, _ = client_db
    _as(CHILD)

    assert client.get(API).status_code == 403
    assert client.put(API, json={"suspended": True}).status_code == 403


# --- 🔴 Le sixième régulateur ---------------------------------------------------------------------


def test_suspendu_aucun_lot_ne_demarre_et_le_motif_dit_quoi(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        svc.set_production_suspended(db, suspended=True)

        with pytest.raises(runs.ProductionRefused) as excinfo:
            runs.create_run(db, chapter_id=chapter.id)

    assert excinfo.value.regulator == "suspended"
    assert excinfo.value.status_code == 409
    # Le motif dit que rien d'autre ne bouge — une commande d'arrêt n'est pas destructive.
    assert "ne bougent pas" in excinfo.value.detail


def test_le_regulateur_suspendu_parle_AVANT_les_cinq_autres(client_db) -> None:
    """Suspendu + doublon en file : c'est « suspended » qui répond. Rendre « un lot identique
    attend déjà » à quelqu'un qui a débranché serait exact et incompréhensible."""
    client, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        # Un doublon RÉEL d'abord — le régulateur `duplicate` aurait de quoi parler…
        run = runs.create_run(db, chapter_id=chapter.id)
        assert run.status == "queued"
        # …puis la suspension, qui doit lui couper la parole.
        svc.set_production_suspended(db, suspended=True)

        with pytest.raises(runs.ProductionRefused) as excinfo:
            runs.create_run(db, chapter_id=chapter.id)

    assert excinfo.value.regulator == "suspended"


def test_le_refus_du_scan_n_est_JAMAIS_persiste(client_db) -> None:
    """ADR-0063 §2 : le scan de 3 h se heurte à la suspension et n'écrit RIEN — persister le même
    refus toutes les 180 minutes noierait ceux qui apprennent quelque chose."""
    client, Session = client_db
    with Session() as db:
        chapter = _seed(db)
        _arm(db)  # déclencheur armé : sans suspension, ce scan CRÉERAIT un lot
        _controle(db, chapter)
        svc.set_production_suspended(db, suspended=True)

        report = triggers.scan_agenda(db)

        assert report["created"] == []
        assert db.scalars(select(m.ProductionRefusal)).all() == []


# --- 🔴 L'arrêt d'un lot en vol, au grain de la pièce ---------------------------------------------


def _lot_deux_notions(db):
    """Un chapitre, un cours validé, DEUX notions — le lot que la suspension va écourter."""
    chapter = _seed(db)
    subject_id = db.scalars(select(m.Skill.subject_id)).first()
    lesson_id = db.scalars(select(m.LessonSkill.lesson_id)).first()
    seconde = m.Skill(subject_id=subject_id, name="Soustraire des fractions", level="4e")
    db.add(seconde)
    db.flush()
    db.add(m.LessonSkill(lesson_id=lesson_id, skill_id=seconde.id))
    db.commit()
    return runs.create_run(db, chapter_id=chapter.id)


def test_un_lot_suspendu_avant_sa_premiere_piece_se_raconte_en_entier(client_db) -> None:
    """Créé PUIS suspendu (l'inverse est refusé par le régulateur) : il s'arrête à la première
    pièce, chaque notion entre au journal avec le motif, et le lot finit `done` — un arrêt
    demandé n'est pas une panne, donc jamais `failed` (ADR-0063 §3)."""
    client, Session = client_db
    with Session() as db:
        run = _lot_deux_notions(db)
        run_id = run.id
        svc.set_production_suspended(db, suspended=True)

        runner.execute(db, run_id=run_id, llm=FakeLLMProvider(), embedder=FakeEmbeddingProvider())

        db.expire_all()
        run = db.get(m.ProductionRun, run_id)
        assert run.status == "done"
        journal = db.scalars(
            select(m.ProductionEvent).where(m.ProductionEvent.run_id == run_id)
        ).all()
        assert len(journal) == 2, "chaque notion doit dire pourquoi elle n'a pas été équipée"
        assert all(item.outcome == "blocked" for item in journal)
        assert all("suspendu" in item.detail for item in journal)
        assert "aucune pièce" in journal[0].detail
        # Et rien n'est resté affiché « en cours » — un lot fini qui montre une notion en vol se
        # lit comme un lot bloqué dessus.
        assert run.current_skill_id is None and run.current_piece is None


def test_un_lot_suspendu_en_vol_conserve_les_pieces_deja_produites(client_db) -> None:
    """La suspension tombe PENDANT la génération : la pièce en cours se termine (un appel LLM
    n'est pas préemptible), les suivantes ne partent pas, et le journal compte ce qui est gardé."""
    client, Session = client_db

    class SuspendApresUnAppel(FakeLLMProvider):
        """Pose la suspension par une AUTRE session après la 1re génération — comme le ferait le
        PUT de Papa pendant que le worker tourne."""

        def __init__(self) -> None:
            super().__init__()
            self.appels = 0

        def generate(self, request):  # noqa: ANN001
            self.appels += 1
            if self.appels == 1:
                with Session() as autre:
                    svc.set_production_suspended(autre, suspended=True)
            return super().generate(request)

    with Session() as db:
        run = _lot_deux_notions(db)
        run_id = run.id

        runner.execute(
            db, run_id=run_id, llm=SuspendApresUnAppel(), embedder=FakeEmbeddingProvider()
        )

        db.expire_all()
        run = db.get(m.ProductionRun, run_id)
        assert run.status == "done"
        journal = db.scalars(
            select(m.ProductionEvent).where(m.ProductionEvent.run_id == run_id)
        ).all()
        courante = [i for i in journal if "conservée" in (i.detail or "")]
        assert courante, "la notion interrompue doit dire ce qu'elle a gardé"
        # « N pièce(s) déjà produite(s) » ne s'écrit QUE si `_stamp` en a compté au moins une
        # de vraie — c'est la mesure, pas une phrase décorative. L'autre branche du message est
        # « aucune pièce n'avait encore été produite ».
        assert "pièce(s) déjà produite(s)" in courante[0].detail
