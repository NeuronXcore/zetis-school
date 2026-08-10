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
from app.modules.memory.service import (
    REVIEW_SESSION_MAX_CHAPTER,
    REVIEW_SESSION_MAX_SUBJECT,
    interleave,
)


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


# --- helpers du DECK CHAPITRE (ADR-0049) --------------------------------------------
#
# ⚠️ `_card` ci-dessus crée un `Skill` directement sous un `Subject` — **ni `Chapter`, ni
# `Lesson`, ni `LessonSkill`**. Aucune de ses cartes n'est donc résolvable par chapitre : la
# traversée est `Chapter → Lesson(validated) → LessonSkill → Skill`. D'où ces helpers, qui
# construisent la chaîne ENTIÈRE.


def _chapter(db, name="Chapitre"):
    """Un chapitre nu. `school_year_subject_id` et `theme_id` sont nullables — la traversée du
    deck ne les regarde pas (elle part de `Lesson.chapter_id`)."""
    chapter = m.Chapter(name=name, status="active", validation_status="validated")
    db.add(chapter)
    db.flush()
    return chapter


def _lesson(db, chapter, *, status="validated", sort_order=0, title="Leçon"):
    # `created_by` est NOT NULL (parent|ai|imported) — la traversée ne le regarde pas.
    lesson = m.Lesson(
        chapter_id=chapter.id,
        title=title,
        status=status,
        sort_order=sort_order,
        created_by="parent",
    )
    db.add(lesson)
    db.flush()
    return lesson


def _chapter_card(db, student, subject, lesson, *, due_at, status="scheduled", name=None):
    """Une carte RÉSOLVABLE par le chapitre de `lesson` : la chaîne complète est câblée."""
    skill = m.Skill(
        subject_id=subject.id,
        name=name or f"notion-{lesson.id}-{status}-{due_at.isoformat() if due_at else 'nodue'}",
        level="4e",
    )
    db.add(skill)
    db.flush()
    db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
    card = m.SpacedReviewCard(
        student_id=student.id,
        skill_id=skill.id,
        front_markdown="Question ?",
        back_markdown="Réponse.",
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


def test_session_size_est_le_plafond_de_la_matiere_jamais_l_arriere(client_db):
    """`session_size` est le nombre qu'une surface enfant affiche — ce que la session servira
    VRAIMENT — là où `due_count` est l'arriéré (la pression quotidienne interdite).

    Le calcul vit ici parce que `REVIEW_SESSION_MAX_SUBJECT` vit ici : recopié dans un front,
    il mentirait silencieusement le jour où le plafond bouge."""
    client, Session = client_db
    now = datetime.now(timezone.utc)
    with Session() as db:
        student = _student(db)
        maths = _subject(db, "mathematiques", "Maths", sort_order=0)
        fr = _subject(db, "francais", "Français", sort_order=1)
        for _ in range(REVIEW_SESSION_MAX_SUBJECT + 7):  # bien au-delà du plafond
            _card(db, student, maths, due_at=now - timedelta(days=1))
        for _ in range(2):  # en deçà : le plafond ne gonfle rien
            _card(db, student, fr, due_at=now - timedelta(days=1))
        db.commit()

    subjects = {s["slug"]: s for s in client.get("/api/student/reviews/summary").json()["subjects"]}
    assert subjects["mathematiques"]["session_size"] == REVIEW_SESSION_MAX_SUBJECT
    assert subjects["mathematiques"]["due_count"] == REVIEW_SESSION_MAX_SUBJECT + 7
    assert subjects["francais"]["session_size"] == 2

    for subject in subjects.values():
        assert subject["session_size"] <= REVIEW_SESSION_MAX_SUBJECT
        assert subject["session_size"] <= subject["due_count"]


def test_session_size_annonce_exactement_ce_que_la_session_sert(client_db):
    """Le contrat qui compte : le nombre annoncé et le nombre de cartes servies sont le MÊME.
    Deux calculs séparés dériveraient, et Massimo verrait une promesse non tenue."""
    client, Session = client_db
    now = datetime.now(timezone.utc)
    with Session() as db:
        student = _student(db)
        maths = _subject(db, "mathematiques", "Maths", sort_order=0)
        for _ in range(REVIEW_SESSION_MAX_SUBJECT + 4):
            _card(db, student, maths, due_at=now - timedelta(days=1))
        db.commit()

    summary = client.get("/api/student/reviews/summary").json()
    annonce = next(s for s in summary["subjects"] if s["slug"] == "mathematiques")["session_size"]
    servies = client.post(
        "/api/student/reviews/session", json={"deck": {"subject": "mathematiques"}}
    ).json()
    assert len(servies) == annonce


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


# ═══════════════════════════════════════════════════════════════════════════════════
# DECK CHAPITRE (ADR-0049) — la session supplémentaire qui n'écrit AUCUN état SRS
# ═══════════════════════════════════════════════════════════════════════════════════


def test_chapter_deck_serves_cards_that_are_NOT_due(client_db):
    """Le point du chantier : servir des cartes NON DUES. Aucun autre deck ne le fait.

    Réviser avant un contrôle, pas quand l'oubli le réclame — ADR-0025 §11 couplage 2.
    """
    client, Session = client_db
    now = datetime.now(timezone.utc)
    with Session() as db:
        student = _student(db)
        subj = _subject(db, "histoire", "Histoire")
        chapter = _chapter(db, "La Révolution française")
        lesson = _lesson(db, chapter)
        _chapter_card(db, student, subj, lesson, due_at=now + timedelta(days=30))  # loin d'être due
        _chapter_card(db, student, subj, lesson, due_at=now + timedelta(days=90))
        db.commit()
        cid = chapter.id

    # Le mélange du jour ne voit rien (aucune carte due) …
    assert client.post("/api/student/reviews/session", json={"deck": "mix_day"}).json() == []
    # … le deck chapitre sert les deux.
    served = client.post("/api/student/reviews/session", json={"deck": {"chapter": cid}}).json()
    assert len(served) == 2
    # Et le payload reste muet sur la planification, comme partout ailleurs.
    assert set(served[0]) == {"card_id", "subject_slug", "front_markdown", "back_markdown"}


def test_chapter_without_validated_lesson_resolves_nothing(client_db):
    """🔴 Le §Constat 1 du read-before-code : `Skill` n'a aucun `chapter_id`, la traversée passe
    par les leçons VALIDÉES. Un chapitre dont la leçon est en brouillon ne résout RIEN — et la
    servabilité renvoyée doit le dire, sinon la porte s'affiche sur du vide."""
    client, Session = client_db
    now = datetime.now(timezone.utc)
    with Session() as db:
        student = _student(db)
        subj = _subject(db, "svt", "SVT")
        chapter = _chapter(db, "Les séismes")
        brouillon = _lesson(db, chapter, status="draft")
        _chapter_card(db, student, subj, brouillon, due_at=now - timedelta(days=1))
        db.commit()
        cid, sid = chapter.id, student.id

    with Session() as db:
        assert srv.chapter_servable_count(db, sid, cid) == 0
    assert client.post(
        "/api/student/reviews/session", json={"deck": {"chapter": cid}}
    ).status_code == 400


def test_chapter_deck_never_serves_pending_cards(client_db):
    """🔴 LE verrou du chantier — `due_at IS NOT NULL` est CONSERVÉ.

    C'est la clause qu'on supprime par erreur en croyant supprimer l'échéance. Une carte
    `pending` est générée SANS cours validé (ADR-0013) : la servir à Massimo lui montrerait du
    contenu que personne n'a relu.

    🔴 **La carte `sans_echeance` est celle qui fait mordre le verrou, et elle a failli manquer.**
    Une carte `status="pending"` est exclue DEUX fois — par son statut *et* par son échéance nulle.
    Un test qui ne poserait que celle-là resterait **VERT** en retirant `due_at.is_not(None)` :
    c'est ce qui s'est produit à la première écriture de ce test, et c'est la 4ᵉ occurrence du
    motif dans ce dépôt. Il faut une carte au statut **ACTIF** et à l'échéance **NULLE** —
    l'anomalie de données que cette clause, et elle seule, arrête.

    ⚠️ SABOTAGE ATTENDU : retirer `due_at.is_not(None)` de `chapter_card_conditions` doit faire
    ROUGIR ce test. Vérifié.
    """
    client, Session = client_db
    now = datetime.now(timezone.utc)
    with Session() as db:
        student = _student(db)
        subj = _subject(db, "histoire", "Histoire")
        chapter = _chapter(db, "La Révolution")
        lesson = _lesson(db, chapter)
        _chapter_card(db, student, subj, lesson, due_at=None, status="pending", name="pending")
        _chapter_card(db, student, subj, lesson, due_at=now, status="suspended", name="suspendue")
        _chapter_card(db, student, subj, lesson, due_at=now, status="archived", name="archivee")
        # Statut ACTIF, échéance NULLE : seule `due_at IS NOT NULL` l'arrête.
        _chapter_card(
            db, student, subj, lesson, due_at=None, status="scheduled", name="sans_echeance"
        )
        ok = _chapter_card(db, student, subj, lesson, due_at=now + timedelta(days=10), name="ok")
        db.commit()
        cid, ok_id, sid = chapter.id, ok.id, student.id

    served = client.post("/api/student/reviews/session", json={"deck": {"chapter": cid}}).json()
    assert [c["card_id"] for c in served] == [ok_id], "seule la carte ACTIVE est servable"
    with Session() as db:
        assert srv.chapter_servable_count(db, sid, cid) == 1


def test_chapter_deck_caps_and_orders_by_due_at(client_db):
    """Plafond chapitre, et le tri `due_at` croissant qui garde son sens sans clause d'échéance :
    les plus en retard d'abord, puis les plus proches de l'être."""
    client, Session = client_db
    now = datetime.now(timezone.utc)
    with Session() as db:
        student = _student(db)
        subj = _subject(db, "histoire", "Histoire")
        chapter = _chapter(db, "La Révolution")
        lesson = _lesson(db, chapter)
        attendu = []
        for i in range(REVIEW_SESSION_MAX_CHAPTER + 5):
            card = _chapter_card(db, student, subj, lesson, due_at=now + timedelta(days=i))
            attendu.append(card.id)
        db.commit()
        cid, sid = chapter.id, student.id

    served = client.post("/api/student/reviews/session", json={"deck": {"chapter": cid}}).json()
    assert len(served) == REVIEW_SESSION_MAX_CHAPTER
    assert [c["card_id"] for c in served] == attendu[:REVIEW_SESSION_MAX_CHAPTER]
    with Session() as db:
        # La servabilité annonce le PLAFOND, pas l'arriéré — même règle que `session_size`.
        assert srv.chapter_servable_count(db, sid, cid) == REVIEW_SESSION_MAX_CHAPTER


def test_chapter_deck_400_is_indistinguishable(client_db):
    """Chapitre inexistant ET chapitre sans carte servable → LE MÊME 400. Un élève ne doit pas
    pouvoir sonder l'existence d'un chapitre."""
    client, Session = client_db
    with Session() as db:
        _subject(db, "histoire", "Histoire")
        vide = _chapter(db, "Chapitre sans rien")
        _lesson(db, vide)  # leçon validée, mais aucune notion
        db.commit()
        vide_id = vide.id

    a = client.post("/api/student/reviews/session", json={"deck": {"chapter": vide_id}})
    b = client.post("/api/student/reviews/session", json={"deck": {"chapter": 999999}})
    assert a.status_code == b.status_code == 400
    assert a.json() == b.json(), "les deux causes doivent être indiscernables"


def test_chapter_session_never_moves_the_schedule(client_db, monkeypatch):
    """🔴 L'INVARIANT de l'ADR-0025 §11 : ne jamais avancer les cartes SRS.

    Il ne se lit nulle part ailleurs — aucun autre test ne vérifie qu'un attempt LAISSE la carte
    en place tout en créditant l'XP plein.
    """
    _, Session = client_db
    fixed = datetime(2026, 8, 10, 10, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(srv, "_now", lambda: fixed)
    with Session() as db:
        student = _student(db)
        subj = _subject(db, "histoire", "Histoire")
        chapter = _chapter(db, "La Révolution")
        lesson = _lesson(db, chapter)
        card = _chapter_card(db, student, subj, lesson, due_at=fixed + timedelta(days=30))
        db.commit()
        cid, avant_due, avant_interval = chapter.id, card.due_at, card.interval_days

        res = srv.record_attempt(db, student, card.id, "good", chapter_id=cid)

        db.refresh(card)
        assert card.due_at == avant_due, "due_at STRICTEMENT inchangé"
        assert card.interval_days == avant_interval, "interval_days STRICTEMENT inchangé"
        assert card.last_reviewed_at is None, "last_reviewed_at STRICTEMENT inchangé"
        assert res["next_due_at"] == avant_due
        assert res["is_consolidation"] is True


def test_chapter_session_credits_FULL_xp_with_its_own_reason(client_db):
    """Décision 5 : XP PLEIN (5), pas les 2 XP du re-tour — l'effort est le même. Et une `reason`
    distincte, qui est ce qui rend la série lisible."""
    _, Session = client_db
    now = datetime.now(timezone.utc)
    with Session() as db:
        student = _student(db)
        subj = _subject(db, "histoire", "Histoire")
        chapter = _chapter(db, "La Révolution")
        lesson = _lesson(db, chapter)
        card = _chapter_card(db, student, subj, lesson, due_at=now + timedelta(days=30))
        db.commit()

        res = srv.record_attempt(db, student, card.id, "again", chapter_id=chapter.id)
        assert res["xp_awarded"] == 5, "PLEIN, pas 2"
        evt = db.scalar(select(m.XPEvent).where(m.XPEvent.student_id == student.id))
        assert evt.reason == "review_chapter"


def test_false_chapter_context_is_ignored_silently(client_db, monkeypatch):
    """🔴 Décision 4 : le client déclare un CONTEXTE, le serveur le REVALIDE.

    Un `chapter_id` qui ne contient pas la carte est ignoré **en silence** — l'attempt est traité
    normalement (la carte se replanifie), sans erreur ni mention. C'est ce qui empêche un client
    d'éteindre la planification en la demandant.
    """
    _, Session = client_db
    fixed = datetime(2026, 8, 10, 10, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(srv, "_now", lambda: fixed)
    with Session() as db:
        student = _student(db)
        subj = _subject(db, "histoire", "Histoire")
        chap_a = _chapter(db, "Chapitre A")
        chap_b = _chapter(db, "Chapitre B")
        lesson_a = _lesson(db, chap_a)
        _lesson(db, chap_b)
        card = _chapter_card(db, student, subj, lesson_a, due_at=fixed - timedelta(days=1))
        db.commit()

        # On prétend que la carte de A vient d'une session sur B.
        res = srv.record_attempt(db, student, card.id, "good", chapter_id=chap_b.id)

        assert res["is_consolidation"] is False, "contexte faux → attempt NORMAL"
        db.refresh(card)
        assert card.due_at == _naive(fixed + timedelta(days=7)), "la carte s'est REPLANIFIÉE"
        assert card.last_reviewed_at == _naive(fixed)
        evt = db.scalar(select(m.XPEvent).where(m.XPEvent.student_id == student.id))
        assert evt.reason == "review", "pas `review_chapter`"

        # Et un chapitre carrément inexistant : même silence.
        res2 = srv.record_attempt(db, student, card.id, "good", chapter_id=999999)
        assert res2["is_consolidation"] is True, "…mais c'est un RE-TOUR (2e fois le même jour)"


def test_chapter_session_absent_from_memory_panel_present_in_journal(client_db, monkeypatch):
    """Décision 6, en DEUX assertions sur une seule session.

    Le panneau mémoire du dashboard mesure l'OUBLI — une carte non due n'en mesure aucun, donc
    l'attempt en est exclu. Mais c'est du vrai travail : il reste dans le journal d'activité.
    """
    from app.modules.dashboard import service as dash

    _, Session = client_db
    fixed = datetime(2026, 8, 10, 10, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(srv, "_now", lambda: fixed)
    with Session() as db:
        student = _student(db)
        subj = _subject(db, "histoire", "Histoire")
        chapter = _chapter(db, "La Révolution")
        lesson = _lesson(db, chapter)
        card = _chapter_card(db, student, subj, lesson, due_at=fixed + timedelta(days=30))
        db.commit()

        srv.record_attempt(db, student, card.id, "good", chapter_id=chapter.id)

        # 1. ABSENT de la mesure de mémoire.
        mesure = dash._review_attempts(db, student.id, fixed.date() - timedelta(days=7))
        assert mesure.get(subj.id, []) == []

        # 2. PRÉSENT dans le journal d'activité.
        events = db.scalars(
            select(m.LearningEvent).where(
                m.LearningEvent.student_id == student.id,
                m.LearningEvent.event_type == "review_attempted",
            )
        ).all()
        assert len(events) == 1
        assert events[0].payload_json["deck_chapter_id"] == chapter.id
        assert events[0].payload_json["xp"] == 5


def test_agenda_item_carries_its_revisable_count(client_db):
    """La servabilité voyage jusqu'à Massimo — et le `response_model` ne l'avale pas.

    ⚠️ Piège payé deux fois sur ce dépôt (`adr-0045`, `adr-0047`) : une clé produite par le
    service et absente du schéma DISPARAÎT à la sérialisation, sans erreur. On l'assert donc sur
    la réponse HTTP, jamais sur le retour de la fonction.
    """
    client, Session = client_db
    now = datetime.now(timezone.utc)
    today = datetime.now(timezone.utc).date()
    with Session() as db:
        student = _student(db)
        subj = _subject(db, "histoire", "Histoire")
        servable = _chapter(db, "La Révolution")
        lesson = _lesson(db, servable)
        _chapter_card(db, student, subj, lesson, due_at=now + timedelta(days=30))
        vide = _chapter(db, "Sans cartes")
        _lesson(db, vide)
        db.add(
            m.AgendaItem(
                student_id=student.id, label="Contrôle Révolution", due_on=today,
                kind="controle", created_by="parent", chapter_id=servable.id,
            )
        )
        db.add(
            m.AgendaItem(
                student_id=student.id, label="Contrôle vide", due_on=today,
                kind="controle", created_by="parent", chapter_id=vide.id,
            )
        )
        db.commit()

    days = client.get("/api/student/agenda/week").json()["days"]
    items = {i["label"]: i for d in days for i in d["fixed_items"]}
    assert items["Contrôle Révolution"]["revisable_cards"] == 1
    # 🔴 Zéro ⇒ la surface ne rend AUCUNE porte. Le champ doit EXISTER et valoir 0, pas manquer.
    assert items["Contrôle vide"]["revisable_cards"] == 0
