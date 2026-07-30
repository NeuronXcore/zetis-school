"""Notions demandées par l'enfant (ELI5 hors-programme → « Dis à Papa »).

Couvre : création enfant, dédup idempotente (casse/espaces), texte vide = 400,
liste + triage Papa, garde parent (403 pour le rôle child).
"""

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user


def _as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def test_child_creates_request(client_db) -> None:
    client, Session = client_db
    resp = client.post("/api/ai/eli5/request-notion", json={"text": "Théorème de Pythagore"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["text"] == "Théorème de Pythagore"
    assert body["status"] == "pending"
    db = Session()
    try:
        assert db.query(m.NotionRequest).count() == 1
    finally:
        db.close()


def test_child_request_dedup(client_db) -> None:
    client, Session = client_db
    client.post("/api/ai/eli5/request-notion", json={"text": "Pythagore"})
    client.post("/api/ai/eli5/request-notion", json={"text": "  pythagore  "})  # même notion
    db = Session()
    try:
        assert db.query(m.NotionRequest).count() == 1  # dédup casse + espaces
    finally:
        db.close()


def test_child_request_empty_is_400(client_db) -> None:
    client, _ = client_db
    assert client.post("/api/ai/eli5/request-notion", json={"text": "   "}).status_code == 400


def test_papa_lists_and_triages(client_db) -> None:
    client, _ = client_db
    created = client.post("/api/ai/eli5/request-notion", json={"text": "Pythagore"}).json()

    _as_papa()
    listed = client.get("/api/notion-requests").json()
    assert len(listed) == 1
    assert listed[0]["text"] == "Pythagore"

    patched = client.patch(f"/api/notion-requests/{created['id']}", json={"status": "added"})
    assert patched.status_code == 200
    assert patched.json()["status"] == "added"

    # La liste « pending » (défaut) est désormais vide.
    assert client.get("/api/notion-requests").json() == []


def test_papa_route_requires_parent(client_db) -> None:
    """Le rôle child (conftest) est refusé sur la route Papa."""
    client, _ = client_db
    assert client.get("/api/notion-requests").status_code == 403


def test_pending_count_feeds_notification(client_db) -> None:
    """La pastille inbox somme les demandes de notions en attente (route `/count`)."""
    client, _ = client_db
    client.post("/api/ai/eli5/request-notion", json={"text": "Pythagore"})
    _as_papa()
    assert client.get("/api/notion-requests/count").json() == {"pending": 1}
