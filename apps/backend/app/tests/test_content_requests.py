"""Liste d'attente de contenus réclamés par l'enfant (addendum ADR-0027).

Couvre : dédup forte `(student, skill, kind)` = une ligne, `create` idempotent qui RÉ-ACTIVE une
ligne triée, `content_kind` invalide ignoré (best-effort), liste enrichie (skill_name) + triage
Papa, garde parent (403 child) ; ÉMISSION depuis le chat sur les deux déclencheurs (type manquant ;
notion résolue mais vide → cours) et caractère NON bloquant de l'émission.

Depuis le 2026-08-01, couvre aussi la **route enfant en écriture** (`POST
/api/student/content-requests`, addendum ADR-0027) : ses trois garde-fous (vocabulaire fermé,
plafond, visibilité de la notion) et l'**absence** de toute route de lecture ou de triage côté
élève — cette absence est une décision, pas un oubli de v1.
"""

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.chat import actions
from app.modules.content_requests import service
from app.modules.content_requests.schemas import ContentKind
from app.tests.fakes import FakeLLMProvider
from app.modules.ai import get_provider
from app.tests.test_galaxy import _seed_svt
from app.tests.test_production_coverage import _FICHE_SPEC


def _as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def _skill_id(Session) -> int:
    db = Session()
    try:
        return db.query(m.Skill).first().id
    finally:
        db.close()


# --- Service : dédup, ré-activation, vocabulaire, enrichissement ------------------------------


def test_create_dedupes_on_student_skill_kind(client_db) -> None:
    _, Session = client_db
    skill_id = _skill_id(Session)
    db = Session()
    try:
        service.create_request(db, student_id=1, skill_id=skill_id, content_kind="fiche")
        service.create_request(db, student_id=1, skill_id=skill_id, content_kind="fiche")
        db.commit()
        assert db.query(m.ContentRequest).count() == 1  # « fractions × 5 » = 1 ligne
    finally:
        db.close()


def test_create_reactivates_a_triaged_request(client_db) -> None:
    """Massimo redemande un contenu déjà trié (done/dismissed) → la demande repasse `pending`."""
    _, Session = client_db
    skill_id = _skill_id(Session)
    db = Session()
    try:
        created = service.create_request(db, student_id=1, skill_id=skill_id, content_kind="card")
        db.commit()
        service.set_status(db, created["id"], "dismissed")
        again = service.create_request(db, student_id=1, skill_id=skill_id, content_kind="card")
        db.commit()
        assert again["id"] == created["id"]  # même ligne (pas de doublon)
        assert again["status"] == "pending"  # ré-activée
        assert db.query(m.ContentRequest).count() == 1
    finally:
        db.close()


def test_create_ignores_unknown_content_kind(client_db) -> None:
    """Best-effort : un `content_kind` hors vocabulaire est ignoré (aucune ligne, aucune erreur)."""
    _, Session = client_db
    skill_id = _skill_id(Session)
    db = Session()
    try:
        assert service.create_request(db, student_id=1, skill_id=skill_id, content_kind="wat") is None
        db.commit()
        assert db.query(m.ContentRequest).count() == 0
    finally:
        db.close()


def test_list_is_enriched_with_skill_name(client_db) -> None:
    _, Session = client_db
    skill_id = _skill_id(Session)
    db = Session()
    try:
        service.create_request(db, student_id=1, skill_id=skill_id, content_kind="fiche")
        db.commit()
        rows = service.list_requests(db)
        assert len(rows) == 1
        assert rows[0]["skill_name"] == "Nombres relatifs"
        assert rows[0]["content_kind"] == "fiche" and rows[0]["source"] == "chat_orchestrator"
    finally:
        db.close()


# --- Routes Papa : liste, triage, garde parent -----------------------------------------------


def test_papa_lists_and_triages(client_db) -> None:
    client, Session = client_db
    skill_id = _skill_id(Session)
    db = Session()
    created = service.create_request(db, student_id=1, skill_id=skill_id, content_kind="mindmap")
    db.commit()
    req_id = created["id"]
    db.close()

    _as_papa()
    listed = client.get("/api/content-requests").json()
    assert len(listed) == 1 and listed[0]["content_kind"] == "mindmap"

    patched = client.patch(f"/api/content-requests/{req_id}", json={"status": "done"})
    assert patched.status_code == 200 and patched.json()["status"] == "done"
    assert client.get("/api/content-requests").json() == []  # « pending » (défaut) vide


def test_papa_patch_invalid_status_is_400(client_db) -> None:
    client, Session = client_db
    skill_id = _skill_id(Session)
    db = Session()
    created = service.create_request(db, student_id=1, skill_id=skill_id, content_kind="cours")
    db.commit()
    req_id = created["id"]
    db.close()
    _as_papa()
    assert client.patch(f"/api/content-requests/{req_id}", json={"status": "wat"}).status_code == 400
    assert client.patch("/api/content-requests/99999", json={"status": "done"}).status_code == 404


def test_papa_route_requires_parent(client_db) -> None:
    """Le rôle child (conftest) est refusé sur la route Papa."""
    client, _ = client_db
    assert client.get("/api/content-requests").status_code == 403


def test_pending_count_feeds_notification(client_db) -> None:
    """La pastille de notification lit `/count` (nombre en attente)."""
    client, Session = client_db
    skill_id = _skill_id(Session)
    _as_papa()
    assert client.get("/api/content-requests/count").json() == {"pending": 0}
    db = Session()
    service.create_request(db, student_id=1, skill_id=skill_id, content_kind="fiche")
    db.commit()
    db.close()
    assert client.get("/api/content-requests/count").json() == {"pending": 1}


# --- Émission depuis le chat (aveugle au contenu, best-effort) -------------------------------

RESOLVING = "Nombres relatifs"  # = nom exact de la Skill seedée → ancrage garanti


def _use_chat_llm(chat: dict) -> None:
    app.dependency_overrides[get_provider] = lambda: FakeLLMProvider(chat=chat)


def _chat_intent(intent: dict, reply: str = "D'accord !") -> dict:
    return {
        "reply": reply,
        "declared_difficulty": {"declared": False, "kind": ""},
        "tool_suggestion": "",
        "intent": intent,
    }


def _open(client) -> str:
    return client.post("/api/student/chat/sessions").json()["session_id"]


def _say(client, sid: str, **body):
    return client.post(f"/api/student/chat/sessions/{sid}/messages", json=body)


def _panel(skill_id: int, acts: list[dict]) -> dict:
    return {
        "skill_id": skill_id,
        "name": RESOLVING,
        "status": "weak",
        "chapter_title": "Nombres",
        "subject_slug": "mathematiques",
        "subject_name": "Mathématiques",
        "actions": acts,
    }


def test_chat_emits_request_when_asked_tool_is_missing(client_db, monkeypatch) -> None:
    """Déclencheur (a) : Massimo demande une fiche absente → une demande `fiche` en attente.

    ⚠️ **Ce panneau ne porte AUCUN contenu durable** — la notion est donc « vide » au sens du
    déclencheur (b), et depuis l'`adr-0059` §16 la porte `cours` **s'ajoute** à la demande. Le
    test attendait une seule ligne jusqu'au 2026-08-15 : ce n'est pas (a) qui a changé, c'est (b)
    qui ne se laisse plus masquer par le repli. Ce que (a) verrouille — *le type demandé est
    enregistré tel quel, en `pending`, sur la bonne notion* — est inchangé.
    """
    client, Session = client_db
    skill_id = _skill_id(Session)
    monkeypatch.setattr(
        actions, "notion_panel", lambda db, sid: _panel(skill_id, [{"kind": "fiche", "available": False}])
    )
    _use_chat_llm(_chat_intent({"kind": "open_notion", "tool": "fiche"}))
    sid = _open(client)
    assert _say(client, sid, text=RESOLVING).status_code == 200

    db = Session()
    rows = db.query(m.ContentRequest).all()
    fiche = [r for r in rows if r.content_kind == "fiche"]
    assert len(fiche) == 1
    assert fiche[0].skill_id == skill_id and fiche[0].status == "pending"
    # La porte des dérivés accompagne la demande, elle ne la remplace pas.
    assert sorted(r.content_kind for r in rows) == ["cours", "fiche"]
    db.close()


def test_chat_emits_cours_request_when_notion_is_empty(client_db, monkeypatch) -> None:
    """Déclencheur (b) : notion résolue mais AUCUN contenu → demande de `cours` (la porte)."""
    client, Session = client_db
    skill_id = _skill_id(Session)
    # Menu vide : aucun `available`. Le LLM n'a rien rempli (intent=none) → le repli couvre le cas.
    monkeypatch.setattr(
        actions, "notion_panel", lambda db, sid: _panel(skill_id, [{"kind": "cours", "available": False}])
    )
    _use_chat_llm(_chat_intent({"kind": "none"}, "Chouette sujet !"))
    sid = _open(client)
    assert _say(client, sid, text=RESOLVING).status_code == 200

    db = Session()
    rows = db.query(m.ContentRequest).all()
    assert len(rows) == 1 and rows[0].content_kind == "cours"
    db.close()


def test_chat_empty_notion_is_honest_and_requests_cours_without_offering_eli5(
    client_db, monkeypatch
) -> None:
    """Déclencheur (b) + décision 2026-07-30 : la notion n'a AUCUN contenu validé (pas de cours).
    ELI5 inventerait → on ne l'offre PAS. ZETIS est honnête (« je le note ») et enregistre
    une demande de `cours`. Aucune action (rien de validé à ouvrir).

    ⚠️ FIXTURE mise à jour le 2026-08-01 (les assertions, elles, sont inchangées) : le faux
    panneau posait `eli5 available=True` avec `cours available=False`, un couple que
    `resolve_panoply` ne peut PLUS produire depuis que la règle ELI5 y est descendue. Le laisser
    aurait fait passer le test sur un état impossible en production."""
    client, Session = client_db
    skill_id = _skill_id(Session)
    monkeypatch.setattr(
        actions,
        "notion_panel",
        lambda db, sid: _panel(
            skill_id, [{"kind": "eli5", "available": False}, {"kind": "cours", "available": False}]
        ),
    )
    _use_chat_llm(_chat_intent({"kind": "none"}, "Chouette !"))
    sid = _open(client)
    resp = _say(client, sid, text=RESOLVING)
    body = resp.json()
    assert body["action"] is None  # rien de validé → pas d'ELI5 génératif offert
    assert "je le note" in body["reply"]  # honnêteté
    db = Session()
    rows = db.query(m.ContentRequest).all()
    assert len(rows) == 1 and rows[0].content_kind == "cours"
    db.close()


def test_chat_eli5_intent_on_cousless_notion_does_not_generate(client_db, monkeypatch) -> None:
    """Cas réel post-`chat_v2` + décision : le LLM propose `tool=eli5` sur une notion SANS cours.
    ELI5 inventerait → on refuse de router vers lui ; honnêteté + demande de `cours`. Aucune action.

    ⚠️ FIXTURE mise à jour le 2026-08-01 (assertions inchangées), même motif que le test
    précédent : `eli5 available=True` sans cours est devenu un état que le prédicat partagé
    n'émet plus."""
    client, Session = client_db
    skill_id = _skill_id(Session)
    monkeypatch.setattr(
        actions,
        "notion_panel",
        lambda db, sid: _panel(
            skill_id, [{"kind": "eli5", "available": False}, {"kind": "cours", "available": False}]
        ),
    )
    _use_chat_llm(_chat_intent({"kind": "open_notion", "tool": "eli5"}))
    sid = _open(client)
    body = _say(client, sid, text=RESOLVING).json()
    assert body["action"] is None and "je le note" in body["reply"]
    db = Session()
    rows = db.query(m.ContentRequest).all()
    assert len(rows) == 1 and rows[0].content_kind == "cours"
    db.close()


def test_chat_eli5_offered_when_cours_exists(client_db, monkeypatch) -> None:
    """Symétrique : ELI5 sur une notion AVEC cours validé → ELI5 s'y ancre, on route vers lui, aucune
    demande (rien ne manque)."""
    client, Session = client_db
    skill_id = _skill_id(Session)
    monkeypatch.setattr(
        actions,
        "notion_panel",
        lambda db, sid: _panel(
            skill_id,
            [{"kind": "cours", "available": True, "lesson_id": 3}, {"kind": "eli5", "available": True}],
        ),
    )
    _use_chat_llm(_chat_intent({"kind": "open_notion", "tool": "eli5"}))
    sid = _open(client)
    action = _say(client, sid, text=RESOLVING).json()["action"]
    assert action and action["route"].startswith("/eli5?skill_id=")  # cours validé → ELI5 ancré
    db = Session()
    assert db.query(m.ContentRequest).count() == 0
    db.close()


def test_chat_never_promises_papa_without_recording(client_db, monkeypatch) -> None:
    """🔴 Test RETOURNÉ le 2026-08-15 (`adr-0059` §16) — il verrouillait le repli, pas la règle.

    Il vérifiait qu'un outil hors mapping (`quiz`, `capsule`) enregistrait une demande de
    **cours**, au nom de « la promesse doit être tenue ». La promesse l'était — mais avec le
    mauvais objet : Papa lisait « on me demande un cours » quand son fils avait demandé un quiz.
    Et la page matière, elle, émettait déjà `quiz` sans repli : le chat était le seul menteur.

    Ce que ce test verrouille désormais est la MÊME règle, appliquée sans traduction : **ZETIS ne
    promet que ce qu'il enregistre, et il enregistre ce qu'on lui a demandé.**

    Sabotage : remettre `_TOOL_TO_CONTENT_KIND.get(tool, "cours")`.
    """
    client, Session = client_db
    skill_id = _skill_id(Session)
    monkeypatch.setattr(
        actions,
        "notion_panel",
        lambda db, sid: _panel(
            skill_id,
            [
                {"kind": "cours", "available": True, "lesson_id": 3},
                {"kind": "fiche", "available": True, "fiche_id": 9},
                {"kind": "quiz", "available": False},
            ],
        ),
    )
    _use_chat_llm(_chat_intent({"kind": "open_notion", "tool": "quiz"}))
    sid = _open(client)
    body = _say(client, sid, text=RESOLVING).json()
    assert "je le note" in body["reply"]  # la promesse est faite…
    db = Session()
    rows = db.query(m.ContentRequest).all()
    # … et elle est TENUE, sur le VRAI type. La notion porte du durable (cours + fiche) : la
    # porte « cours » ne s'ajoute donc pas — une seule ligne, celle qu'il a demandée.
    assert len(rows) == 1 and rows[0].content_kind == "quiz"
    db.close()


def test_la_porte_cours_s_ajoute_sur_une_notion_vide_sans_remplacer_la_demande(
    client_db, monkeypatch
) -> None:
    """`adr-0059` §16 — le déclencheur « notion vide » est PROMU, il ne remplace plus.

    Le repli faisait ce travail par accident, un cas sur deux : sur une notion vide comme sur une
    notion pleine, demander un quiz enregistrait un cours. Désormais Papa reçoit **les deux**
    lignes quand la notion est vide — ce que son fils a demandé, ET ce qu'il faut produire
    d'abord pour que ce soit possible.

    Sabotage : ne poser que le premier signal, ou ne pas étendre le déclencheur à cette branche.
    """
    client, Session = client_db
    skill_id = _skill_id(Session)
    monkeypatch.setattr(
        actions,
        "notion_panel",
        lambda db, sid: _panel(
            skill_id,
            [  # AUCUN contenu durable : ni cours, ni fiche, ni carte, ni révision.
                {"kind": "cours", "available": False},
                {"kind": "quiz", "available": False},
            ],
        ),
    )
    _use_chat_llm(_chat_intent({"kind": "open_notion", "tool": "quiz"}))
    sid = _open(client)
    _say(client, sid, text=RESOLVING)
    db = Session()
    kinds = sorted(r.content_kind for r in db.query(m.ContentRequest).all())
    assert kinds == ["cours", "quiz"], "la porte s'ajoute, elle ne remplace pas"
    db.close()


def test_un_outil_hallucine_ne_promet_RIEN(client_db, monkeypatch) -> None:
    """🔴 `adr-0059` §16 — sans repli, une valeur inventée par le moteur ne doit RIEN promettre.

    C'est la contrepartie exacte de la révocation : le repli existait pour que « je le note » ne
    soit jamais un mensonge. Il tenait la promesse en la déviant. Ici, ZETIS ne promet pas — il
    reste honnête **et** silencieux, au lieu d'honnête et menteur.

    Sabotage : garder « — je le note » dans la note alors qu'aucune demande n'est émise (le
    mensonge inverse), ou rétablir le repli.
    """
    client, Session = client_db
    skill_id = _skill_id(Session)
    monkeypatch.setattr(
        actions,
        "notion_panel",
        lambda db, sid: _panel(
            skill_id,
            [
                {"kind": "cours", "available": True, "lesson_id": 3},
                {"kind": "fiche", "available": True, "fiche_id": 9},
            ],
        ),
    )
    _use_chat_llm(_chat_intent({"kind": "open_notion", "tool": "podcast"}))
    sid = _open(client)
    body = _say(client, sid, text=RESOLVING).json()
    assert "je le note" not in body["reply"], "aucune promesse quand rien ne sera enregistré"
    db = Session()
    assert db.query(m.ContentRequest).count() == 0
    db.close()


def test_reactivated_request_resurfaces_first(client_db) -> None:
    """Anti-régression (review) : une demande triée puis REDEMANDÉE doit remonter en tête de la file
    Papa (tri `updated_at`), sinon elle reste enterrée sous des demandes plus récentes.

    Les dates sont posées EXPLICITEMENT (scénario réel : la vieille demande date de 3 semaines) —
    `func.now()` a une granularité d'une seconde sur SQLite, un test « en temps réel » y serait
    indécidable."""
    from datetime import datetime, timedelta, timezone

    _, Session = client_db
    skill_id = _skill_id(Session)
    db = Session()
    try:
        old = service.create_request(db, student_id=1, skill_id=skill_id, content_kind="fiche")
        recent = service.create_request(db, student_id=1, skill_id=skill_id, content_kind="mindmap")
        db.commit()
        now = datetime.now(timezone.utc)
        # La fiche : demandée il y a 3 semaines, puis écartée par Papa.
        old_row = db.get(m.ContentRequest, old["id"])
        old_row.created_at = old_row.updated_at = now - timedelta(days=21)
        old_row.status = "dismissed"
        # La mindmap : demandée hier, toujours en attente.
        recent_row = db.get(m.ContentRequest, recent["id"])
        recent_row.created_at = recent_row.updated_at = now - timedelta(days=1)
        db.commit()

        # Massimo redemande la fiche aujourd'hui → réactivation (updated_at bumpé à maintenant).
        service.create_request(db, student_id=1, skill_id=skill_id, content_kind="fiche")
        db.commit()

        rows = service.list_requests(db)
        assert [r["content_kind"] for r in rows] == ["fiche", "mindmap"]  # la réactivée est en tête
    finally:
        db.close()


def test_chat_emission_never_breaks_the_turn(client_db, monkeypatch) -> None:
    """Best-effort : une exception à l'émission n'échoue PAS le tour de chat."""
    client, Session = client_db
    skill_id = _skill_id(Session)
    monkeypatch.setattr(
        actions, "notion_panel", lambda db, sid: _panel(skill_id, [{"kind": "fiche", "available": False}])
    )

    def _boom(*a, **k):
        raise RuntimeError("file en panne")

    monkeypatch.setattr(service, "create_request", _boom)
    _use_chat_llm(_chat_intent({"kind": "open_notion", "tool": "fiche"}))
    sid = _open(client)
    resp = _say(client, sid, text=RESOLVING)
    assert resp.status_code == 200  # la conversation continue malgré la file en panne

def test_chat_survives_a_real_sql_failure_in_the_queue(client_db, monkeypatch) -> None:
    """Anti-régression (review) : une VRAIE erreur SQL (pas un simple RuntimeError) invalidait la
    Session — toutes les écritures suivantes du tour (événements, ai_jobs, commit final) levaient
    alors `PendingRollbackError` → 500 alors que la réponse était déjà générée. Le SAVEPOINT doit
    absorber l'échec ET laisser le tour committer (événement `chat_topic` bien écrit)."""
    from sqlalchemy.exc import IntegrityError

    client, Session = client_db
    skill_id = _skill_id(Session)
    monkeypatch.setattr(
        actions,
        "notion_panel",
        lambda db, sid: _panel(skill_id, [{"kind": "fiche", "available": False}]),
    )

    def _sql_boom(db, **kwargs):
        db.flush()  # la session est bien vivante avant l'échec
        raise IntegrityError("INSERT ...", {}, Exception("duplicate key"))

    monkeypatch.setattr(service, "create_request", _sql_boom)
    _use_chat_llm(_chat_intent({"kind": "open_notion", "tool": "fiche"}))
    sid = _open(client)
    resp = _say(client, sid, text=RESOLVING)
    assert resp.status_code == 200  # le tour aboutit malgré l'échec SQL

    # …et la transaction du tour a bien été committée (l'événement de sujet existe).
    db = Session()
    events = db.query(m.LearningEvent).filter(m.LearningEvent.event_type == "chat_topic").count()
    db.close()
    assert events == 1


# --- Route ENFANT en écriture (addendum ADR-0027) ----------------------------------------
#
# Décision de SÉCURITÉ : un module jusqu'ici `require_parent` s'ouvre en écriture à l'enfant.
# Les trois garde-fous ci-dessous sont la contrepartie de cette ouverture, et le troisième
# (visibilité) est le seul qui empêche la route de devenir un oracle d'existence sur les
# brouillons de Papa.

_ROUTE = "/api/student/content-requests"


def _rows(Session) -> list:
    db = Session()
    try:
        return db.query(m.ContentRequest).all()
    finally:
        db.close()


def test_le_vocabulaire_du_schema_suit_celui_du_service() -> None:
    """Test-verrou : le `Literal` du schéma et `service.CONTENT_KINDS` doivent rester alignés.

    Le premier produit le 422, le second garde `create_request`. S'ils divergent, un type serait
    accepté par la route et jeté en silence par le service — une demande perdue sans erreur."""
    from typing import get_args

    assert set(get_args(ContentKind)) == set(service.CONTENT_KINDS)


def test_une_notion_invisible_rend_404_et_ne_cree_aucune_ligne(client_db) -> None:
    """LE garde-fou de sécurité. Sans lui, un `skill_id` au hasard répondrait « créé » ou
    « pas créé » — la route dirait à qui la sonde ce qui existe dans les brouillons de Papa."""
    client, Session = client_db
    _seed_svt(Session)
    invisible = _skill_id(Session)  # « Nombres relatifs » : aucune leçon validée ne la porte

    resp = client.post(_ROUTE, json={"skill_id": invisible, "content_kinds": ["fiche"]})
    assert resp.status_code == 404
    assert _rows(Session) == [], "aucune ligne ne doit être créée avant le contrôle"


def test_un_skill_id_inexistant_rend_404(client_db) -> None:
    client, Session = client_db
    _seed_svt(Session)
    assert client.post(_ROUTE, json={"skill_id": 999_999, "content_kinds": ["cours"]}).status_code == 404
    assert _rows(Session) == []


def test_un_type_de_contenu_hors_vocabulaire_rend_422(client_db) -> None:
    client, Session = client_db
    ids = _seed_svt(Session)
    resp = client.post(_ROUTE, json={"skill_id": ids["mitose_id"], "content_kinds": ["poster"]})
    assert resp.status_code == 422
    assert _rows(Session) == []


def test_au_dela_du_plafond_la_demande_est_refusee(client_db) -> None:
    """`CONTENT_REQUEST_MAX_KINDS` borne la TAILLE de la charge utile (v1 = 7).

    ⚠️ Le vocabulaire ne compte que six types demandables : le plafond ne peut donc être franchi
    qu'avec des répétitions. C'est bien ce qu'il protège — pas le contenu (rôle du vocabulaire),
    mais l'ampleur d'un appel."""
    client, Session = client_db
    ids = _seed_svt(Session)
    trop = ["cours", "fiche", "mindmap", "quiz", "capsule", "card", "cours", "fiche"]
    assert len(trop) > 7
    resp = client.post(_ROUTE, json={"skill_id": ids["mitose_id"], "content_kinds": trop})
    assert resp.status_code == 422
    assert _rows(Session) == []


def test_tout_ce_qui_manque_tient_en_un_seul_appel(client_db) -> None:
    """Le geste « demander à Papa tout ce qui manque » est UN geste : il ne doit pas se
    fragmenter en six lignes émises séparément."""
    client, Session = client_db
    ids = _seed_svt(Session)
    tout = list(service.CONTENT_KINDS)

    body = client.post(_ROUTE, json={"skill_id": ids["mitose_id"], "content_kinds": tout}).json()

    assert body["requested"] == tout
    rows = _rows(Session)
    assert len(rows) == len(tout)
    assert all(r.status == "pending" for r in rows)


def test_la_demande_porte_la_source_de_la_page_matiere(client_db) -> None:
    """`subject_page` ≠ `chat_orchestrator` : le CHOISI ne se confond pas avec le SUBI, et Papa
    lit la différence dans sa file."""
    client, Session = client_db
    ids = _seed_svt(Session)
    client.post(_ROUTE, json={"skill_id": ids["mitose_id"], "content_kinds": ["fiche"]})
    assert _rows(Session)[0].source == "subject_page"


def test_deux_demandes_identiques_ne_font_qu_une_ligne(client_db) -> None:
    """La dédup de `create_request` (non modifié) borne structurellement la répétition : taper
    dix fois sur « demander » ne noie pas la file de Papa."""
    client, Session = client_db
    ids = _seed_svt(Session)
    payload = {"skill_id": ids["mitose_id"], "content_kinds": ["fiche"]}
    client.post(_ROUTE, json=payload)
    client.post(_ROUTE, json=payload)
    assert len(_rows(Session)) == 1


def test_une_demande_triee_est_reactivee_quand_massimo_redemande(client_db) -> None:
    """Papa avait écarté la demande, le besoin revient → la ligne repasse `pending`, sans doublon."""
    client, Session = client_db
    ids = _seed_svt(Session)
    client.post(_ROUTE, json={"skill_id": ids["mitose_id"], "content_kinds": ["card"]})

    db = Session()
    service.set_status(db, _rows(Session)[0].id, "dismissed")
    db.close()

    client.post(_ROUTE, json={"skill_id": ids["mitose_id"], "content_kinds": ["card"]})
    rows = _rows(Session)
    assert len(rows) == 1 and rows[0].status == "pending"


def test_aucune_route_de_lecture_ni_de_triage_cote_eleve(client_db) -> None:
    """Écriture SEULE. Un `GET` exposerait `dismissed` à l'enfant et ferait d'une file de travail
    parent un écran d'attente ; un `PATCH` lui donnerait la main sur le travail de Papa.

    Vérifié sur le CONTRAT DÉCLARÉ (OpenAPI), pas sur des codes HTTP : une 405 pourrait masquer
    une route montée plus tard sous un autre verbe, et une 403 masquerait une route bien réelle."""
    client, _ = client_db
    declare = {
        (chemin, verbe.upper())
        for chemin, operations in app.openapi()["paths"].items()
        if chemin.startswith("/api/student/content-requests")
        for verbe in operations
    }
    assert declare == {("/api/student/content-requests", "POST")}


def test_papa_ne_peut_pas_ecrire_sur_la_surface_de_l_enfant(client_db) -> None:
    """Symétrique de la garde `require_parent` : la file ne se remplit pas depuis l'espace Papa,
    sinon `source` ne voudrait plus rien dire."""
    client, Session = client_db
    ids = _seed_svt(Session)
    _as_papa()
    try:
        resp = client.post(_ROUTE, json={"skill_id": ids["mitose_id"], "content_kinds": ["fiche"]})
    finally:
        app.dependency_overrides[get_current_user] = lambda: {
            "username": "massimo",
            "role": "child",
        }
    assert resp.status_code == 403
    assert _rows(Session) == []


# --- L'auto-fermeture sur DISPONIBILITÉ (ADR-0036 §4) -----------------------------------------


def _pending(db, *, student_id: int, skill_id: int, kind: str) -> m.ContentRequest:
    req = m.ContentRequest(
        student_id=student_id, skill_id=skill_id, content_kind=kind, status="pending"
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def test_une_demande_se_ferme_quand_le_contenu_est_servable(client_db) -> None:
    """Le cours de la notion EXISTE et est servable → la demande n'a plus lieu d'attendre.

    C'est le geste que Papa faisait à la main : produire, puis revenir cliquer « Fait ».
    """
    _, Session = client_db
    ids = _seed_svt(Session)
    with Session() as db:
        req = _pending(db, student_id=ids["student_id"], skill_id=ids["mitose_id"], kind="cours")

        assert service.close_available_requests(db) == [req.id]
        db.refresh(req)
        assert req.status == "done"


def test_ouvrir_la_file_referme_ce_qui_a_ete_produit_HORS_lot(client_db) -> None:
    """🔒 Le cas que l'ADR-0036 §4 promettait et que le code ne tenait pas.

    La fermeture n'était câblée qu'au **chemin de succès d'un lot**. Or Papa produit aussi à la
    main — un cours écrit depuis Programme, une fiche générée depuis sa page de pilotage, le
    Conseil de classe qui équipe hors lot. Le contenu existait, la demande restait ouverte **pour
    toujours**, alors que la page promet qu'elle « se refermera d'elle-même ».

    ⚠️ Ici, **aucun lot n'est joué** : c'est tout l'objet du test. La leçon naît sans cours, le
    cours est écrit après coup, et c'est la simple OUVERTURE de la file qui doit refermer.
    """
    client, Session = client_db
    ids = _seed_svt(Session, lesson_content=None)
    with Session() as db:
        req_id = _pending(
            db, student_id=ids["student_id"], skill_id=ids["mitose_id"], kind="cours"
        ).id

    _as_papa()
    assert [r["id"] for r in client.get("/api/content-requests").json()] == [req_id]

    # Papa écrit le cours à la main — exactement ce que le lien « Écrire le cours → » lui demande.
    with Session() as db:
        lecon = db.get(m.Lesson, ids["lesson_id"])
        lecon.content_markdown = "# Mitose\n\nLa cellule se divise…"
        db.commit()

    assert client.get("/api/content-requests").json() == []
    assert client.get("/api/content-requests/count").json() == {"pending": 0}
    with Session() as db:
        assert db.get(m.ContentRequest, req_id).status == "done"


def test_ouvrir_la_file_ne_ferme_RIEN_qui_ne_soit_servable(client_db) -> None:
    """La contre-épreuve : un ménage qui fermerait tout serait vert au test précédent.

    Le cours n'est pas écrit — la demande doit rester, ouverture de file ou pas. Sans cette
    seconde moitié, « la file se vide toute seule » ne se distingue pas de « la file se vide ».
    """
    client, Session = client_db
    ids = _seed_svt(Session, lesson_content=None)
    with Session() as db:
        req_id = _pending(
            db, student_id=ids["student_id"], skill_id=ids["mitose_id"], kind="cours"
        ).id

    _as_papa()
    client.get("/api/content-requests")

    with Session() as db:
        assert db.get(m.ContentRequest, req_id).status == "pending"


def test_lire_l_HISTORIQUE_ne_referme_rien(client_db) -> None:
    """Une lecture d'archive n'est pas un moment de ménage — le filtre `status` le dit.

    Sans cette borne, n'importe quelle consultation deviendrait une écriture.
    """
    client, Session = client_db
    ids = _seed_svt(Session)  # le cours EXISTE : la demande serait fermable
    with Session() as db:
        req_id = _pending(
            db, student_id=ids["student_id"], skill_id=ids["mitose_id"], kind="cours"
        ).id

    _as_papa()
    client.get("/api/content-requests?status=done")

    with Session() as db:
        assert db.get(m.ContentRequest, req_id).status == "pending"


def test_une_demande_ne_se_ferme_pas_sur_un_contenu_NON_servable(client_db) -> None:
    """⚠️ LE test du §4 : le gate est la DISPONIBILITÉ, jamais l'EXISTENCE.

    Une fiche en attente de relecture **existe en base** et n'est **pas servable**. Fermer la
    demande à ce moment-là annoncerait « c'est prêt » sur une porte que Massimo trouverait close —
    exactement le mensonge que le correctif du 2026-07-30 a tué, reconstruit du côté écriture.

    Les trois états sont vérifiés dans l'ordre où ils surviennent : rien → brouillon → validé.
    """
    _, Session = client_db
    ids = _seed_svt(Session)
    with Session() as db:
        req = _pending(db, student_id=ids["student_id"], skill_id=ids["mitose_id"], kind="fiche")

        # 1. Aucune fiche.
        assert service.close_available_requests(db) == []

        # 2. Une fiche existe, mais elle attend la relecture de Papa.
        fiche = m.Fiche(
            lesson_id=ids["lesson_id"], spec_json=_FICHE_SPEC, validation_status="pending"
        )
        db.add(fiche)
        db.commit()
        assert service.close_available_requests(db) == [], "fermée sur un contenu non servable"
        db.refresh(req)
        assert req.status == "pending"

        # 3. Papa (ou le palier) la valide → elle devient servable, la demande se referme.
        fiche.validation_status = "validated"
        db.commit()
        assert service.close_available_requests(db) == [req.id]
        db.refresh(req)
        assert req.status == "done"


def test_une_demande_de_capsule_ne_se_ferme_pas_sur_une_fiche(client_db) -> None:
    """Chaque demande a son propre outil : produire une fiche ne répond pas à une demande de carte.

    Sans la table `CONTENT_KIND_TO_PANOPLY`, un `content_kind` inconnu du prédicat rendrait
    `available` sur n'importe quoi — ou sur rien, en silence.
    """
    _, Session = client_db
    ids = _seed_svt(Session)
    with Session() as db:
        req = _pending(db, student_id=ids["student_id"], skill_id=ids["mitose_id"], kind="mindmap")
        db.add(
            m.Fiche(
                lesson_id=ids["lesson_id"], spec_json=_FICHE_SPEC, validation_status="validated"
            )
        )
        db.commit()

        assert service.close_available_requests(db) == []
        db.refresh(req)
        assert req.status == "pending"


# --- Le bouton « Produire » (ADR-0036 §3 et §6) ------------------------------------------------


def test_produire_cree_un_lot_piece_manuel(client_db) -> None:
    """⚠️ `trigger='manual'`, pas `'request'` : c'est Papa qui clique.

    Conséquence assumée : le lot ne porte **aucun** `content_request_id` — la contrainte l'interdit
    pour `manual`, à juste titre. La demande n'est pas perdue de vue : c'est la DISPONIBILITÉ qui
    la referme (§4), pas un lien vers le lot.
    """
    client, Session = client_db
    ids = _seed_svt(Session)
    with Session() as db:
        req = _pending(db, student_id=ids["student_id"], skill_id=ids["mitose_id"], kind="fiche")
        req_id = req.id

    _as_papa()
    resp = client.post(f"/api/production/runs/from-request?request_id={req_id}")
    assert resp.status_code == 202, resp.text

    with Session() as db:
        run = db.get(m.ProductionRun, resp.json()["id"])
        assert (run.trigger, run.authorized_by) == ("manual", "parent_direct")
        assert (run.scope_skill_id, run.scope_kind) == (ids["mitose_id"], "fiche")
        assert run.chapter_id is None
        assert run.content_request_id is None


def test_produire_traduit_le_vocabulaire_de_la_demande(client_db) -> None:
    """`card` (langue de Massimo) → `srs` (langue des tables). La traduction est SERVEUR."""
    client, Session = client_db
    ids = _seed_svt(Session)
    with Session() as db:
        req_id = _pending(
            db, student_id=ids["student_id"], skill_id=ids["mitose_id"], kind="card"
        ).id

    _as_papa()
    resp = client.post(f"/api/production/runs/from-request?request_id={req_id}")
    assert resp.status_code == 202
    assert resp.json()["scope_kind"] == "srs"


def test_produire_refuse_une_capsule_et_le_dit(client_db) -> None:
    """⚠️ Constat de code (ADR-0036 §3) : `create_capsule` exige une INSTRUCTION en texte libre.

    L'écran n'offre pas ce bouton — mais une route qui compte sur son client pour se protéger
    n'est pas protégée. Et surtout : **aucun lot n'est créé**, sinon il échouerait en boucle.
    """
    client, Session = client_db
    ids = _seed_svt(Session)
    with Session() as db:
        req_id = _pending(
            db, student_id=ids["student_id"], skill_id=ids["mitose_id"], kind="capsule"
        ).id

    _as_papa()
    resp = client.post(f"/api/production/runs/from-request?request_id={req_id}")
    assert resp.status_code == 422
    assert "capsule" in resp.json()["detail"]

    with Session() as db:
        assert db.query(m.ProductionRun).all() == []


def test_la_demande_dit_elle_meme_si_elle_est_productible(client_db) -> None:
    """Le front ne détient AUCUNE liste de types productibles — patron des paliers d'autonomie.

    La dupliquer en TypeScript la ferait diverger au premier générateur ajouté, et l'écran
    offrirait un bouton qui échoue.
    """
    _, Session = client_db
    ids = _seed_svt(Session)
    with Session() as db:
        _pending(db, student_id=ids["student_id"], skill_id=ids["mitose_id"], kind="fiche")
        _pending(db, student_id=ids["student_id"], skill_id=ids["mitose_id"], kind="capsule")
        par_type = {r["content_kind"]: r["producible"] for r in service.list_requests(db)}

    assert par_type == {"fiche": True, "capsule": False}
