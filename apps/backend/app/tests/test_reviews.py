"""Tests offline de la révision espacée (slice backend `spaced_memory`).

Fixtures uniquement : cette slice ne génère pas de cartes (chantier dérivé du cours
canonique, ADR-0011). Le conftest authentifie en rôle `child` et seede l'élève par
défaut + la matière « mathematiques » ; on ajoute matières et cartes à la demande.

Points vérifiés (prompt §3) : intervalles, test-verrou du payload (aucune donnée de
planification), plafonds + tri due_at, entrelacement (helper pur), consolidation
serveur, XP plein même pour `again`, et les gardes (404 / 4xx / 400).
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

import app.db.models as m
import app.modules.memory.service as srv
from app.modules.memory.service import interleave


# --- helpers de seed ---------------------------------------------------------------


def _naive(dt):
    """SQLite (tests) perd la tzinfo au round-trip ; on compare donc en naïf.
    En prod (Postgres `timestamptz`) la valeur reste tz-aware."""
    return dt.replace(tzinfo=None)


def _student(db):
    return db.scalar(select(m.StudentProfile).order_by(m.StudentProfile.id))


def _subject(db, slug, name=None, sort_order=0):
    subj = db.scalar(select(m.Subject).where(m.Subject.slug == slug))
    if subj is None:
        subj = m.Subject(name=name or slug, slug=slug, sort_order=sort_order)
        db.add(subj)
        db.flush()
    return subj


def _card(db, student, subject, *, due_at, front="Question ?", back="Réponse.", status="scheduled"):
    """Crée une carte (avec son propre Skill dans la matière donnée) et la renvoie."""
    skill = m.Skill(subject_id=subject.id, name=f"notion-{subject.slug}-{due_at.isoformat()}", level="4e")
    db.add(skill)
    db.flush()
    card = m.SpacedReviewCard(
        student_id=student.id,
        skill_id=skill.id,
        front_markdown=front,
        back_markdown=back,
        interval_days=1,
        due_at=due_at,
        status=status,
    )
    db.add(card)
    db.flush()
    return card


# --- helper pur : interleave -------------------------------------------------------


def test_interleave_alternates_when_possible():
    # 2 matières à parts égales → alternance parfaite atteignable.
    cards = [("a", "maths"), ("b", "maths"), ("c", "fr"), ("d", "fr")]
    out = interleave(cards, key=lambda c: c[1])
    subs = [c[1] for c in out]
    assert len(out) == 4
    assert all(subs[i] != subs[i + 1] for i in range(len(subs) - 1))


def test_interleave_impossible_case_no_exception():
    # 5 cartes d'une matière + 1 d'une autre : alternance impossible, mais résultat
    # complet et sans exception.
    cards = [
        ("a", "maths"),
        ("b", "maths"),
        ("c", "maths"),
        ("d", "maths"),
        ("e", "maths"),
        ("f", "fr"),
    ]
    out = interleave(cards, key=lambda c: c[1])
    subs = [c[1] for c in out]
    assert len(out) == 6  # complet
    assert subs.count("maths") == 5 and subs.count("fr") == 1
    # la matière minoritaire est intercalée tôt (pas reléguée en fin).
    assert subs[1] == "fr"


def test_interleave_deterministic():
    cards = [("a", "maths"), ("b", "fr"), ("c", "maths"), ("d", "fr")]
    assert interleave(cards, key=lambda c: c[1]) == interleave(cards, key=lambda c: c[1])


# --- intervalles -------------------------------------------------------------------


def test_intervals_map_each_rating_to_due_at(client_db, monkeypatch):
    _, Session = client_db
    fixed = datetime(2026, 7, 4, 12, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(srv, "_now", lambda: fixed)
    with Session() as db:
        student = _student(db)
        subj = _subject(db, "mathematiques")
        for rating, days in {"again": 1, "hard": 3, "good": 7, "easy": 14}.items():
            card = _card(db, student, subj, due_at=fixed - timedelta(days=1))
            db.commit()
            res = srv.record_attempt(db, student, card.id, rating)
            assert res["next_due_at"] == fixed + timedelta(days=days)
            db.refresh(card)
            assert card.due_at == _naive(fixed + timedelta(days=days))
            assert card.interval_days == days
            assert card.last_reviewed_at == _naive(fixed)
            assert card.ease_factor == 2.5  # PAS de SM-2 : intact


# --- test-verrou : le payload élève ne fuite aucune planification ------------------


def test_session_payload_hides_scheduling_fields(client_db):
    client, Session = client_db
    with Session() as db:
        student = _student(db)
        subj = _subject(db, "mathematiques")
        _card(db, student, subj, due_at=datetime.now(timezone.utc) - timedelta(days=2))
        db.commit()

    res = client.post("/api/student/reviews/session", json={"deck": "mix_day"})
    assert res.status_code == 200
    cards = res.json()
    assert len(cards) == 1
    assert set(cards[0]) == {"card_id", "subject_slug", "front_markdown", "back_markdown"}
    for forbidden in ("due_at", "interval_days", "ease_factor", "last_reviewed_at", "status"):
        assert forbidden not in cards[0]


# --- plafonds + tri due_at + entrelacement de bout en bout -------------------------


def test_caps_serve_oldest_and_interleave(client_db):
    client, Session = client_db
    now = datetime.now(timezone.utc)
    with Session() as db:
        student = _student(db)
        maths = _subject(db, "mathematiques", "Maths", sort_order=0)
        fr = _subject(db, "francais", "Français", sort_order=1)
        by_age = []  # (due_at, card_id) ; plus petit due_at = plus ancien = prioritaire
        for i in range(20):
            subject = maths if i % 2 == 0 else fr
            due = now - timedelta(days=40 - i)
            card = _card(db, student, subject, due_at=due)
            by_age.append((due, card.id))
        db.commit()
        oldest_12 = {cid for _, cid in sorted(by_age)[:12]}

    # mix_day → 12, exactement les 12 plus anciennes.
    served = client.post("/api/student/reviews/session", json={"deck": "mix_day"}).json()
    assert len(served) == 12
    assert {c["card_id"] for c in served} == oldest_12
    # entrelacement serveur : 6 maths + 6 fr parmi les 12 → alternance parfaite.
    subs = [c["subject_slug"] for c in served]
    assert all(subs[k] != subs[k + 1] for k in range(len(subs) - 1))

    # deck matière → 8 (toutes maths).
    subj_session = client.post(
        "/api/student/reviews/session", json={"deck": {"subject": "mathematiques"}}
    ).json()
    assert len(subj_session) == 8
    assert all(c["subject_slug"] == "mathematiques" for c in subj_session)

    # éclair → 5.
    flash = client.post("/api/student/reviews/session", json={"deck": "mix_flash"}).json()
    assert len(flash) == 5


# --- consolidation détectée côté serveur -------------------------------------------


def test_consolidation_same_day_keeps_schedule(client_db, monkeypatch):
    _, Session = client_db
    day1 = datetime(2026, 7, 4, 9, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(srv, "_now", lambda: day1)
    with Session() as db:
        student = _student(db)
        subj = _subject(db, "mathematiques")
        card = _card(db, student, subj, due_at=day1 - timedelta(days=1))
        db.commit()
        cid = card.id

        first = srv.record_attempt(db, student, cid, "good")
        assert first["is_consolidation"] is False
        assert first["xp_awarded"] == 5
        db.refresh(card)
        due_after_first = card.due_at
        assert due_after_first == _naive(day1 + timedelta(days=7))

        # 2e passage le même jour (2 h plus tard) → consolidation.
        monkeypatch.setattr(srv, "_now", lambda: day1 + timedelta(hours=2))
        second = srv.record_attempt(db, student, cid, "easy")
        assert second["is_consolidation"] is True
        assert second["xp_awarded"] == 2
        db.refresh(card)
        assert card.due_at == due_after_first  # planification STRICTEMENT inchangée
        assert card.interval_days == 7

        # le lendemain → replanification normale.
        day2 = day1 + timedelta(days=1)
        monkeypatch.setattr(srv, "_now", lambda: day2)
        third = srv.record_attempt(db, student, cid, "again")
        assert third["is_consolidation"] is False
        db.refresh(card)
        assert card.due_at == _naive(day2 + timedelta(days=1))

        attempts = db.scalars(
            select(m.SpacedReviewAttempt)
            .where(m.SpacedReviewAttempt.card_id == cid)
            .order_by(m.SpacedReviewAttempt.id)
        ).all()
        assert [a.is_consolidation for a in attempts] == [False, True, False]


# --- XP : effort récompensé, y compris pour `again` --------------------------------


def test_again_credits_full_xp(client_db):
    _, Session = client_db
    with Session() as db:
        student = _student(db)
        subj = _subject(db, "mathematiques")
        card = _card(db, student, subj, due_at=datetime.now(timezone.utc) - timedelta(days=1))
        db.commit()

        res = srv.record_attempt(db, student, card.id, "again")
        assert res["xp_awarded"] == 5
        total = db.scalar(
            select(func.sum(m.XPEvent.amount)).where(m.XPEvent.student_id == student.id)
        )
        assert total == 5
        evt = db.scalar(select(m.XPEvent).where(m.XPEvent.student_id == student.id))
        assert evt.reason == "review"


# --- gardes ------------------------------------------------------------------------


def test_attempt_on_other_students_card_404(client_db):
    client, Session = client_db
    with Session() as db:
        other_user = m.User(email="autre@test.local", name="Autre", role="child")
        db.add(other_user)
        db.flush()
        other = m.StudentProfile(user_id=other_user.id, first_name="Autre", school_level_current="4e")
        db.add(other)
        db.flush()
        subj = _subject(db, "mathematiques")
        card = _card(db, other, subj, due_at=datetime.now(timezone.utc))
        db.commit()
        cid = card.id

    res = client.post(f"/api/student/reviews/cards/{cid}/attempt", json={"rating": "good"})
    assert res.status_code == 404
    # carte inexistante → même 404 (indiscernable).
    assert client.post(
        "/api/student/reviews/cards/999999/attempt", json={"rating": "good"}
    ).status_code == 404


def test_invalid_rating_rejected(client_db):
    client, Session = client_db
    with Session() as db:
        student = _student(db)
        subj = _subject(db, "mathematiques")
        card = _card(db, student, subj, due_at=datetime.now(timezone.utc))
        db.commit()
        cid = card.id
    res = client.post(f"/api/student/reviews/cards/{cid}/attempt", json={"rating": "genial"})
    assert res.status_code == 422


def test_subject_deck_without_due_cards_400(client_db):
    client, Session = client_db
    with Session() as db:
        _subject(db, "mathematiques")  # existe, mais aucune carte due
        db.commit()
    assert client.post(
        "/api/student/reviews/session", json={"deck": {"subject": "mathematiques"}}
    ).status_code == 400
    # matière inconnue → même 400.
    assert client.post(
        "/api/student/reviews/session", json={"deck": {"subject": "inconnue"}}
    ).status_code == 400


# --- summary -----------------------------------------------------------------------


def test_summary_aggregates_due_by_subject(client_db):
    client, Session = client_db
    now = datetime.now(timezone.utc)
    with Session() as db:
        student = _student(db)
        maths = _subject(db, "mathematiques", "Maths", sort_order=0)
        fr = _subject(db, "francais", "Français", sort_order=1)
        for _ in range(3):
            _card(db, student, maths, due_at=now - timedelta(days=1))
        for _ in range(2):
            _card(db, student, fr, due_at=now - timedelta(days=1))
        _card(db, student, fr, due_at=now + timedelta(days=5))  # future → ne compte pas
        db.commit()

    body = client.get("/api/student/reviews/summary").json()
    assert body["total_due"] == 5
    assert body["flash_size"] == 5
    assert {s["slug"]: s["due_count"] for s in body["subjects"]} == {
        "mathematiques": 3,
        "francais": 2,
    }
    # ordre par sort_order de matière.
    assert [s["slug"] for s in body["subjects"]] == ["mathematiques", "francais"]
    # les deux ont des cartes actives → non grisées.
    assert all(s["has_cards"] for s in body["subjects"])


def test_summary_subject_with_cards_but_none_due_is_up_to_date(client_db):
    """Matière avec des cartes actives mais aucune due → présente, due=0, has_cards=True
    (état « à jour ✓ » côté Massimo, distinct du grisé « pas encore de cartes »)."""
    client, Session = client_db
    now = datetime.now(timezone.utc)
    with Session() as db:
        student = _student(db)
        svt = _subject(db, "svt", "SVT", sort_order=0)
        _card(db, student, svt, due_at=now + timedelta(days=3))  # active, pas due
        db.commit()

    subjects = {s["slug"]: s for s in client.get("/api/student/reviews/summary").json()["subjects"]}
    assert subjects["svt"]["due_count"] == 0
    assert subjects["svt"]["has_cards"] is True


def test_summary_lists_all_subjects_even_without_cards(client_db):
    """« Par défaut, je veux voir toutes les matières » : une matière sans aucune carte
    apparaît quand même (grisée, has_cards=False), aux côtés de celles qui ont des cartes.
    L'ordre suit `sort_order`."""
    client, Session = client_db
    now = datetime.now(timezone.utc)
    with Session() as db:
        student = _student(db)
        maths = _subject(db, "mathematiques", "Maths", sort_order=0)
        _subject(db, "histoire", "Histoire", sort_order=1)  # aucune carte → grisée
        _card(db, student, maths, due_at=now - timedelta(days=1))
        db.commit()

    subjects = {s["slug"]: s for s in client.get("/api/student/reviews/summary").json()["subjects"]}
    assert subjects["mathematiques"]["has_cards"] is True
    assert subjects["histoire"]["has_cards"] is False
    assert subjects["histoire"]["due_count"] == 0
