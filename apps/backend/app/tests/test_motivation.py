"""Régularité douce et engagement hebdomadaire (chantier « auto-motivation »).

Ces tests protègent une décision produit autant qu'un comportement : la régularité NE DOIT PAS
pouvoir se lire comme une punition. Plusieurs assertions portent donc sur ce que le contrat
n'expose PAS.
"""

from datetime import date, datetime, timedelta, timezone

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.motivation import service

UTC = timezone.utc
# Lundi 27 juillet 2026.
MONDAY = date(2026, 7, 27)


def _as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def _seed_events(TestSession, moments: list[datetime]) -> int:
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        for moment in moments:
            db.add(
                m.LearningEvent(
                    student_id=student.id,
                    event_type="login",
                    payload_json={},
                    created_at=moment,
                )
            )
        db.commit()
        return student.id


def _at(day_offset: int, hour: int = 10) -> datetime:
    """Instant UTC au sein de la semaine du 27 juillet (la semaine déborde sur août)."""
    return datetime(2026, 7, 27, hour, 0, tzinfo=UTC) + timedelta(days=day_offset)


class TestRegularite:
    def test_sert_toujours_sept_cases(self, client_db) -> None:
        _, TestSession = client_db
        student_id = _seed_events(TestSession, [])
        with TestSession() as db:
            week = service.week_engagement(db, student_id=student_id, today=MONDAY)

        assert len(week["days"]) == 7
        assert week["days"][0]["date"] == "2026-07-27"
        assert week["days"][-1]["date"] == "2026-08-02"  # dimanche
        assert week["days_done"] == 0

    def test_trois_jours_NON_consecutifs_comptent_trois(self, client_db) -> None:
        """La preuve que ça ne casse pas : lundi, mercredi, samedi valent 3 — un streak aurait
        rendu 0 ou 1."""
        _, TestSession = client_db
        student_id = _seed_events(TestSession, [_at(0), _at(2), _at(5)])
        with TestSession() as db:
            week = service.week_engagement(db, student_id=student_id, today=_at(5).date())

        assert week["days_done"] == 3
        assert [d["active"] for d in week["days"]] == [True, False, True, False, False, True, False]

    def test_la_connexion_seule_coche_la_journee(self, client_db) -> None:
        """« J'étais là et ça n'a pas compté » est exactement l'effet à éviter. Source =
        `learning_events`, jamais `xp_events` : un jour sans XP reste un jour où il est venu."""
        _, TestSession = client_db
        student_id = _seed_events(TestSession, [_at(0)])
        with TestSession() as db:
            week = service.week_engagement(db, student_id=student_id, today=MONDAY)
        assert week["today_done"] is True

    def test_evenement_a_00h30_paris_appartient_au_bon_jour(self, client_db) -> None:
        """Dimanche 22:30 UTC = lundi 00:30 à Paris. Le streak comptait en UTC — c'est la
        divergence de fuseau que la régularité corrige."""
        _, TestSession = client_db
        # Dimanche 26 juillet 22:30 UTC → lundi 27 juillet 00:30 Paris.
        student_id = _seed_events(TestSession, [datetime(2026, 7, 26, 22, 30, tzinfo=UTC)])
        with TestSession() as db:
            week = service.week_engagement(db, student_id=student_id, today=MONDAY)

        assert week["days"][0]["active"] is True  # compté LUNDI, pas dimanche

    def test_la_semaine_suivante_repart_a_zero(self, client_db) -> None:
        """Le lundi, la grille est vide : un départ, pas une chute. Aucun cron n'est requis."""
        _, TestSession = client_db
        student_id = _seed_events(TestSession, [_at(0), _at(1)])
        with TestSession() as db:
            week = service.week_engagement(db, student_id=student_id, today=MONDAY + timedelta(days=7))

        assert week["days_done"] == 0
        assert week["week_start"] == "2026-08-03"
        assert week["goal_days"] is None


class TestEngagement:
    def _seed_goal(self, TestSession, target: int, today: date) -> int:
        with TestSession() as db:
            student = db.query(m.StudentProfile).first()
            service.set_week_goal(
                db, student_id=student.id, target_days=target, today=today
            )
            return student.id

    def test_put_cree_puis_met_a_jour_LA_MEME_ligne(self, client_db) -> None:
        _, TestSession = client_db
        student_id = self._seed_goal(TestSession, 5, MONDAY)
        with TestSession() as db:
            service.set_week_goal(db, student_id=student_id, target_days=3, today=MONDAY)
            rows = db.query(m.StudentWeeklyGoal).all()

        assert len(rows) == 1  # upsert, jamais une seconde ligne
        assert rows[0].target_days == 3

    def test_baisser_son_objectif_peut_le_rendre_atteint(self, client_db) -> None:
        """Réviser à la baisse est autorisé et sans trace. Effet vertueux gratuit : ça peut
        faire basculer `goal_met`, ce que le calcul rend sans code dédié."""
        _, TestSession = client_db
        student_id = _seed_events(TestSession, [_at(0), _at(1)])
        with TestSession() as db:
            high = service.set_week_goal(db, student_id=student_id, target_days=5, today=_at(1).date())
            assert high["goal_met"] is False
            low = service.set_week_goal(db, student_id=student_id, target_days=2, today=_at(1).date())
            assert low["goal_met"] is True

    def test_objectif_non_atteint_ne_produit_AUCUNE_donnee_punitive(self, client_db) -> None:
        """L'invariant central du chantier : le backend ne fournit pas la matière première d'une
        punition, donc aucun frontend ne pourra en inventer une."""
        _, TestSession = client_db
        student_id = _seed_events(TestSession, [_at(0)])
        with TestSession() as db:
            service.set_week_goal(db, student_id=student_id, target_days=5, today=MONDAY)
            week = service.week_engagement(db, student_id=student_id, today=MONDAY)

        assert week["goal_met"] is False
        interdits = {"missed", "failed", "remaining", "streak", "best", "lost", "late"}
        assert set(week) & interdits == set()
        assert all(set(day) == {"date", "active", "is_today"} for day in week["days"])


class TestRoutes:
    def test_get_et_put_bout_en_bout(self, client_db) -> None:
        client, _ = client_db

        assert client.get("/api/student/motivation/week").json()["goal_days"] is None

        body = client.put("/api/student/motivation/week", json={"target_days": 3}).json()
        assert body["goal_days"] == 3
        assert len(body["days"]) == 7

    def test_target_days_borne(self, client_db) -> None:
        client, _ = client_db
        # 0 n'est pas un engagement (« je ne viens pas » n'a pas à être déclaré).
        assert client.put("/api/student/motivation/week", json={"target_days": 0}).status_code == 422
        assert client.put("/api/student/motivation/week", json={"target_days": 8}).status_code == 422

    def test_la_semaine_ne_peut_PAS_etre_choisie_par_le_client(self, client_db) -> None:
        """Pas de modification rétroactive d'un engagement passé, pas de reproche non plus."""
        client, _ = client_db
        res = client.put(
            "/api/student/motivation/week", json={"target_days": 3, "week_start": "2026-01-05"}
        )
        assert res.status_code == 422

    def test_papa_ne_peut_ni_lire_ni_ecrire(self, client_db) -> None:
        """Si Papa posait l'objectif, ce ne serait plus un engagement mais une consigne."""
        client, _ = client_db
        _as_papa()
        assert client.get("/api/student/motivation/week").status_code == 403
        assert (
            client.put("/api/student/motivation/week", json={"target_days": 3}).status_code == 403
        )

    def test_gamification_sert_regularity_ET_le_streak_deprecie(self, client_db) -> None:
        """Coexistence pendant la bascule : `streak_days` reste servi et INCHANGÉ tant que le
        frontend ne l'a pas quitté."""
        client, _ = client_db
        body = client.get("/api/gamification/summary").json()

        assert "regularity" in body
        assert len(body["regularity"]["days"]) == 7
        assert "streak_days" in body and "active_today" in body
