"""Agrégat unique du dashboard Papa (ADR-0028) : un test par invariant.

100 % offline (SQLite in-memory, aucun LLM). Les projections pures sont testées sur des instants
FIXES : aucun test ne doit se mettre à échouer une nuit de passage à l'heure d'été.

Les invariants couverts ici sont ceux qui, s'ils cassaient, le feraient **en silence** : une
courbe qui ne finit pas sur son KPI, des minutes de nuit escamotées, un statut de maîtrise oublié,
un quiz qui s'inviterait dans la file de validation.
"""

from datetime import date, datetime, timedelta, timezone

import app.db.models as m
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.dashboard import projections as p

UTC = timezone.utc
TODAY = date(2026, 7, 29)  # un mercredi


class _Ev:
    """Double léger d'un `LearningEvent` pour les fonctions pures (pas de DB)."""

    def __init__(self, moment: datetime, subject_id: int | None = None, id: int = 1) -> None:
        self.created_at = moment
        self.subject_id = subject_id
        self.event_type = "page_viewed"
        self.id = id


def _as_papa() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


# ==================================================================================================
# Projections pures
# ==================================================================================================


class TestCreneaux:
    def test_plage_couvre_8h_a_minuit_en_huit_lignes(self) -> None:
        """L'ADR écrivait « 8 h → 22 h, 8 lignes », ce qui n'en fait que sept. La maquette porte
        bien huit étiquettes, la dernière étant 22 h : la plage va donc jusqu'à minuit."""
        # Les instants sont donnés en UTC ; le bucketing est en Europe/Paris (UTC+2 en juillet).
        assert p.slot_index(datetime(2026, 7, 29, 6, 0, tzinfo=UTC)) == 0  # 8 h 00 locales
        assert p.slot_index(datetime(2026, 7, 29, 6, 30, tzinfo=UTC)) == 0  # 8 h 30 locales
        assert p.slot_index(datetime(2026, 7, 29, 8, 0, tzinfo=UTC)) == 1  # 10 h 00 locales
        assert p.slot_index(datetime(2026, 7, 29, 21, 30, tzinfo=UTC)) == 7  # 23 h 30 locales
        assert p.slot_index(datetime(2026, 7, 29, 5, 59, tzinfo=UTC)) is None  # 7 h 59 : hors plage
        assert p.SLOT_COUNT == 8

    def test_minutes_de_nuit_sortent_a_part_et_ne_sont_PAS_repliees(self) -> None:
        """Les replier dans le premier créneau les daterait d'une heure fausse. La carte doit
        pouvoir dire « + N min hors plage » plutôt que de mentir sur la grille."""
        nuit = _Ev(datetime(2026, 7, 29, 1, 0, tzinfo=UTC))  # 3 h locales
        matrix, outside = p.bucket_slots([(nuit, 4)], first_day=TODAY, last_day=TODAY)
        assert outside == 4
        assert sum(sum(row) for row in matrix) == 0

    def test_moyenne_divise_par_les_occurrences_du_jour_de_semaine(self) -> None:
        """Sans cette division, une fenêtre de 90 jours afficherait mécaniquement des créneaux
        plus chargés qu'une fenêtre de 7 pour la MÊME habitude."""
        # Deux mercredis dans la fenêtre, 20 min chacun → 20 min en moyenne, pas 40.
        a = _Ev(datetime(2026, 7, 22, 12, 0, tzinfo=UTC), id=1)  # 14 h locales, mercredi
        b = _Ev(datetime(2026, 7, 29, 12, 0, tzinfo=UTC), id=2)  # 14 h locales, mercredi
        matrix, _ = p.bucket_slots(
            [(a, 20), (b, 20)], first_day=date(2026, 7, 20), last_day=TODAY
        )
        assert matrix[3][2] == 20  # créneau 14 h, mercredi


class TestNotionsBreakdown:
    def test_les_six_statuts_sont_couverts(self) -> None:
        """`in_progress` est un SIXIÈME statut, écrit par `missions/service.py` et absent de tous
        les `_status_from_score()`. Un mapping qui l'oublierait le perdrait en silence."""
        statuses = ["mastered", "solid", "learning", "weak", "in_progress"]
        out = p.notions_breakdown(statuses, total=8)
        assert out == {"consolidated": 1, "fragile": 2, "in_progress": 2, "total": 8}

    def test_notions_sans_ligne_de_maitrise_sont_non_abordees(self) -> None:
        out = p.notions_breakdown(["mastered"], total=5)
        assert out["total"] - (out["consolidated"] + out["fragile"] + out["in_progress"]) == 4

    def test_statut_inconnu_tombe_dans_en_cours_plutot_que_d_etre_perdu(self) -> None:
        out = p.notions_breakdown(["une_valeur_future"], total=1)
        assert out["in_progress"] == 1


class TestSeries:
    def test_le_dernier_point_vaut_toujours_le_compteur_courant(self) -> None:
        """LE test de la carte « Évolution de la mémoire » : une courbe qui finirait ailleurs que
        sur le chiffre affiché à côté d'elle serait illisible."""
        marks = p.series_marks(30, TODAY)
        série = p.reconstruct_series(5, [TODAY, TODAY - timedelta(days=10)], marks)
        assert série[-1] == 5
        assert len(série) == p.SERIES_POINTS

    def test_une_entree_non_datable_compte_sur_TOUTE_la_fenetre(self) -> None:
        """Le biais est volontairement dans ce sens : mieux vaut une courbe trop plate qu'une
        courbe qui célèbre des acquis anciens comme s'ils venaient d'arriver."""
        marks = p.series_marks(7, TODAY)
        assert p.reconstruct_series(3, [], marks) == [3] * p.SERIES_POINTS

    def test_la_courbe_est_croissante(self) -> None:
        marks = p.series_marks(90, TODAY)
        dates = [TODAY - timedelta(days=n) for n in (0, 5, 30, 80)]
        série = p.reconstruct_series(4, dates, marks)
        assert série == sorted(série)

    def test_les_douze_points_finissent_aujourd_hui(self) -> None:
        for period in p.PERIODS:
            marks = p.series_marks(period, TODAY)
            assert marks[-1] == TODAY
            assert marks[0] == TODAY - timedelta(days=period - 1)


# ==================================================================================================
# Route et contrat
# ==================================================================================================


def _seed(TestSession) -> None:
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        subject = db.query(m.Subject).first()
        skills = [m.Skill(subject_id=subject.id, name=f"N{i}", level="4e") for i in range(4)]
        db.add_all(skills)
        db.flush()
        # Une consolidée, une fragile, une en cours — la quatrième reste non abordée.
        for skill, status in zip(skills, ["mastered", "weak", "solid"]):
            db.add(
                m.SkillMastery(student_id=student.id, skill_id=skill.id, status=status, mastery_score=50)
            )
        now = datetime.now(UTC)
        for minutes_ago in (30, 28, 26):
            db.add(
                m.LearningEvent(
                    student_id=student.id,
                    subject_id=subject.id,
                    event_type="lesson_viewed",
                    created_at=now - timedelta(minutes=minutes_ago),
                )
            )
        db.commit()


def test_route_interdite_a_l_enfant(client_db) -> None:
    """Analyse parentale : jamais servie à Massimo (CLAUDE.md, séparation des domaines)."""
    client, _ = client_db
    assert client.get("/api/parent/dashboard").status_code == 403


def test_les_trois_fenetres_sont_dans_la_MEME_reponse(client_db) -> None:
    """L'invariant central de l'ADR §1 : changer de période ne doit déclencher aucune requête."""
    client, TestSession = client_db
    _seed(TestSession)
    _as_papa()

    body = client.get("/api/parent/dashboard").json()

    assert sorted(body["periods"]) == ["30", "7", "90"]
    for period in ("7", "30", "90"):
        assert set(body["periods"][period]["kpis"]) == {
            "active_minutes",
            "active_days",
            "consolidated",
            "open_gaps",
        }


def test_l_xp_a_quitte_les_kpi(client_db) -> None:
    """ADR-0028 §5 : l'XP est le levier de Massimo, pas un KPI de pilotage. Il reste sur
    Progression. Sa présence ici transformerait le cockpit en tableau de score."""
    client, TestSession = client_db
    _seed(TestSession)
    _as_papa()

    body = client.get("/api/parent/dashboard").json()

    for period in body["periods"].values():
        assert "xp" not in period["kpis"]
        assert "sessions" not in period["kpis"]
        assert "missions_completed" not in period["kpis"]


def test_les_series_sont_par_matiere_et_jamais_pre_agregees(client_db) -> None:
    """ADR-0028 §2 : pas de ligne « toutes matières » côté serveur — « Toutes » est une somme
    que le client calcule. C'est la condition technique du filtrage sans requête."""
    client, TestSession = client_db
    _seed(TestSession)
    _as_papa()

    body = client.get("/api/parent/dashboard").json()

    assert body["subjects"], "au moins une matière attendue"
    for subject in body["subjects"]:
        assert set(subject["series"]) == {"7", "30", "90"}
        assert set(subject["minutes"]) == {"7", "30", "90"}
        assert subject["slug"] != "all"
    assert all(s["slug"] for s in body["subjects"])


def test_les_jours_vides_sont_omis_du_calendrier(client_db) -> None:
    """Le client reconstruit la grille (présentation). Servir 182 jours dont 150 à zéro
    gonflerait le payload sans rien apprendre."""
    client, TestSession = client_db
    _seed(TestSession)
    _as_papa()

    body = client.get("/api/parent/dashboard").json()

    for subject in body["subjects"]:
        assert all(day["active_minutes"] > 0 for day in subject["calendar"])


def test_une_matiere_sans_referentiel_RESTE_dans_la_liste(client_db) -> None:
    """Le trou est une information. La masquer ferait croire que la matière n'existe pas."""
    client, TestSession = client_db
    _seed(TestSession)
    _as_papa()

    body = client.get("/api/parent/dashboard").json()

    sans = [s for s in body["subjects"] if not s["has_referentiel"]]
    assert sans, "le jeu de test doit contenir au moins une matière sans chapitre"
    assert all("has_referentiel" in s for s in body["subjects"])


def test_la_grille_des_creneaux_a_toujours_8x7(client_db) -> None:
    client, TestSession = client_db
    _seed(TestSession)
    _as_papa()

    body = client.get("/api/parent/dashboard").json()

    for subject in body["subjects"]:
        for period in ("7", "30", "90"):
            matrix = subject["slots"][period]
            assert len(matrix) == 8
            assert all(len(row) == 7 for row in matrix)
            assert period in subject["slots_outside_minutes"]


def test_aucun_constat_sans_preuve(client_db) -> None:
    """« Un constat sans preuve n'est pas émis » — c'est ce qui sépare une lecture d'une opinion."""
    client, TestSession = client_db
    _seed(TestSession)
    _as_papa()

    body = client.get("/api/parent/dashboard").json()

    for item in body["reading"]:
        assert item["evidence"]["href"]
        assert item["evidence"]["count"] >= 0


def test_les_quiz_ne_sont_pas_dans_la_file_de_validation(client_db) -> None:
    """`quizzes` n'a PAS de `validation_status` : ils sont servis sans gate par doctrine
    (ADR-0014 §2). Les compter ici afficherait une file qu'on ne peut pas vider."""
    client, TestSession = client_db
    with TestSession() as db:
        subject = db.query(m.Subject).first()
        db.add(m.Quiz(subject_id=subject.id, title="Quiz", quiz_type="lesson", status="draft"))
        db.commit()
    _as_papa()

    body = client.get("/api/parent/dashboard").json()

    validation = [i for i in body["inbox"] if i["kind"] == "validation"]
    assert validation == [] or "quiz" not in (validation[0]["detail"] or "").lower()


def test_le_temps_par_matiere_PLUS_le_hors_matiere_egale_le_kpi(client_db) -> None:
    """Le donut et le KPI « temps actif » doivent totaliser LE MÊME temps.

    Sans `unattributed_minutes`, la page affichait 42 min au centre du donut à côté d'un KPI
    annonçant 7 h 05 — deux chiffres du même écran qui se contredisaient. La connexion, la
    navigation et le chat portent du temps de présence réel qui n'appartient à aucune matière.
    """
    client, TestSession = client_db
    with TestSession() as db:
        student = db.query(m.StudentProfile).first()
        subject = db.query(m.Subject).first()
        now = datetime.now(UTC)
        # Deux événements SANS matière (login, navigation) et deux AVEC.
        for minutes_ago, subject_id in ((40, None), (38, None), (20, subject.id), (18, subject.id)):
            db.add(
                m.LearningEvent(
                    student_id=student.id,
                    subject_id=subject_id,
                    event_type="page_viewed" if subject_id is None else "lesson_viewed",
                    created_at=now - timedelta(minutes=minutes_ago),
                )
            )
        db.commit()
    _as_papa()

    body = client.get("/api/parent/dashboard").json()

    for window in ("7", "30", "90"):
        by_subject = sum(s["minutes"][window] for s in body["subjects"])
        assert (
            by_subject + body["unattributed_minutes"][window]
            == body["periods"][window]["kpis"]["active_minutes"]["value"]
        ), f"fenêtre {window} : le donut et le KPI ne totalisent pas le même temps"


def test_la_charge_de_revision_couvre_quatorze_jours(client_db) -> None:
    client, TestSession = client_db
    _seed(TestSession)
    _as_papa()

    body = client.get("/api/parent/dashboard").json()

    for subject in body["subjects"]:
        assert len(subject["review_load"]) == 14


def test_etat_vide_ne_casse_pas(client_db) -> None:
    """Première ouverture : la page doit se rendre structurée, jamais blanche."""
    client, _ = client_db
    _as_papa()

    response = client.get("/api/parent/dashboard")

    assert response.status_code == 200
    body = response.json()
    assert body["inbox"] == [] or isinstance(body["inbox"], list)
    assert body["periods"]["7"]["kpis"]["active_minutes"]["value"] == 0
    assert body["days_inactive"] == 0
    assert body["proposed_mission"] is None
