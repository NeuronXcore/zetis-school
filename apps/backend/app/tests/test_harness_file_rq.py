"""Le harnais lui-même : aucun test n'atteint la vraie file RQ (correctif du 2026-08-04).

Ces tests ne couvrent aucune règle métier — ils couvrent **le dispositif de test**. Ils existent
parce que le défaut d'origine était invisible depuis les tests : la suite passait au vert **en
écrivant dans la file de dev**. 18 jobs `run_production(1)` y dormaient au moment du diagnostic,
35 avaient été purgés la veille. Un défaut que rien ne regarde revient ; on met donc un œil.
"""

import pytest

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user
from app.tests.test_galaxy import _seed_svt


def _as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def test_un_clic_produire_enfile_dans_la_file_FACTICE(client_db, file_rq_factice) -> None:
    """LE test qui aurait manqué. La route enfile — et ce qu'elle enfile n'atteint pas Redis.

    ⚠️ Il vise `runs_router` **exprès** : c'est le seul appelant qui importe `enqueue_production`
    au niveau module. Un garde-fou posé sur `app.core.queue.enqueue_production` ne l'atteindrait
    pas (le nom y est lié à l'import), serait vert, et laisserait fuir. En passant par la fabrique
    de file, il est attrapé comme les autres.
    """
    client, Session = client_db
    ids = _seed_svt(Session)
    with Session() as db:
        req = m.ContentRequest(
            student_id=ids["student_id"],
            skill_id=ids["mitose_id"],
            content_kind="fiche",
            status="pending",
        )
        db.add(req)
        db.commit()
        req_id = req.id

    _as_papa()
    resp = client.post(f"/api/production/runs/from-request?request_id={req_id}")
    assert resp.status_code == 202, resp.text

    assert len(file_rq_factice.enqueued) == 1, "le lot n'a pas été enfilé du tout"
    fonction, args = file_rq_factice.enqueued[0]
    assert fonction.__name__ == "run_production"
    assert args == (resp.json()["id"],)


def test_ouvrir_une_connexion_redis_leve_au_lieu_decrire(client_db) -> None:
    """Le verrou. Toute voie qui contournerait les fabriques tombe en ROUGE, elle n'écrit plus.

    Sans lui, le correctif ne protégerait que les deux fabriques d'aujourd'hui : un troisième
    point d'entrée (une file de plus, un `Redis.from_url` direct) rouvrirait le défaut en silence.
    """
    from app.core import queue as queue_mod

    with pytest.raises(RuntimeError, match="tenté d'ouvrir une connexion Redis"):
        queue_mod._redis()
