"""Liste d'attente de contenus réclamés par l'enfant (addendum ADR-0027).

Couvre : dédup forte `(student, skill, kind)` = une ligne, `create` idempotent qui RÉ-ACTIVE une
ligne triée, `content_kind` invalide ignoré (best-effort), liste enrichie (skill_name) + triage
Papa, garde parent (403 child) ; ÉMISSION depuis le chat sur les deux déclencheurs (type manquant ;
notion résolue mais vide → cours) et caractère NON bloquant de l'émission.
"""

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.chat import actions
from app.modules.content_requests import service
from app.tests.fakes import FakeLLMProvider
from app.modules.ai import get_provider


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
    """Déclencheur (a) : Massimo demande une fiche absente → 1 demande `fiche` en attente."""
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
    assert len(rows) == 1
    assert rows[0].content_kind == "fiche" and rows[0].skill_id == skill_id
    assert rows[0].status == "pending"
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
    ELI5 inventerait → on ne l'offre PAS. ZETIS est honnête (« je le note pour Papa ») et enregistre
    une demande de `cours`. Aucune action (rien de validé à ouvrir)."""
    client, Session = client_db
    skill_id = _skill_id(Session)
    monkeypatch.setattr(
        actions,
        "notion_panel",
        lambda db, sid: _panel(
            skill_id, [{"kind": "eli5", "available": True}, {"kind": "cours", "available": False}]
        ),
    )
    _use_chat_llm(_chat_intent({"kind": "none"}, "Chouette !"))
    sid = _open(client)
    resp = _say(client, sid, text=RESOLVING)
    body = resp.json()
    assert body["action"] is None  # rien de validé → pas d'ELI5 génératif offert
    assert "Papa" in body["reply"]  # honnêteté
    db = Session()
    rows = db.query(m.ContentRequest).all()
    assert len(rows) == 1 and rows[0].content_kind == "cours"
    db.close()


def test_chat_eli5_intent_on_cousless_notion_does_not_generate(client_db, monkeypatch) -> None:
    """Cas réel post-`chat_v2` + décision : le LLM propose `tool=eli5` sur une notion SANS cours.
    ELI5 inventerait → on refuse de router vers lui ; honnêteté + demande de `cours`. Aucune action."""
    client, Session = client_db
    skill_id = _skill_id(Session)
    monkeypatch.setattr(
        actions,
        "notion_panel",
        lambda db, sid: _panel(
            skill_id, [{"kind": "eli5", "available": True}, {"kind": "cours", "available": False}]
        ),
    )
    _use_chat_llm(_chat_intent({"kind": "open_notion", "tool": "eli5"}))
    sid = _open(client)
    body = _say(client, sid, text=RESOLVING).json()
    assert body["action"] is None and "Papa" in body["reply"]
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
