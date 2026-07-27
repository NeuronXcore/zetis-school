"""Tests du suivi des visionnages de capsules (Massimo) : idempotence, stats, flag `seen`."""

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.db.models import CapsuleView
from app.modules.capsules import service
from app.modules.eli5.service import get_default_student
from app.tests.fakes import FakeLLMProvider


def _published(db):
    cap = service.create_capsule(db, FakeLLMProvider(), subject_id=1, instruction="Explique.")
    service.set_validation(db, cap.id, "validated")
    service.set_render_status(
        db, cap.id, render_status="published", video_url=f"/api/capsules/{cap.id}/video"
    )
    return cap


def test_record_view_single_row_but_increments_count(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        cap = _published(db)
        sid = get_default_student(db).id
        service.record_view(db, sid, cap.id)
        service.record_view(db, sid, cap.id)  # revoir : même ligne, compteur +1
        rows = db.scalars(select(CapsuleView).where(CapsuleView.capsule_id == cap.id)).all()
        assert len(rows) == 1  # toujours une seule ligne par (élève, capsule)
        assert rows[0].count == 2  # deux visionnages
        assert service.capsule_stats(db, sid)["seen_count"] == 1  # 1 capsule distincte vue
        # view_count exposé dans les payloads Papa.
        assert service.capsule_out(db, cap)["view_count"] == 2
        assert service.capsule_list_item(db, cap)["view_count"] == 2


def test_stats_new_equals_total_minus_seen(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        a = _published(db)
        _published(db)
        sid = get_default_student(db).id
        st = service.capsule_stats(db, sid)
        assert (st["total"], st["seen_count"], st["new_count"]) == (2, 0, 2)
        service.record_view(db, sid, a.id)
        st = service.capsule_stats(db, sid)
        assert (st["total"], st["seen_count"], st["new_count"]) == (2, 1, 1)


def test_stats_view_count_sums_repeats(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        a = _published(db)
        b = _published(db)
        sid = get_default_student(db).id
        assert service.capsule_stats(db, sid)["view_count"] == 0
        service.record_view(db, sid, a.id)
        service.record_view(db, sid, a.id)  # revoir a → +1 sur son compteur
        service.record_view(db, sid, b.id)
        st = service.capsule_stats(db, sid)
        assert st["view_count"] == 3  # 2 (a) + 1 (b) : répétitions incluses
        assert st["seen_count"] == 2  # mais 2 capsules distinctes vues


def test_record_view_unpublished_raises_404(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        cap = service.create_capsule(db, FakeLLMProvider(), subject_id=1, instruction="x")
        with pytest.raises(HTTPException) as exc:
            service.record_view(db, get_default_student(db).id, cap.id)
        assert exc.value.status_code == 404


def test_library_seen_flag_and_view_endpoint(client_db) -> None:
    client, Session = client_db  # get_current_user est déjà mocké en rôle "child"
    with Session() as db:
        cap = _published(db)

    lib = client.get("/api/capsules/library").json()
    assert next(i for i in lib if i["id"] == cap.id)["seen"] is False

    assert client.post(f"/api/capsules/{cap.id}/view").status_code == 204

    lib2 = client.get("/api/capsules/library").json()
    assert next(i for i in lib2 if i["id"] == cap.id)["seen"] is True
    assert client.get("/api/capsules/stats").json()["seen_count"] == 1
