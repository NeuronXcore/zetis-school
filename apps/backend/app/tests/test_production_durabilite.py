"""Durabilité de la production (ADR-0041 §10) — rien de ce qui est enfilé ne se perd.

⚠️ **Ce que ces tests ne peuvent PAS prouver.** Les files sont factices et Redis est interdit
(`conftest.file_rq_factice`, `autouse`). Aucun test ici ne démontre qu'un rejeu a lieu : RQ n'est
pas là. Ils démontrent la **décision** — ce que le backend écrit en base, et s'il laisse ou non
l'exception remonter jusqu'à RQ. C'est ce silence-là qui vaut « zéro tentative » (§10.2), et c'est
exactement pour ça qu'il faut un verrou dessus : un `raise` remis par réflexe rendrait le rejeu
typé inopérant sans qu'aucun autre test ne bouge.
"""

from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy import select

import app.db.models as m
from app.core.config import settings
from app.main import app
from app.modules.auth.deps import get_current_user
from app.tests.test_galaxy import _seed_svt


def _as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


class _FileMorte:
    """Redis éteint, vu depuis le backend. C'est le cas réel : `Error 61, connection refused`."""

    def enqueue(self, *_args, **_kwargs):
        raise ConnectionError("Error 61 connecting to localhost:6379. Connection refused.")


def _couper_la_file(monkeypatch) -> None:
    """⚠️ On remplace les **FABRIQUES**, jamais les `enqueue_*` — même point de greffe que
    `conftest.file_rq_factice`, et pour la même raison : `runs_router` lie ses imports au niveau
    module. Patcher les fonctions serait vert et sans effet (`fakes.FakeQueue` le documente)."""
    from app.core import queue as queue_mod

    for nom in ("priority_queue", "production_queue", "render_queue"):
        monkeypatch.setattr(queue_mod, nom, lambda: _FileMorte())


def _travail(db, **kw) -> m.AIJob:
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


def _lot(db, **kw) -> m.ProductionRun:
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


# --- §10.1 — l'enfilement devient sûr : rien de commité que la file n'ait accepté --------------


def _une_demande(client_db) -> int:
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
        return req.id


def test_file_coupee_ne_laisse_aucun_lot_fantome(client_db, monkeypatch) -> None:
    """🔒 Redis absent → 503, et **AUCUN `ProductionRun` en base**.

    Le lot était commité avant l'enfilement (`create_run`), donc une file injoignable laissait un
    lot `queued` pour toujours pendant qu'un 500 partait vers le navigateur. Pire que l'erreur : ce
    fantôme faisait ensuite échouer l'idempotence (`run_exists_for`) et bloquait la **vraie**
    création le jour où Redis revenait.
    """
    client, Session = client_db
    req_id = _une_demande(client_db)
    _couper_la_file(monkeypatch)
    _as_papa()

    resp = client.post(f"/api/production/runs/from-request?request_id={req_id}")

    assert resp.status_code == 503, resp.text
    assert "rien n'a été créé" in resp.json()["detail"]
    with Session() as db:
        assert db.scalars(select(m.ProductionRun)).all() == [], "un lot fantôme est resté en base"


def test_file_coupee_ne_laisse_aucun_travail_fantome(client_db, monkeypatch) -> None:
    """🔒 Même règle sur le travail unitaire — **le chemin de la barre** (ADR-0041 §3).

    Ici l'ordre ne peut PAS s'inverser : la ligne doit être commitée avant l'enfilement pour que le
    worker puisse la lire. Le remède est donc une compensation, et c'est elle qu'on verrouille.
    """
    client, Session = client_db
    with Session() as db:
        sid = db.scalar(select(m.Skill)).id
    _couper_la_file(monkeypatch)
    _as_papa()

    resp = client.post("/api/reports/class-council/equip-notion", json={"skill_id": sid})

    assert resp.status_code == 503, resp.text
    with Session() as db:
        assert db.scalars(select(m.AIJob)).all() == [], "un travail fantôme est resté en base"


def test_file_coupee_ne_laisse_aucune_capsule_en_rendu(client_db, tmp_path, monkeypatch) -> None:
    """🔒 Le même trou, sur une autre table — et il faisait DISPARAÎTRE une vidéo existante.

    `request_render` passait la capsule en `rendering` **et effaçait `video_url`** avant d'enfiler.
    File injoignable ⇒ capsule bloquée « en cours de rendu » indéfiniment, et la vidéo déjà rendue
    devenue invisible. Une panne de file ne doit pas retirer un contenu déjà produit.
    """
    from app.modules.capsules import service
    from app.tests.fakes import FakeLLMProvider, FakeTtsProvider

    monkeypatch.setattr(settings, "audio_storage_dir", str(tmp_path))
    _, Session = client_db
    with Session() as db:
        cap = service.create_capsule(db, FakeLLMProvider(), subject_id=1, instruction="Explique.")
        # Valider AVANT de synthétiser : une capsule déjà voisée déclenche le rendu automatique
        # à la validation, ce qui heurterait la file coupée avant le geste qu'on veut tester.
        service.set_validation(db, cap.id, "validated")
        service.synthesize_voice(db, FakeTtsProvider(), cap.id)
        db.refresh(cap)
        statut_avant, video_avant = cap.status, cap.video_url

        _couper_la_file(monkeypatch)
        with pytest.raises(HTTPException) as exc:
            service.request_render(db, cap.id)

        assert exc.value.status_code == 503
        db.refresh(cap)
        assert cap.status == statut_avant != "rendering"
        assert cap.video_url == video_avant


# --- §10.2 — le rejeu est borné ET typé -------------------------------------------------------


def _executant_qui_leve(monkeypatch, exc: Exception) -> None:
    from app.modules.production import jobs

    def boum(_db, _payload, _llm, _embedder):
        raise exc

    monkeypatch.setitem(jobs._EXECUTANTS, "equip_notion", boum)


def _worker_sur_la_base_de_test(monkeypatch, Session) -> None:
    """`run_ai_job` ouvre SA session (il ne tourne dans aucune requête HTTP) et construit les
    providers. On le branche sur la base du test — sans quoi il irait sur le vrai Postgres."""
    import app.db.base as base
    import app.modules.ai as ai

    monkeypatch.setattr(base, "SessionLocal", Session)
    monkeypatch.setattr(ai, "get_provider", lambda: None)
    monkeypatch.setattr(ai, "get_embedder", lambda: None)


def test_echec_structurel_zero_rejeu(client_db, monkeypatch) -> None:
    """🔒 **LE verrou de la slice.** Un échec structurel ne remonte PAS — donc RQ ne rejoue pas.

    Une notion sans leçon est insatisfaisable *par construction* : la rejouer ne peut rien produire
    d'autre que ~69 s de GPU brûlées, tout ce qui suit dans la file retardé d'autant, et le verdict
    que Papa attend affiché trois fois plus tard.

    ⚠️ **L'assertion qui compte est l'absence de `pytest.raises`.** Depuis que `enqueue_ai_job`
    pose un `Retry`, laisser remonter l'exception veut dire « rejoue-moi » — RQ ne regarde pas
    laquelle. Un `raise` remis ici par symétrie avec `worker_media` rendrait le typage inopérant
    en silence.
    """
    _, Session = client_db
    with Session() as db:
        jid = _travail(db).id
    _worker_sur_la_base_de_test(monkeypatch, Session)
    _executant_qui_leve(monkeypatch, ValueError("Notion sans leçon — rien à quoi rattacher."))

    sortie = jobs_run(jid)  # ne doit PAS lever

    assert "Notion sans leçon" in sortie["error"]
    with Session() as db:
        job = db.get(m.AIJob, jid)
        assert job.status == "failed"
        assert job.finished_at is not None, "un travail sans rejeu est FINI, il ne repart pas"


def test_echec_transitoire_repart_en_file(client_db, monkeypatch) -> None:
    """🔒 Le seul cas où réessayer a un sens : rien du monde n'a changé sauf le transport.

    Le travail retourne en `queued` — c'est la vérité, RQ va le reprendre — et **pas** en `failed` :
    un échec à acquitter (§8) qui se réparerait tout seul serait pire qu'un échec.
    """
    _, Session = client_db
    with Session() as db:
        jid = _travail(db).id
    _worker_sur_la_base_de_test(monkeypatch, Session)
    _executant_qui_leve(monkeypatch, httpx.ConnectError("All connection attempts failed"))

    with pytest.raises(httpx.ConnectError):
        jobs_run(jid)

    with Session() as db:
        job = db.get(m.AIJob, jid)
        assert job.status == "queued", "un travail rejoué attend, il n'a pas échoué"
        assert job.finished_at is None, "rien n'est fini tant qu'un rejeu est prévu"
        assert job.error_message  # le motif est gardé, même en attendant


def test_un_5xx_est_transitoire_un_4xx_ne_l_est_pas() -> None:
    """🔒 `raise_for_status()` d'Ollama produit les deux, et ils ne se rejouent pas pareil.

    5xx = Ollama va mal (il charge un modèle, il redémarre) : réessayer a un sens. 4xx = la demande
    est mauvaise (modèle inexistant, schéma refusé) : la rejouer à l'identique donnera la même
    réponse. Les confondre ferait rejouer deux fois un nom de modèle mal orthographié.
    """
    from app.modules.production import failures

    def _statut(code: int) -> httpx.HTTPStatusError:
        requete = httpx.Request("POST", "http://localhost:11434/api/generate")
        return httpx.HTTPStatusError(
            "x", request=requete, response=httpx.Response(code, request=requete)
        )

    assert failures.is_transient(_statut(503)) is True
    assert failures.is_transient(_statut(404)) is False
    # ⚠️ Le défaut est STRUCTUREL : un échec inconnu remonte tout de suite à la barre plutôt que
    # de tourner trois fois en silence.
    assert failures.is_transient(RuntimeError("inconnu")) is False
    # ⚠️ `OSError` reste dehors alors que `ConnectionError` en hérite : « fichier introuvable » et
    # « disque plein » en sont aussi, et ils sont structurels au possible.
    assert failures.is_transient(OSError("No such file")) is False


# --- §10.3 / §10.4 — le travail mort se voit, et se referme sans clic --------------------------


def test_un_travail_dont_le_worker_est_mort_se_lit_arrete(client_db) -> None:
    """🔒 `/activity` rend `stale`, **sans qu'aucun balayage soit passé**.

    C'est le §1 qui l'exige : la barre est une fenêtre, la vérité se dérive à la lecture. Faire
    dépendre l'affichage du balayage l'aurait fait mentir jusqu'à **trois heures** — la période du
    seul réveil périodique du dépôt.
    """
    client, Session = client_db
    mort = _now() - timedelta(seconds=settings.production_job_timeout + 60)
    with Session() as db:
        _travail(db, status="running", started_at=mort, created_at=mort)
    _as_papa()

    corps = client.get("/api/production/activity").json()

    assert corps["current"]["status"] == "stale"
    assert corps["current"]["pct"] is None


def test_un_travail_qui_ATTEND_n_est_pas_un_travail_mort(client_db) -> None:
    """🔒 Un travail `queued` depuis des heures est intact — le worker est arrêté, voilà tout.

    Le confondre avec un zombie ferait passer en échec une file **qui repartira toute seule au
    prochain démarrage du worker**. C'est `worker_alive` qui dit cette panne-là, pas le statut.

    ⚠️ **`started_at` est VIEUX et pourtant renseigné, et c'est tout l'objet de ce cas.** Un premier
    jet de ce test créait un travail sans `started_at` — il passait par la garde « rien à juger »
    au lieu de la garde sur le statut, donc il **restait vert quand on supprimait celle-ci**
    (sabotage du 2026-08-06). L'état modélisé ici est réel et atteignable : un travail rendu à la
    file après un échec transitoire (§10.2) **garde le `started_at` de sa première tentative**. Si
    le worker meurt ensuite, il attend indéfiniment avec un démarrage très ancien — sans cette
    garde, il serait déclaré mort alors qu'il n'a plus qu'à être repris.
    """
    client, Session = client_db
    with Session() as db:
        _travail(
            db,
            status="queued",
            started_at=_now() - timedelta(seconds=settings.production_job_timeout + 3600),
            error_message="All connection attempts failed",
        )
    _as_papa()

    assert client.get("/api/production/activity").json()["current"]["status"] == "queued"


def test_le_balayage_referme_lots_ET_travaux_sans_clic(client_db) -> None:
    """🔒 Le ménage porte sur les DEUX modèles.

    `close_stale_runs` existait pour les lots et n'était appelé qu'avant une création — donc
    seulement quand un humain cliquait. Les travaux unitaires, nés à la slice A, n'avaient rien
    du tout.
    """
    from app.modules.production import sweep

    _, Session = client_db
    limite = settings.production_heartbeat_timeout_minutes
    with Session() as db:
        lot = _lot(
            db,
            status="running",
            heartbeat_at=_now() - timedelta(minutes=limite + 5),
        )
        job = _travail(
            db,
            status="running",
            started_at=_now() - timedelta(seconds=settings.production_job_timeout + 60),
        )
        lot_id, job_id = lot.id, job.id

        assert sweep.sweep(db) == {"runs": 1, "jobs": 1}

        db.expire_all()
        assert db.get(m.ProductionRun, lot_id).status == "failed"
        mort = db.get(m.AIJob, job_id)
        assert mort.status == "failed"
        # Le motif est écrit SUR la ligne : la barre le montre, et Papa doit l'acquitter (§8).
        assert mort.error_message == sweep.MOTIF_ZOMBIE
        assert mort.finished_at is not None


def test_le_balayage_epargne_ce_qui_est_vivant(client_db) -> None:
    """🔒 Un lot qui bat et un travail qui vient de démarrer ne sont pas touchés.

    Sans ce verrou, un seuil mal placé passerait « tout referme » — et le test au-dessus resterait
    vert. C'est la contre-épreuve du précédent, pas une redite.
    """
    from app.modules.production import sweep

    _, Session = client_db
    with Session() as db:
        _lot(db, status="running", heartbeat_at=_now() - timedelta(minutes=1))
        _travail(db, status="running", started_at=_now() - timedelta(seconds=30))

        assert sweep.sweep(db) == {"runs": 0, "jobs": 0}


def jobs_run(job_id: int) -> dict:
    """Indirection minuscule : `run_ai_job` est importé à l'APPEL, après les monkeypatch."""
    from app.modules.production.jobs import run_ai_job

    return run_ai_job(job_id)


# --- §4 — ce que la migration en file ne doit PAS perdre --------------------------------------


def test_curriculum_utilise_le_provider_CLOUD_et_pas_le_local(client_db, monkeypatch) -> None:
    """🔒 **La dérogation ADR-0009 survit à la migration en file.**

    Les tâches `curriculum_*` sont routées vers Anthropic `claude-sonnet-5` — dérogation étroite et
    bornée : zéro donnée de Massimo dans ces prompts. Or `run_ai_job` passe `get_provider()`,
    c'est-à-dire le moteur **LOCAL**. Un exécutant qui se contenterait de son argument `llm` aurait
    donc **silencieusement annulé la dérogation** : même code, même sortie apparente, référentiel de
    bien moindre qualité, et aucun test pour le dire.

    ⚠️ **La contre-épreuve est le moteur local PIÉGÉ.** Affirmer seulement « le provider cloud a
    été appelé » laisserait passer un exécutant qui appellerait les deux. Ici, toucher au local
    fait échouer le travail.
    """
    from app.tests.fakes import FakeLLMProvider
    from app.tests.test_curriculum_api import _seed_year_subject

    _, Session = client_db
    sys_id = _seed_year_subject(Session)

    appels_cloud: list[int] = []

    class _CloudFactice(FakeLLMProvider):
        def generate(self, *a, **kw):  # noqa: D102
            appels_cloud.append(1)
            return super().generate(*a, **kw)

    class _LocalPiege:
        def generate(self, *_a, **_kw):
            raise AssertionError(
                "la dérogation cloud ADR-0009 est perdue : `curriculum_*` a appelé le moteur LOCAL"
            )

    import app.db.base as base
    import app.modules.ai as ai
    import app.modules.curriculum as curriculum

    monkeypatch.setattr(base, "SessionLocal", Session)
    monkeypatch.setattr(ai, "get_provider", lambda: _LocalPiege())
    monkeypatch.setattr(ai, "get_embedder", lambda: None)
    monkeypatch.setattr(curriculum, "get_curriculum_provider", lambda: _CloudFactice())

    with Session() as db:
        jid = _travail(
            db,
            job_type="curriculum_chapters",
            input_json={"school_year_subject_id": sys_id},
        ).id

    sortie = jobs_run(jid)

    assert appels_cloud, "le provider CLOUD n'a pas été appelé du tout"
    assert sortie.get("chapter_ids"), f"le travail n'a rien produit : {sortie}"
    with Session() as db:
        assert db.get(m.AIJob, jid).status == "succeeded"


# --- Addendum §16-§18 — le Journal accueille les travaux unitaires ------------------------------


def _travail_de_file(db, **kw) -> m.AIJob:
    """Un travail tel que `travaux.enfiler` le crée — **avec son marqueur de file**."""
    from app.modules.ai.travaux import ACTEUR_FILE

    return _travail(db, created_by=ACTEUR_FILE, **kw)


def test_le_journal_montre_les_travaux_unitaires(client_db) -> None:
    """🔒 Un travail hors lot apparaît au Journal, avec son libellé de Papa.

    C'est la question qui a ouvert l'addendum : le Journal était bâti sur `ProductionRun` seul, donc
    quinze producteurs sur dix-huit n'y laissaient aucune trace — dans un chantier qui s'appelle
    « tout ce qui produit se voit ».
    """
    client, Session = client_db
    with Session() as db:
        _travail_de_file(db, status="succeeded", duration_ms=53_600)
    _as_papa()

    corps = client.get("/api/production/journal").json()

    assert len(corps["travaux"]) == 1, "le travail unitaire n'apparaît pas au Journal"
    t = corps["travaux"][0]
    assert t["label"].startswith("Équipement"), f"libellé technique : {t['label']}"
    assert t["trigger"] == "manual"  # l'ORIGINE, dérivée (§3.2)
    assert corps["travaux_exclus"] is None


def test_un_travail_ne_porte_NI_regime_NI_veto(client_db) -> None:
    """🔒 **Le verrou du §17.** Un travail ne fait pas semblant d'être un lot.

    ⚠️ Il serait tentant d'écrire `zetis_mode: "manuel"` — un travail hors lot EST manuel par
    construction. Ce serait confondre l'**origine** (qui a demandé) avec le **régime** (sous quelles
    règles ZETIS pouvait servir sans relecture), que l'ADR-0034 sépare exprès.

    ⚠️ Et aucune pièce, donc aucun veto : le retrait s'appuie sur le tamponnage `production_run_id`
    des objets produits, qu'un `AIJob` ne pose pas. Un bouton de retrait serait inerte.
    """
    client, Session = client_db
    with Session() as db:
        _travail_de_file(db, status="succeeded")
    _as_papa()

    t = client.get("/api/production/journal").json()["travaux"][0]

    for interdit in ("zetis_mode", "zetis_mode_source", "pieces", "events"):
        assert interdit not in t, (
            f"`{interdit}` ne doit pas exister sur un travail : l'écran afficherait une case vide "
            "là où il n'y a rien à savoir, ou un retrait qui ne peut rien retirer"
        )


def test_un_filtre_que_les_travaux_ne_portent_pas_les_ecarte_ET_LE_DIT(client_db) -> None:
    """🔒 **Le verrou du §18.** Une exclusion muette se lit comme un vide.

    `piece`, `mode` et le chapitre n'ont aucun sens sur un travail unitaire. Plutôt que de lui
    inventer une valeur, on l'écarte — et la page l'annonce, en nommant LA DIMENSION. « Ce filtre ne
    porte que sur les lots » laisserait Papa chercher lequel.
    """
    client, Session = client_db
    with Session() as db:
        _travail_de_file(db, status="succeeded")
    _as_papa()

    corps = client.get("/api/production/journal?piece=fiche").json()

    assert corps["travaux"] == [], "un filtre par pièce ne doit rendre que des lots"
    assert corps["travaux_exclus"], "l'exclusion est muette — Papa lira un vide"
    assert "pièce" in corps["travaux_exclus"]


def test_les_TRACES_nentrent_pas_au_journal(client_db) -> None:
    """🔒 Une trace n'est pas un travail que Papa a demandé — c'est un appel LLM à l'intérieur.

    Mesuré en base : 143 traces `srs_cards_generate` pour une poignée de gestes. Les faire entrer
    noierait le Journal, et la même confusion faisait déjà mentir l'estimation d'un facteur 8.
    """
    client, Session = client_db
    with Session() as db:
        _travail(db, status="succeeded", created_by="parent")  # une TRACE : pas le marqueur de file
    _as_papa()

    assert client.get("/api/production/journal").json()["travaux"] == []


def test_la_pagination_porte_sur_LUNION_des_deux_modeles(client_db) -> None:
    """🔒 **Le verrou du §16.** Paginer chaque modèle à part perdrait ce qui tombe entre les deux.

    Douze travaux, une page de cinq : le total doit être douze, pas cinq — et une seconde page doit
    exister. Une pagination faite sur les lots seuls rendrait `total = 0` alors que la page est
    pleine, c'est-à-dire « un défaut qui ne ressemble pas à un défaut ».
    """
    client, Session = client_db
    with Session() as db:
        for _ in range(12):
            _travail_de_file(db, status="succeeded")
    _as_papa()

    page = client.get("/api/production/journal?limit=5").json()

    assert len(page["travaux"]) == 5
    assert page["total"] == 12, "le total ne porte pas sur l'union"
    assert page["has_more"] is True
