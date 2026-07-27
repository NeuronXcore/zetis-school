"""Tests HTTP fiches (ADR-0015) : verrou gate `validated`, garde Papa, deck matière.

Le service est appelé en direct pour fabriquer les données (générer une fiche passe par Papa) ;
les routes élève sont testées avec le client `child` de la fixture (rôle autorisé en lecture).
"""

from app.modules.fiches import service
from app.prompts import fiche
from app.tests.fakes import FakeEmbeddingProvider, FakeLLMProvider
from app.tests.test_fiche_service import _seed_validated_lesson


def _make_pending_fiche(db) -> int:
    lesson = _seed_validated_lesson(db)
    row = service.generate_fiche(
        db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson.id
    )
    return row.id


def test_papa_routes_forbidden_for_child(client_db) -> None:
    client, _ = client_db  # la fixture authentifie un rôle "child"
    assert client.post("/api/fiches/generate", json={"lesson_id": 1}).status_code == 403
    assert client.get("/api/fiches/1").status_code == 403
    # Corps VALIDE pour isoler la garde (403) d'une éventuelle 422 de validation.
    assert client.put("/api/fiches/1", json={"spec": fiche.FEW_SHOTS[0]}).status_code == 403
    assert client.post("/api/fiches/1/regenerate").status_code == 403
    assert client.post("/api/fiches/1/validate").status_code == 403
    assert client.delete("/api/fiches/1").status_code == 403


def test_validated_gate_deck_and_detail(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        fiche_id = _make_pending_fiche(db)  # statut pending

    # Pending : absente du deck + 404 en détail (aucune fuite de brouillon).
    r = client.get("/api/student/subjects/mathematiques/fiches")
    assert r.status_code == 200
    assert r.json() == []
    assert client.get(f"/api/student/fiches/{fiche_id}").status_code == 404
    assert client.post(f"/api/student/fiches/{fiche_id}/seen").status_code == 404

    # Validation Papa (service direct).
    with Session() as db:
        service.validate_fiche(db, fiche_id)

    # Validée : apparaît dans le deck + détail 200.
    deck = client.get("/api/student/subjects/mathematiques/fiches").json()
    assert [f["id"] for f in deck] == [fiche_id]
    assert deck[0]["subject_slug"] == "mathematiques"
    assert deck[0]["seen"] is False
    detail = client.get(f"/api/student/fiches/{fiche_id}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["validation_status"] == "validated"
    assert body["spec"]["essentiel"]

    # Marquage « vu » (idempotent) → le deck le reflète.
    assert client.post(f"/api/student/fiches/{fiche_id}/seen").status_code == 204
    assert client.post(f"/api/student/fiches/{fiche_id}/seen").status_code == 204
    deck2 = client.get("/api/student/subjects/mathematiques/fiches").json()
    assert deck2[0]["seen"] is True


def test_deck_unknown_subject_returns_404(client_db) -> None:
    client, _ = client_db
    assert client.get("/api/student/subjects/inconnue/fiches").status_code == 404


def test_fiches_summary_counts_and_new(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        fiche_id = _make_pending_fiche(db)  # pending → ne compte pas encore

    # Matière présente (année active) mais fiche pending → compteur 0.
    subj = {s["slug"]: s for s in client.get("/api/student/fiches/summary").json()["subjects"]}
    assert "mathematiques" in subj
    assert subj["mathematiques"]["fiche_count"] == 0

    with Session() as db:
        service.validate_fiche(db, fiche_id)

    # Validée + jamais ouverte → compteur 1, « Nouveau » 1.
    subj = {s["slug"]: s for s in client.get("/api/student/fiches/summary").json()["subjects"]}
    assert subj["mathematiques"]["fiche_count"] == 1
    assert subj["mathematiques"]["new_count"] == 1

    # Après ouverture (seen) → « Nouveau » retombe à 0, compteur inchangé.
    assert client.post(f"/api/student/fiches/{fiche_id}/seen").status_code == 204
    subj = {s["slug"]: s for s in client.get("/api/student/fiches/summary").json()["subjects"]}
    assert subj["mathematiques"]["fiche_count"] == 1
    assert subj["mathematiques"]["new_count"] == 0
