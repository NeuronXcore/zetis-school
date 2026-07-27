"""Tests du classement des capsules par chapitre (matière → chapitre).

Couvre : rattachement à la génération, validation d'un chapitre inexistant (404), reclassement
via `set_chapter`, et l'enrichissement des payloads (`subject_slug`, `chapter`, `chapter_id`)."""

import pytest
from fastapi import HTTPException

from app.db.models import Chapter, Theme
from app.modules.capsules import service
from app.tests.fakes import FakeLLMProvider


def _make_chapter(db, name="Les fractions") -> Chapter:
    theme = Theme(subject_id=1, name="Nombres", sort_order=0)
    db.add(theme)
    db.flush()
    chapter = Chapter(theme_id=theme.id, name=name, sort_order=0, status="planned")
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return chapter


def test_create_capsule_with_chapter_sets_link_and_payload(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        ch = _make_chapter(db)
        cap = service.create_capsule(
            db, FakeLLMProvider(), subject_id=1, instruction="Explique.", chapter_id=ch.id
        )
        assert cap.chapter_id == ch.id
        out = service.capsule_out(db, cap)
        assert out["chapter_id"] == ch.id
        assert out["chapter"] == "Les fractions"
        assert out["subject_slug"] == "mathematiques"


def test_create_capsule_with_unknown_chapter_raises_404(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        with pytest.raises(HTTPException) as exc:
            service.create_capsule(
                db, FakeLLMProvider(), subject_id=1, instruction="Explique.", chapter_id=9999
            )
        assert exc.value.status_code == 404


def test_set_chapter_reclassifies_and_clears(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        ch = _make_chapter(db)
        cap = service.create_capsule(db, FakeLLMProvider(), subject_id=1, instruction="Explique.")
        assert cap.chapter_id is None  # non classée à la création

        service.set_chapter(db, cap.id, ch.id)
        assert service.get_capsule(db, cap.id).chapter_id == ch.id

        service.set_chapter(db, cap.id, None)  # déclassement
        assert service.get_capsule(db, cap.id).chapter_id is None


def test_set_chapter_unknown_raises_404(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        cap = service.create_capsule(db, FakeLLMProvider(), subject_id=1, instruction="Explique.")
        with pytest.raises(HTTPException) as exc:
            service.set_chapter(db, cap.id, 4242)
        assert exc.value.status_code == 404


def test_list_and_public_items_expose_slug_and_chapter(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        ch = _make_chapter(db, name="Pourcentages")
        cap = service.create_capsule(
            db, FakeLLMProvider(), subject_id=1, instruction="Explique.", chapter_id=ch.id
        )
        li = service.capsule_list_item(db, cap)
        assert li["subject_slug"] == "mathematiques"
        assert li["chapter"] == "Pourcentages" and li["chapter_id"] == ch.id

        service.set_validation(db, cap.id, "validated")
        service.set_render_status(db, cap.id, render_status="published", video_url="/api/capsules/x/video")
        pub = service.capsule_public_item(db, service.get_capsule(db, cap.id))
        assert pub["subject_slug"] == "mathematiques"
        assert pub["chapter"] == "Pourcentages" and pub["chapter_id"] == ch.id
