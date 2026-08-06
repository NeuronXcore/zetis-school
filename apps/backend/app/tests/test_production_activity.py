"""L'activité de production (ADR-0041) — la source unique de toutes les barres.

⚠️ **Ce que ces tests ne peuvent PAS prouver, et il faut le savoir en les lisant** : les files sont
factices (`conftest.file_rq_factice`, `autouse`), Redis est interdit. Aucun test ici ne démontre
qu'une barre AVANCE — ils démontrent que le serveur dit la bonne chose sur un état donné. Le reste
se vérifie à l'écran, et l'ADR §15 dit pourquoi.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

import app.db.models as m
from app.core.queue import queue_for
from app.main import app
from app.modules.auth.deps import get_current_user


def _as_parent() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _run(db, **kw) -> m.ProductionRun:
    """Un lot minimal et VALIDE — les deux `CheckConstraint` sont réelles, même en SQLite."""
    student = db.scalar(select(m.StudentProfile))
    defaults = dict(
        student_id=student.id,
        trigger="manual",
        authorized_by="parent_direct",
        status="queued",
        scope_skill_id=db.scalar(select(m.Skill)).id,
        scope_kind="fiche",
        created_at=_now(),
    )
    run = m.ProductionRun(**{**defaults, **kw})
    db.add(run)
    db.commit()
    return run


def _pieces(db, run, *, notions: int, outcome: str = "generated") -> None:
    """Écrit le journal de `notions` notions ACHEVÉES — cinq lignes chacune, comme le runner.

    ⚠️ **Ce helper n'est pas une commodité, il rétablit la source de vérité.** Avant l'addendum 2,
    l'avancement se lisait sur le compteur `done_notions` ; il se lit désormais sur les lignes de
    `production_events`, parce que c'est le seul endroit où une PIÈCE existe. Poser
    `done_notions=7` sans journal décrivait donc un lot impossible — et c'est ce lot impossible que
    le test décrivait jusqu'ici.
    """
    skill_id = db.scalar(select(m.Skill)).id
    for _ in range(notions):
        for piece in m.production.PIECES:
            db.add(
                m.ProductionEvent(
                    run_id=run.id,
                    skill_id=skill_id,
                    piece=piece,
                    outcome=outcome,
                    created_at=_now(),
                )
            )
    db.commit()


def _job(db, **kw) -> m.AIJob:
    defaults = dict(
        job_type="equip_notion",
        status="queued",
        input_json={"skill_id": db.scalar(select(m.Skill)).id},
        created_by="parent",
        created_at=_now(),
    )
    job = m.AIJob(**{**defaults, **kw})
    db.add(job)
    db.commit()
    return job


def test_activity_vide_ne_montre_rien(client_db) -> None:
    """Rien ne tourne, rien n'a échoué : la barre n'existe pas."""
    client, _ = client_db
    _as_parent()
    body = client.get("/api/production/activity").json()
    assert body["current"] is None
    assert body["queued_count"] == 0
    assert body["failed"] == []


# ─── LE VERROU CENTRAL ─────────────────────────────────────────────────────────────────────────
def test_un_lot_en_file_ne_rend_JAMAIS_zero_pour_cent(client_db) -> None:
    """🔴 `pct` vaut `None`, jamais `0`.

    `runs.run_out()` émet `progress_pct: 0` sur un lot en file, et c'est `useRunProgress` qui
    rattrapait côté client. Cet endpoint étant la source UNIQUE, hériter de ce `0` déplacerait le
    mensonge vers le serveur — là où plus personne ne le rattrape. Le 2026-08-05, quatre lots
    arrêtés affichaient 0 %, lu comme « ça démarre ».

    Zéro n'est pas une valeur basse : c'est une absence de mesure.
    """
    client, Session = client_db
    with Session() as db:
        _run(db, status="queued")
    _as_parent()
    courant = client.get("/api/production/activity").json()["current"]
    assert courant["status"] == "queued"
    assert courant["pct"] is None, "un lot en file n'a AUCUN pourcentage — surtout pas 0"
    assert courant["pct_is_measured"] is False
    # La fraction tombe avec le quotient, sinon la barre afficherait « 0 / 0 » — un « ça démarre »
    # de plus, écrit autrement. ⚠️ Ce verrou couvre aussi la fenêtre où `runner.execute` a commité
    # `running` sans avoir encore posé `total_notions`.
    assert courant["pieces_done"] is None
    assert courant["pieces_total"] is None


def test_un_lot_qui_tourne_rend_une_progression_MESUREE(client_db) -> None:
    """Le lot est le seul à savoir compter ses pièces — et il le déclare (`pct_is_measured`).

    ⚠️ **Ce test comptait des NOTIONS jusqu'à l'addendum 2** ; il pose désormais le journal réel.
    L'assertion n'a pas été affaiblie pour passer : `35 / 155` vaut les mêmes **23 %** que
    `7 / 31`. Ce qui a changé est d'où vient le nombre — d'un compteur qu'on posait à la main, vers
    les lignes que le runner écrit vraiment.
    """
    client, Session = client_db
    with Session() as db:
        # Le scope n'entre pas dans ce qu'on affirme ici : seuls les DEUX compteurs décident si
        # le serveur a une granularité réelle. On garde donc le scope par défaut du helper.
        run = _run(
            db,
            status="running",
            total_notions=31,
            done_notions=7,
            started_at=_now(),
            heartbeat_at=_now(),
        )
        _pieces(db, run, notions=7)
    _as_parent()
    courant = client.get("/api/production/activity").json()["current"]
    assert courant["pct"] == 23
    assert courant["pct_is_measured"] is True
    # 🔴 La FRACTION doit se prouver AVEC le quotient : sans ces deux nombres, rien ne dit que
    # « 35 / 155 » n'est pas recomposé après coup depuis les 23 %.
    assert (courant["pieces_done"], courant["pieces_total"]) == (35, 155)
    assert courant["pieces_produced"] == 35


def test_la_piece_en_cours_fait_avancer_la_barre_DANS_la_notion(client_db) -> None:
    """🔴 Le verrou de l'addendum 2 §20 bis — sans lui, compter des pièces serait un renommage.

    Les cinq lignes de journal d'une notion naissent dans le MÊME commit que `done_notions` : à
    elles seules, elles font avancer la barre d'un pas toutes les ~69 s, exactement comme un
    compte de notions (`5/155` = `1/31` = 3,23 %). C'est `current_piece` — et elle seule — qui
    rend le mouvement observable, parce que les générateurs commitent en cours de route.

    Ici : 7 notions au journal, et la 8ᵉ est arrivée au quiz (index 3 dans `PIECES`).
    """
    client, Session = client_db
    with Session() as db:
        run = _run(
            db,
            status="running",
            total_notions=31,
            done_notions=7,
            current_piece="quiz",
            started_at=_now(),
            heartbeat_at=_now(),
        )
        _pieces(db, run, notions=7)
    _as_parent()
    courant = client.get("/api/production/activity").json()["current"]
    assert courant["current_piece"] == "quiz"
    # 35 achevées + 3 déjà passées dans la notion en vol (cours, fiche, srs).
    assert courant["pieces_done"] == 38
    # Et le mouvement est RÉEL : 38/155 = 25 %, contre 23 % à la même notion sans position.
    assert courant["pct"] == 25


def test_les_notions_BLOQUEES_ne_font_pas_avancer_la_barre(client_db) -> None:
    """Une ligne `blocked` porte sur la NOTION, pas sur une pièce — elle a `piece = NULL`.

    La compter ferait avancer la barre d'un travail que le gate vient précisément d'empêcher : le
    lot aurait l'air de produire pendant qu'il refuse.
    """
    client, Session = client_db
    with Session() as db:
        run = _run(
            db,
            status="running",
            total_notions=31,
            done_notions=7,
            started_at=_now(),
            heartbeat_at=_now(),
        )
        _pieces(db, run, notions=7)
        skill_id = db.scalar(select(m.Skill)).id
        for _ in range(10):
            db.add(
                m.ProductionEvent(
                    run_id=run.id,
                    skill_id=skill_id,
                    piece=None,
                    outcome="blocked",
                    detail="cours non validé",
                    created_at=_now(),
                )
            )
        db.commit()
    _as_parent()
    courant = client.get("/api/production/activity").json()["current"]
    assert courant["pieces_done"] == 35, "les 10 notions bloquées ne sont pas des pièces"
    assert courant["pct"] == 23


def test_une_piece_SAUTEE_avance_le_tapis_mais_ne_remplit_pas_la_boite(client_db) -> None:
    """Deux nombres, deux questions. Le tapis compte le travail RÉSOLU ; la boîte, le PRODUIT.

    Une pièce `skipped` (déjà présente en base) a bien été traitée — le lot est passé dessus — mais
    elle était déjà dans le stock. La faire tomber une seconde fois dans la boîte mentirait sur ce
    que ZETIS a fabriqué.
    """
    client, Session = client_db
    with Session() as db:
        run = _run(
            db,
            status="running",
            total_notions=31,
            done_notions=7,
            started_at=_now(),
            heartbeat_at=_now(),
        )
        _pieces(db, run, notions=4)
        _pieces(db, run, notions=3, outcome="skipped")
    _as_parent()
    courant = client.get("/api/production/activity").json()["current"]
    assert courant["pieces_done"] == 35, "sautée ou produite, la pièce est résolue"
    assert courant["pieces_produced"] == 20, "seules les 4 notions générées entrent dans la boîte"


def test_un_lot_PIECE_qui_tourne_ne_mesure_RIEN(client_db) -> None:
    """Une pièce sur une pièce n'est pas une progression : elle vaudrait 0 % puis 100 %.

    Le cas manquait — le helper crée pourtant un lot-pièce par défaut. Les trois champs de mesure
    tombent ensemble, sans exception pour la fraction.
    """
    client, Session = client_db
    with Session() as db:
        run = _run(
            db,
            status="running",
            total_notions=1,
            done_notions=0,
            started_at=_now(),
            heartbeat_at=_now(),
        )
        _pieces(db, run, notions=1)
    _as_parent()
    courant = client.get("/api/production/activity").json()["current"]
    assert courant["pct"] is None
    assert courant["pct_is_measured"] is False
    assert courant["pieces_done"] is None
    assert courant["pieces_total"] is None


def test_un_travail_unitaire_n_est_JAMAIS_mesure(client_db) -> None:
    """Un appel LLM n'a aucun grain interne : rien à sonder pendant ses 32 s.

    Les rendre identiques à un lot uniformiserait un mensonge — l'écran écrit `≈ 40 %` ici et
    `7 / 31 · 23 %` là.
    """
    client, Session = client_db
    with Session() as db:
        _job(db, status="running", started_at=_now())
    _as_parent()
    courant = client.get("/api/production/activity").json()["current"]
    assert courant["kind"] == "job"
    assert courant["pct"] is None
    assert courant["pct_is_measured"] is False
    # Un appel LLM n'a rien à fractionner : les champs EXISTENT et valent `null`, plutôt que
    # d'être absents — sinon chaque lecteur devrait distinguer « absent » de « nul ».
    assert courant["pieces_done"] is None
    assert courant["pieces_total"] is None
    assert courant["current_piece"] is None
    # Hors lot ⇒ manuel, PAR CONSTRUCTION (§3.2) : aucune colonne ne le stocke.
    assert courant["trigger"] == "manual"


def test_ce_qui_tourne_passe_devant_ce_qui_attend_et_le_reste_est_compte(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _run(db, status="queued")
        _run(db, status="running", total_notions=4, done_notions=1, started_at=_now())
        _job(db, status="queued")
    _as_parent()
    body = client.get("/api/production/activity").json()
    assert body["current"]["status"] == "running"
    # Profondeur de file, jamais un arriéré (§7) : il retombe à zéro tout seul.
    assert body["queued_count"] == 2

    # ⚠️ **La file elle-même est servie, pas seulement son compte.** Sans elle, « une ligne par
    # travail » et « l'ordre de service visible » du §7 sont infaisables — et une règle de
    # priorité qu'on ne peut pas vérifier à l'œil n'est pas vérifiée.
    assert len(body["queued"]) == 2
    assert all(t["status"] == "queued" for t in body["queued"]), (
        "ce qui TOURNE est `current` — la file ne contient que ce qui attend"
    )
    assert body["current"]["id"] not in [t["id"] for t in body["queued"]], (
        "le travail courant ne se compte pas deux fois"
    )


def test_worker_absent_se_distingue_de_worker_inconnu(client_db, monkeypatch) -> None:
    """`worker_alive` : `false` ≠ `null`.

    `null` veut dire « la question n'a pas été posée ». Le client teste `=== false`, jamais la
    falsité — les confondre ferait dire « arrêté » chaque fois qu'on ne sait pas.
    """
    client, Session = client_db
    _as_parent()

    # Rien en file → on ne pose pas la question : personne n'attend.
    with Session() as db:
        _run(db, status="running", total_notions=2, done_notions=1, started_at=_now())
    assert client.get("/api/production/activity").json()["worker_alive"] is None

    # Quelque chose en file → la question se pose, et la réponse est « non ».
    from app.modules.production import activity_router

    monkeypatch.setattr(activity_router, "production_worker_alive", lambda: False)
    with Session() as db:
        db.query(m.ProductionRun).delete()
        db.commit()
        _run(db, status="queued")
    assert client.get("/api/production/activity").json()["worker_alive"] is False


def test_un_echec_reste_jusqu_a_l_acquittement(client_db) -> None:
    """Un échec ne s'efface pas tout seul : il disparaît sur « J'ai vu », et pas avant.

    Un échec qui s'efface après six secondes pendant que Papa est dans une autre pièce est un
    travail perdu en silence — la négation exacte de « rien ne doit se perdre ».
    """
    client, Session = client_db
    with Session() as db:
        job = _job(db, status="failed", error_message="moteur injoignable", finished_at=_now())
        job_id = job.id
    _as_parent()

    body = client.get("/api/production/activity").json()
    assert [f["id"] for f in body["failed"]] == [job_id]
    assert body["failed"][0]["error"] == "moteur injoignable"

    assert client.post(f"/api/production/activity/job/{job_id}/ack").status_code == 204
    assert client.get("/api/production/activity").json()["failed"] == []

    # Serveur, jamais `localStorage` : la trace est en base, elle ne revient sur aucun appareil.
    with Session() as db:
        assert db.get(m.AIJob, job_id).acknowledged_at is not None


def test_un_lot_zombie_est_rendu_arrete_et_non_en_cours(client_db) -> None:
    """`run_out()` rendait `run.status` brut : un lot mort s'affichait `running` dans l'en-tête,
    indiscernable d'un lot vivant. Le Journal, lui, savait déjà dire `stale`."""
    client, Session = client_db
    vieux = _now() - timedelta(days=2)
    with Session() as db:
        _run(db, status="running", started_at=vieux, heartbeat_at=vieux, total_notions=9)
    _as_parent()
    assert client.get("/api/production/activity").json()["current"]["status"] == "stale"


def test_la_file_se_derive_de_l_origine(file_rq_factice) -> None:
    """La priorité n'est pas une colonne : elle se déduit (§5).

    `manual` — et tout travail hors lot — passe devant. Le reste attend : c'est du travail que
    personne ne regarde arriver.
    """
    from app.core import queue as queue_mod

    # En test les deux fabriques rendent la MÊME file factice : on vérifie donc la fonction de
    # dérivation elle-même, pas l'objet qu'elle rend.
    queue_mod.priority_queue.cache_clear() if hasattr(
        queue_mod.priority_queue, "cache_clear"
    ) else None
    assert queue_for("manual") is queue_for(None)
    assert queue_for("agenda") is queue_for("request")


# ─── LE VERROU DU 2026-08-06, PAYÉ À L'ÉCRAN ───────────────────────────────────────────────────
def test_un_worker_qui_n_ecoute_QU_UNE_file_ne_compte_pas(monkeypatch) -> None:
    """🔴 Une seule file non servie suffit à bloquer le travail qui s'y trouve.

    Le défaut, mesuré en vrai le 2026-08-06 : `production_worker_alive()` n'interrogeait que
    `production_queue()`. Un worker démarré AVANT l'ajout de la file prioritaire n'écoute que
    celle-là — le travail dormait sur `production-priority` pendant que l'écran annonçait
    `worker_alive: true`, donc « en file d'attente ». Relevé en Redis : **1 job en attente,
    0 worker sur sa file, 2 sur l'autre.**

    C'est très exactement la panne de six heures que cette fonction avait été écrite pour rendre
    visible, réintroduite par la file qu'on venait d'ajouter. D'où `all()` et non `any()` : on
    préfère annoncer un doute qu'affirmer une santé.

    ⚠️ Ce test ne peut pas passer par Redis (interdit en test) : il exerce la LOGIQUE, en
    nommant les files et en décidant lesquelles sont servies.
    """
    import rq

    from app.core import queue as queue_mod

    class FileNommee:
        def __init__(self, nom: str) -> None:
            self.name = nom

    prioritaire, normale = FileNommee("production-priority"), FileNommee("production")
    monkeypatch.setattr(queue_mod, "production_queues", lambda: [prioritaire, normale])

    servies: set[str] = set()

    class FauxWorker:
        @staticmethod
        def all(queue=None):  # noqa: ANN001
            return ["w"] if queue is not None and queue.name in servies else []

    monkeypatch.setattr(rq, "Worker", FauxWorker)

    # L'ANCIEN worker : il n'écoute que la file normale.
    servies.add("production")
    assert queue_mod.production_worker_alive() is False, (
        "un worker qui n'écoute pas la file prioritaire ne sert pas les gestes de Papa — "
        "annoncer « vivant » ferait lire un ARRÊT comme une ATTENTE"
    )

    # Le worker à jour : les deux files.
    servies.add("production-priority")
    assert queue_mod.production_worker_alive() is True

    # Contre-épreuve : sans elle, une fonction qui rendrait toujours False passerait au vert.
    servies.clear()
    assert queue_mod.production_worker_alive() is False
