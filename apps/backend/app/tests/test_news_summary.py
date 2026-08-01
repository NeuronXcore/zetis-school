"""Témoins de nouveauté en navigation — comportement des cinq compteurs (ADR-0030).

Chaque compteur doit naître d'un geste de Papa ou du système, et **mourir d'un regard** de
Massimo. Les tests sont écrits dans cet ordre : on constate l'arrivée, puis on fait le geste de
consultation, puis on vérifie que le témoin est retombé.

La doctrine elle-même (aucune échéance consommée, aucune croissance par le temps) est verrouillée
à part, dans `test_news_doctrine.py`.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

import app.db.models as m
from app.modules.fiches import service as fiches_service
from app.tests.test_fiche_service import _seed_validated_lesson
from app.tests.fakes import FakeEmbeddingProvider, FakeLLMProvider

SUMMARY = "/api/student/news/summary"
KEYS = {"agenda", "fiches", "capsules", "revision", "missions"}


# --- helpers de seed ------------------------------------------------------------------------


def _student(db):
    return db.scalar(select(m.StudentProfile).order_by(m.StudentProfile.id))


def _subject(db):
    return db.scalar(select(m.Subject).order_by(m.Subject.id))


def _card(db, *, due_at, last_reviewed_at=None, status="scheduled"):
    """Carte SRS avec sa propre notion. `due_at` est PARAMÉTRABLE exprès : plusieurs tests
    vérifient qu'il n'influence pas le témoin."""
    student, subject = _student(db), _subject(db)
    skill = m.Skill(subject_id=subject.id, name=f"notion-{due_at.isoformat()}", level="4e")
    db.add(skill)
    db.flush()
    card = m.SpacedReviewCard(
        student_id=student.id,
        skill_id=skill.id,
        front_markdown="Question ?",
        back_markdown="Réponse.",
        interval_days=1,
        due_at=due_at,
        last_reviewed_at=last_reviewed_at,
        status=status,
    )
    db.add(card)
    db.commit()
    return card.id


def _mission(db, *, validation="validated", status="planned", started_at=None):
    student, subject = _student(db), _subject(db)
    skill = db.scalar(select(m.Skill).order_by(m.Skill.id))
    mission = m.Mission(
        student_id=student.id,
        subject_id=subject.id,
        skill_id=skill.id,
        title="Renforcer : nombres relatifs",
        mission_type="remediation",
        status=status,
        validation_status=validation,
        started_at=started_at,
        priority=1,
        created_by="ai",
    )
    db.add(mission)
    db.commit()
    return mission.id


def _capsule(db, *, published=True):
    subject = _subject(db)
    capsule = m.Capsule(
        subject_id=subject.id,
        title="Les nombres relatifs en 3 minutes",
        validation_status="validated" if published else "pending",
        video_url="http://minio.local/capsule.mp4" if published else None,
        status="ready",
    )
    db.add(capsule)
    db.commit()
    return capsule.id


def _fiche(db) -> int:
    lesson = _seed_validated_lesson(db)
    row = fiches_service.generate_fiche(
        db, FakeLLMProvider(), FakeEmbeddingProvider(), lesson_id=lesson.id
    )
    return row.id


def _summary(client) -> dict:
    response = client.get(SUMMARY)
    assert response.status_code == 200, response.text
    return response.json()


# --- 1. Contrat de sortie -------------------------------------------------------------------


def test_summary_serves_five_keys_and_nothing_else(client_db) -> None:
    """Le contrat est fermé : cinq entiers, et surtout AUCUN champ d'échéance ou de total.

    Un `due_count` servi « pour information » finirait branché sur un badge — c'est la pression
    durable que l'ADR nomme dans ses coûts. La frontière tient dans le schéma, pas dans l'UI.
    """
    client, _ = client_db
    body = _summary(client)
    assert set(body) == KEYS
    assert all(value == 0 for value in body.values())
    forbidden = ("due", "done", "total", "_at", "late", "retard")
    assert not [key for key in body if any(token in key for token in forbidden)]


def test_summary_requires_authentication(client_db) -> None:
    client, _ = client_db
    from app.main import app
    from app.modules.auth.deps import get_current_user

    app.dependency_overrides.pop(get_current_user)
    assert client.get(SUMMARY).status_code == 401


# --- 2. Chaque témoin naît d'une arrivée et meurt d'un regard --------------------------------


def test_fiches_witness_falls_to_zero_when_opened(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        fiche_id = _fiche(db)

    assert _summary(client)["fiches"] == 0, "une fiche non validée n'est pas encore arrivée"

    with Session() as db:
        fiches_service.validate_fiche(db, fiche_id)
    assert _summary(client)["fiches"] == 1

    assert client.post(f"/api/student/fiches/{fiche_id}/seen").status_code == 204
    assert _summary(client)["fiches"] == 0


def test_capsules_witness_falls_to_zero_when_viewed(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _capsule(db, published=False)
    assert _summary(client)["capsules"] == 0, "une capsule non rendue n'est pas publiée"

    with Session() as db:
        capsule_id = _capsule(db)
    assert _summary(client)["capsules"] == 1

    assert client.post(f"/api/capsules/{capsule_id}/view").status_code in (200, 204)
    assert _summary(client)["capsules"] == 0


def test_missions_witness_falls_to_zero_when_started(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _mission(db, validation="pending")
    assert _summary(client)["missions"] == 0, "une mission non validée n'est pas servie"

    with Session() as db:
        mission_id = _mission(db)
    assert _summary(client)["missions"] == 1

    assert client.post(f"/api/missions/{mission_id}/start").status_code == 200
    assert _summary(client)["missions"] == 0


def test_agenda_witness_falls_to_zero_when_looked_at(client_db) -> None:
    """Le témoin agenda compte ce qui est arrivé DEPUIS le dernier regard, pas ce qui reste
    à faire."""
    client, Session = client_db
    from app.main import app
    from app.modules.auth.deps import get_current_user
    from app.modules.activity.timeutils import today_local

    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}
    due = (today_local() + timedelta(days=3)).isoformat()
    created = client.post(
        "/api/agenda/items",
        json={"items": [{"label": f"Devoir {i}", "due_on": due, "kind": "devoir"} for i in range(3)]},
    )
    assert created.status_code == 201, created.text

    app.dependency_overrides[get_current_user] = lambda: {"username": "massimo", "role": "child"}
    assert _summary(client)["agenda"] == 3

    assert client.post("/api/student/agenda/seen").status_code == 204
    assert _summary(client)["agenda"] == 0

    # Un item arrivé APRÈS le regard rallume le témoin — et lui seul.
    #
    # On date explicitement le nouvel item une minute plus tard plutôt que d'enchaîner regard puis
    # création : `func.now()` s'appuie sur l'horloge du moteur, et sur SQLite (tests)
    # `CURRENT_TIMESTAMP` a une granularité d'UNE SECONDE. Un item créé dans la même seconde que
    # le regard est donc à ÉGALITÉ avec le watermark, pas strictement après. Enchaîner les deux
    # appels testerait la résolution de l'horloge SQLite, pas la règle ; en production (Postgres,
    # `now()` à la microseconde) la collision ne se produit pas.
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}
    late = client.post(
        "/api/agenda/items",
        json={"items": [{"label": "Contrôle", "due_on": due, "kind": "controle"}]},
    ).json()[0]
    with Session() as db:
        item = db.get(m.AgendaItem, late["id"])
        item.created_at = datetime.now(timezone.utc) + timedelta(minutes=1)
        db.commit()

    app.dependency_overrides[get_current_user] = lambda: {"username": "massimo", "role": "child"}
    assert _summary(client)["agenda"] == 1, "seul l'item arrivé après le regard est nouveau"


def test_agenda_item_dismissed_by_massimo_leaves_the_witness(client_db) -> None:
    """Masquer est un geste de Massimo sur sa propre page : l'item cesse d'être « arrivé »."""
    client, _ = client_db
    from app.main import app
    from app.modules.auth.deps import get_current_user
    from app.modules.activity.timeutils import today_local

    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}
    item = client.post(
        "/api/agenda/items",
        json={
            "items": [
                {
                    "label": "Exposé",
                    "due_on": (today_local() + timedelta(days=5)).isoformat(),
                    "kind": "devoir",
                }
            ]
        },
    ).json()[0]

    app.dependency_overrides[get_current_user] = lambda: {"username": "massimo", "role": "child"}
    assert _summary(client)["agenda"] == 1
    assert client.post(f"/api/student/agenda/items/{item['id']}/dismiss").status_code == 200
    assert _summary(client)["agenda"] == 0


# --- 3. Révision : le cas qui a motivé une expression dédiée ---------------------------------


def test_revision_counts_fresh_cards_whatever_their_due_date(client_db) -> None:
    """LE test du lot. Une carte fraîchement générée compte TOUT DE SUITE.

    `schedule_review` pose `due_at = now + intervalle` : si le témoin exigeait que l'échéance
    soit atteinte, la carte n'entrerait dans le compteur que des jours plus tard, sans que
    Massimo ait rien fait. Ici, échéance passée et échéance future comptent pareil — c'est
    exactement ce qui distingue un témoin de nouveauté d'un compteur d'arriéré.
    """
    client, Session = client_db
    now = datetime.now(timezone.utc)
    with Session() as db:
        _card(db, due_at=now - timedelta(days=10))
        _card(db, due_at=now + timedelta(days=10))

    assert _summary(client)["revision"] == 2


def test_revision_witness_falls_to_zero_on_first_review(client_db) -> None:
    client, Session = client_db
    now = datetime.now(timezone.utc)
    with Session() as db:
        _card(db, due_at=now - timedelta(days=1))
        _card(db, due_at=now - timedelta(days=1), last_reviewed_at=now - timedelta(hours=2))

    assert _summary(client)["revision"] == 1, "seule la carte jamais révisée est « nouvelle »"


def test_revision_ignores_non_servable_cards(client_db) -> None:
    """`pending` (sans cours validé), `suspended` (orpheline) et `archived` (réserve) ne sont
    servies à personne : les compter ferait pointer le badge vers un deck vide."""
    client, Session = client_db
    now = datetime.now(timezone.utc)
    with Session() as db:
        for status in ("pending", "suspended", "archived"):
            _card(db, due_at=now - timedelta(days=1), status=status)

    assert _summary(client)["revision"] == 0
