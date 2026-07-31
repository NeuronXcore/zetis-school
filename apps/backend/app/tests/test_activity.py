"""Tests du chantier « Activité » : hooks, télémétrie, projections, routes parent.

100 % offline (SQLite in-memory, aucun LLM). Les projections sont testées sur des instants
FIXES et explicites : aucune dépendance à l'heure d'exécution, donc aucun test qui se met à
échouer une nuit de passage à l'heure d'été.
"""

from datetime import datetime, timedelta, timezone

import app.db.models as m
from app.main import app
from app.modules.activity.service import (
    active_minutes,
    bucket_days,
    build_sessions,
    event_minutes,
    group_reviews,
)
from app.modules.activity.timeutils import local_day
from app.modules.auth.deps import get_current_user

UTC = timezone.utc


class _Ev:
    """Double léger d'un `LearningEvent` pour les fonctions pures (pas de DB)."""

    def __init__(self, moment: datetime, event_type: str = "page_viewed", id: int = 1) -> None:
        self.created_at = moment
        self.event_type = event_type
        self.id = id


def _as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


# ==============================================================================================
# Projections pures
# ==============================================================================================


def test_session_cuts_at_fifteen_minutes() -> None:
    """14 min → une seule session ; 16 min → deux. Le seuil lui-même reste dans la session."""
    base = datetime(2026, 7, 15, 10, 0, tzinfo=UTC)

    close = build_sessions([_Ev(base, id=1), _Ev(base + timedelta(minutes=14), id=2)])
    assert len(close) == 1

    exact = build_sessions([_Ev(base, id=1), _Ev(base + timedelta(minutes=15), id=2)])
    assert len(exact) == 1

    apart = build_sessions([_Ev(base, id=1), _Ev(base + timedelta(minutes=16), id=2)])
    assert len(apart) == 2


def test_active_minutes_caps_each_gap() -> None:
    """Un écart de 30 min ne compte que 5 : c'est un indicateur de présence, pas de durée."""
    base = datetime(2026, 7, 15, 10, 0, tzinfo=UTC)
    events = [
        _Ev(base, id=1),
        _Ev(base + timedelta(minutes=30), id=2),  # écart plafonné à 5
        _Ev(base + timedelta(minutes=33), id=3),  # écart réel de 3 min, sous le plafond
    ]
    # 5 (plafonné) + 3 (réel) + 0 (dernier événement) = 8
    assert active_minutes(events) == 8
    assert event_minutes(events) == [5, 3, 0]
    # Invariant : les minutes par événement somment exactement le temps actif (le client
    # n'a donc jamais à recalculer quoi que ce soit).
    assert sum(event_minutes(events)) == active_minutes(events)


def test_bucketing_uses_paris_day_not_utc() -> None:
    """Un événement à 00h30 à Paris appartient au jour PARIS, pas au jour UTC de la veille."""
    # 2026-07-16 00:30 Paris (CEST, UTC+2) == 2026-07-15 22:30 UTC : les dates diffèrent.
    after_midnight = datetime(2026, 7, 15, 22, 30, tzinfo=UTC)
    assert local_day(after_midnight).isoformat() == "2026-07-16"

    # 23h30 à Paris reste bien sur son propre jour.
    late_evening = datetime(2026, 7, 15, 21, 30, tzinfo=UTC)
    assert local_day(late_evening).isoformat() == "2026-07-15"

    buckets = bucket_days([_Ev(late_evening, id=1), _Ev(after_midnight, id=2)])
    assert [day.isoformat() for day in buckets] == ["2026-07-15", "2026-07-16"]


def test_naive_timestamps_are_read_as_utc() -> None:
    """SQLite rend des datetimes NAÏFS : la projection ne doit pas exploser dessus.

    Verrou de portabilité — sans normalisation, tout marcherait en production (PostgreSQL
    conserve le fuseau) et planterait en test."""
    naive = datetime(2026, 7, 15, 10, 0)
    events = [_Ev(naive, id=1), _Ev(naive + timedelta(minutes=3), id=2)]
    assert active_minutes(events) == 3


def test_group_reviews_aggregates_consecutive_cards() -> None:
    """Une rafale de révisions devient UNE ligne « Révision SRS · n cartes », XP et minutes sommés."""
    entries = [
        {"event_type": "login", "label": "Connexion", "xp": 0, "minutes": 1},
        {"event_type": "review_attempted", "label": "Révision SRS", "xp": 5, "minutes": 1},
        {"event_type": "review_attempted", "label": "Révision SRS", "xp": 5, "minutes": 2},
        {"event_type": "review_attempted", "label": "Révision SRS", "xp": 3, "minutes": 1},
        {"event_type": "quiz_attempted", "label": "Quiz", "xp": 20, "minutes": 0},
    ]
    grouped = group_reviews(entries)

    assert [e["label"] for e in grouped] == [
        "Connexion",
        "Révision SRS · 3 cartes",
        "Quiz",
    ]
    assert grouped[1]["xp"] == 13
    assert grouped[1]["minutes"] == 4
    assert grouped[1]["count"] == 3


def test_group_reviews_does_not_merge_across_other_events() -> None:
    """Deux séances séparées par une autre activité restent deux lignes distinctes."""
    entries = [
        {"event_type": "review_attempted", "label": "Révision SRS", "xp": 5, "minutes": 1},
        {"event_type": "lesson_viewed", "label": "Cours lu", "xp": 0, "minutes": 2},
        {"event_type": "review_attempted", "label": "Révision SRS", "xp": 5, "minutes": 1},
    ]
    grouped = group_reviews(entries)
    assert [e["event_type"] for e in grouped] == [
        "review_attempted",
        "lesson_viewed",
        "review_attempted",
    ]


# ==============================================================================================
# Télémétrie
# ==============================================================================================


def test_pageview_is_logged_and_server_timestamped(client_db) -> None:
    """Le serveur horodate : un `created_at` envoyé par le client est REFUSÉ (extra="forbid")."""
    client, TestSession = client_db

    assert client.post("/api/telemetry/pageview", json={"route": "/cours"}).status_code == 204

    with TestSession() as db:
        events = db.query(m.LearningEvent).filter_by(event_type="page_viewed").all()
        assert len(events) == 1
        assert events[0].payload_json == {"route": "/cours"}
        # Horodatage serveur, donc récent — jamais une valeur soufflée par le client.
        assert (datetime.now(UTC) - events[0].created_at.replace(tzinfo=UTC)).total_seconds() < 60

    # Toute tentative de dicter l'horodatage est rejetée par le schéma.
    refused = client.post(
        "/api/telemetry/pageview",
        json={"route": "/triche", "created_at": "2020-01-01T00:00:00Z"},
    )
    assert refused.status_code == 422


def test_pageview_dedupes_consecutive_identical_route(client_db) -> None:
    """Un remontage de composant ne doit pas gonfler le journal — mais un aller-retour compte."""
    client, TestSession = client_db

    client.post("/api/telemetry/pageview", json={"route": "/cours"})
    client.post("/api/telemetry/pageview", json={"route": "/cours"})  # ignoré
    client.post("/api/telemetry/pageview", json={"route": "/revision"})
    client.post("/api/telemetry/pageview", json={"route": "/cours"})  # retour → compte

    with TestSession() as db:
        routes = [
            e.payload_json["route"]
            for e in db.query(m.LearningEvent).filter_by(event_type="page_viewed").all()
        ]
    assert routes == ["/cours", "/revision", "/cours"]


def test_pageview_route_is_bounded(client_db) -> None:
    client, _ = client_db
    assert client.post("/api/telemetry/pageview", json={"route": "x" * 201}).status_code == 422
    assert client.post("/api/telemetry/pageview", json={"route": ""}).status_code == 422


def test_pageview_is_forbidden_for_papa(client_db) -> None:
    """La seule écriture cliente du journal appartient à l'espace de Massimo."""
    client, _ = client_db
    _as_papa()
    assert client.post("/api/telemetry/pageview", json={"route": "/x"}).status_code == 403


# ==============================================================================================
# Hooks
# ==============================================================================================


def _seed_validated_lesson(TestSession) -> int:
    """Chapitre + leçon validés rattachés à la matière du conftest, avec un cours."""
    with TestSession() as db:
        subject = db.query(m.Subject).first()
        theme = m.Theme(subject_id=subject.id, name="Thème")
        db.add(theme)
        db.flush()
        chapter = m.Chapter(theme_id=theme.id, name="Chapitre", validation_status="validated")
        db.add(chapter)
        db.flush()
        lesson = m.Lesson(
            chapter_id=chapter.id,
            title="Les nombres relatifs",
            status="validated",
            created_by="ai",
            content_markdown="# Cours",
        )
        db.add(lesson)
        db.commit()
        return lesson.id


def test_lesson_view_is_logged_once_per_day(client_db) -> None:
    """Deux consultations le même jour → UN seul événement (un refresh n'est pas une activité)."""
    client, TestSession = client_db
    lesson_id = _seed_validated_lesson(TestSession)

    assert client.get(f"/api/student/lessons/{lesson_id}/cours").status_code == 200
    assert client.get(f"/api/student/lessons/{lesson_id}/cours").status_code == 200

    with TestSession() as db:
        events = db.query(m.LearningEvent).filter_by(event_type="lesson_viewed").all()
    assert len(events) == 1
    assert events[0].payload_json["lesson_id"] == lesson_id
    assert events[0].payload_json["lesson_title"] == "Les nombres relatifs"
    # La matière est résolue : sans elle, la consultation disparaîtrait du filtre matière.
    assert events[0].subject_id is not None


def test_hook_never_breaks_its_host_endpoint(client_db) -> None:
    """Une leçon inexistante répond 404 comme avant, et n'entre pas dans le journal."""
    client, TestSession = client_db

    assert client.get("/api/student/lessons/99999/cours").status_code == 404

    with TestSession() as db:
        assert db.query(m.LearningEvent).filter_by(event_type="lesson_viewed").count() == 0


def test_login_of_massimo_is_logged_but_not_papa(client_db) -> None:
    """Le journal trace l'activité de Massimo — la connexion de Papa n'en fait pas partie."""
    client, TestSession = client_db

    client.post("/api/auth/login", json={"username": "papa", "password": "papa1234"})
    with TestSession() as db:
        assert db.query(m.LearningEvent).filter_by(event_type="login").count() == 0

    client.post("/api/auth/login", json={"username": "massimo", "password": "massimo1234"})
    with TestSession() as db:
        assert db.query(m.LearningEvent).filter_by(event_type="login").count() == 1


# ==============================================================================================
# Routes parent
# ==============================================================================================


def _seed_events(TestSession, rows: list[tuple[datetime, str, int | None]]) -> None:
    """Insère des événements bruts : (instant UTC, type, subject_id)."""
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        for moment, event_type, subject_id in rows:
            db.add(
                m.LearningEvent(
                    student_id=student.id,
                    subject_id=subject_id,
                    event_type=event_type,
                    payload_json={},
                    created_at=moment,
                )
            )
        db.commit()


def test_parent_routes_are_forbidden_for_child(client_db) -> None:
    """Le rôle enfant (défaut du conftest) ne voit aucune lecture de pilotage."""
    client, _ = client_db
    # `/activity/heatmap` a été supprimée (ADR-0028) ; la garde de rôle de l'agrégat qui la
    # remplace est testée dans `test_dashboard.py`.
    assert client.get("/api/parent/activity/days/2026-07-15").status_code == 403
    assert client.get("/api/parent/activity/sessions").status_code == 403
    assert client.get("/api/parent/dashboard").status_code == 403


def test_day_detail_groups_reviews_and_serves_minutes(client_db) -> None:
    client, TestSession = client_db
    base = datetime(2026, 7, 15, 8, 0, tzinfo=UTC)
    _seed_events(
        TestSession,
        [
            (base, "login", None),
            (base + timedelta(minutes=2), "review_attempted", None),
            (base + timedelta(minutes=3), "review_attempted", None),
            (base + timedelta(minutes=5), "quiz_attempted", None),
        ],
    )
    _as_papa()

    body = client.get("/api/parent/activity/days/2026-07-15").json()

    assert body["date"] == "2026-07-15"
    assert [e["label"] for e in body["events"]] == [
        "Connexion",
        "Révision SRS · 2 cartes",
        "Quiz",
    ]
    assert body["events"][0]["time"] == "10:00"  # 08:00 UTC == 10:00 Paris (CEST)
    assert body["events"][1]["minutes"] == 3  # 1 min entre les cartes + 2 min avant le quiz


def test_day_detail_rejects_invalid_date(client_db) -> None:
    client, _ = client_db
    _as_papa()
    assert client.get("/api/parent/activity/days/pas-une-date").status_code == 404


def test_sessions_are_reconstructed_and_empty_days_kept(client_db) -> None:
    """Deux sessions le même jour, et les jours sans activité restent visibles."""
    client, TestSession = client_db
    base = datetime(2026, 7, 15, 8, 0, tzinfo=UTC)
    _seed_events(
        TestSession,
        [
            (base, "login", None),
            (base + timedelta(minutes=10), "page_viewed", None),
            (base + timedelta(minutes=40), "quiz_attempted", None),  # > 15 min → 2e session
        ],
    )
    _as_papa()

    body = client.get(
        "/api/parent/activity/sessions", params={"from": "2026-07-14", "to": "2026-07-15"}
    ).json()

    # Jours du plus récent au plus ancien, jour vide conservé (l'absence est une information).
    assert [d["date"] for d in body["days"]] == ["2026-07-15", "2026-07-14"]
    assert body["days"][1]["sessions"] == []

    sessions = body["days"][0]["sessions"]
    assert len(sessions) == 2
    assert sessions[0]["active_minutes"] == 5  # écart de 10 min plafonné à 5
    assert len(sessions[0]["events"]) == 2
    assert len(sessions[1]["events"]) == 1

    # Bornes affichables en heure de Paris (08:00 UTC == 10:00 CEST), cohérentes avec le `time`
    # des événements de la MÊME carte : aucune conversion à faire côté client.
    assert sessions[0]["started_time"] == "10:00"
    assert sessions[0]["ended_time"] == "10:10"
    assert sessions[0]["events"][0]["time"] == sessions[0]["started_time"]
    # L'instant brut reste disponible en UTC pour tout calcul.
    assert sessions[0]["started_at"].startswith("2026-07-15T08:00")


def test_subject_filter_applies_to_sessions(client_db) -> None:
    """`subject_id` filtre bien les sessions du Cahier de bord.

    Le volet « et jamais le décrochage » de ce test est parti avec `/activity/heatmap`
    (ADR-0028) ; il vit désormais dans `test_dashboard.py`, contre l'agrégat qui sert
    `days_inactive`."""
    client, TestSession = client_db
    with TestSession() as db:
        maths = db.query(m.Subject).first()
        other = m.Subject(name="Français", slug="francais")
        db.add(other)
        db.commit()
        maths_id, other_id = maths.id, other.id

    three_days_ago = datetime.now(UTC).replace(
        hour=8, minute=0, second=0, microsecond=0
    ) - timedelta(days=3)
    _seed_events(TestSession, [(three_days_ago, "lesson_viewed", maths_id)])
    _as_papa()

    sessions = client.get(
        "/api/parent/activity/sessions", params={"subject_id": other_id}
    ).json()
    assert all(day["sessions"] == [] for day in sessions["days"])

    kept = client.get("/api/parent/activity/sessions", params={"subject_id": maths_id}).json()
    assert any(day["sessions"] for day in kept["days"])


# Les KPI du dashboard ont quitté ce module avec la route (ADR-0028 §1) : ils sont désormais
# testés dans `test_dashboard.py`, contre le nouveau contrat (`active_days` remplace `sessions`,
# l'XP quitte les KPI parent). Ce fichier ne couvre plus que les projections d'activité.
