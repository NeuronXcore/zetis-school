"""Tests gamification (SQLite + FakeLLMProvider).

Vérifie la synthèse XP (niveau, badges, régularité) et le crédit d'XP aux moments clés
(verbalisation ELI5, diagnostic, mission de remédiation)."""


def test_summary_empty(client_db) -> None:
    client, _ = client_db
    s = client.get("/api/gamification/summary").json()
    assert s["total_xp"] == 0
    assert s["level"] == 1
    assert s["regularity"]["days_done"] == 0
    assert s["badges"] == []
    assert s["recent"] == []


def test_eli5_reverse_awards_xp(client_db) -> None:
    client, _ = client_db
    client.post("/api/ai/eli5/reverse-evaluate", json={"skill_id": 1, "answer_text": "Mon explication."})
    s = client.get("/api/gamification/summary").json()
    assert s["total_xp"] >= 10
    # La régularité remplace le streak. Elle compte les jours de PRÉSENCE via le journal
    # d'activité : la verbalisation écrit un `reverse_eli5`, la journée est donc cochée.
    assert s["regularity"]["days_done"] == 1
    assert s["regularity"]["today_done"] is True
    assert any(b["code"] == "explainer" for b in s["badges"])


def test_diagnostic_awards_xp_and_badge(client_db) -> None:
    client, _ = client_db
    body = client.post("/api/diagnostics/generate", json={"subject_id": 1}).json()
    quiz = client.get(f"/api/diagnostics/quizzes/{body['quiz_id']}").json()
    answers = [{"question_id": q["id"], "choice_index": 0} for q in quiz["questions"]]
    client.post(f"/api/diagnostics/quizzes/{body['quiz_id']}/submit", json={"answers": answers})

    s = client.get("/api/gamification/summary").json()
    assert s["total_xp"] >= 15
    assert any(b["code"] == "diagnostic" for b in s["badges"])
    assert s["recent"][0]["reason"] == "diagnostic"


def test_level_increases_with_xp(client_db) -> None:
    # 100 XP = niveau 2. Une mission de remédiation = +20 ; on en cumule via plusieurs reverses.
    client, _ = client_db
    for _ in range(10):
        client.post(
            "/api/ai/eli5/reverse-evaluate", json={"skill_id": 1, "answer_text": "Encore une explication."}
        )
    s = client.get("/api/gamification/summary").json()
    assert s["total_xp"] >= 100
    assert s["level"] >= 2
    assert s["xp_for_next"] == 100
    assert any(b["code"] == "xp_100" for b in s["badges"])


def test_mission_completion_grants_first_mission_badge(client_db) -> None:
    # Diagnostic raté → lacune → mission (pending) → validation Papa → start → preuves →
    # complétion des étapes → badge « première mission » (ADR-0017 lot 1 : flux à preuves).
    client, _ = client_db
    body = client.post("/api/diagnostics/generate", json={"subject_id": 1}).json()
    quiz = client.get(f"/api/diagnostics/quizzes/{body['quiz_id']}").json()
    wrong = [{"question_id": q["id"], "choice_index": 1} for q in quiz["questions"]]
    client.post(f"/api/diagnostics/quizzes/{body['quiz_id']}/submit", json={"answers": wrong})
    mission = client.post("/api/missions/generate-remediation").json()["missions"][0]
    mid = mission["id"]
    client.post("/api/missions/validate", json={"ids": [mid]})
    client.post(f"/api/missions/{mid}/start")
    # Preuve de l'étape vocal_explain : un reverse ELI5 postérieur au start.
    client.post(
        "/api/ai/eli5/reverse-evaluate",
        json={"skill_id": mission["skill_id"], "answer_text": "Je réexplique la notion."},
    )
    for step in mission["steps"]:  # eli5 puis vocal_explain (2 étapes, fixture sans quiz)
        client.post(f"/api/missions/{mid}/steps/{step['id']}/complete")

    s = client.get("/api/gamification/summary").json()
    assert any(b["code"] == "first_mission" for b in s["badges"])


# --- « Mon ciel » : GET /api/gamification/history (addendum ADR-0024 « Accueil vivant » §A) -----
#
# Ces tests protègent une décision produit, pas un format de payload. Le contrat dit que les
# jours SANS gain sont absents ; c'est ce qui rend impossible, en aval, la case vide d'une
# heatmap — donc le décompte de jours manqués interdit par CLAUDE.md.


def _seed_xp(TestSession, *, days_ago_and_amount: list[tuple[int, int]]) -> None:
    """Pose des XPEvent datés, sans passer par les routes (on teste la lecture, pas le crédit)."""
    from datetime import datetime, timedelta, timezone

    from app.db import models as m

    db = TestSession()
    student = db.query(m.StudentProfile).first()
    now = datetime.now(timezone.utc)
    for days_ago, amount in days_ago_and_amount:
        db.add(
            m.XPEvent(
                student_id=student.id,
                amount=amount,
                reason="mission_remediation",
                # Midi UTC : loin des bords, pour que le test ne dépende pas du décalage
                # Europe/Paris ni de l'heure à laquelle la suite tourne.
                created_at=(now - timedelta(days=days_ago)).replace(hour=12, minute=0),
            )
        )
    db.commit()
    db.close()


def test_history_empty(client_db) -> None:
    client, _ = client_db
    assert client.get("/api/gamification/history").json() == {"days": []}


def test_history_omits_days_without_xp(client_db) -> None:
    """LE test de la slice : un jour sans gain est ABSENT, jamais présent à zéro.

    Sans lui, un client pourrait reconstruire une grille de présence — exactement ce que
    l'addendum interdit, et que le contrat est censé rendre impossible."""
    client, TestSession = client_db
    _seed_xp(TestSession, days_ago_and_amount=[(5, 60), (2, 25)])

    days = client.get("/api/gamification/history").json()["days"]

    assert len(days) == 2, "les 3 jours intercalaires ne doivent pas exister dans le payload"
    assert all(d["xp"] > 0 for d in days)
    assert [d["date"] for d in days] == sorted(d["date"] for d in days), "ordre chronologique"


def test_history_somme_les_gains_du_meme_jour(client_db) -> None:
    client, TestSession = client_db
    _seed_xp(TestSession, days_ago_and_amount=[(3, 20), (3, 15), (3, 25)])

    days = client.get("/api/gamification/history").json()["days"]
    assert len(days) == 1
    assert days[0]["xp"] == 60


def test_history_borne_la_fenetre_serveur(client_db) -> None:
    client, TestSession = client_db
    _seed_xp(TestSession, days_ago_and_amount=[(120, 40), (2, 30)])

    dans_la_fenetre = client.get("/api/gamification/history?days=30").json()["days"]
    assert len(dans_la_fenetre) == 1, "un jour hors fenêtre ne remonte pas"

    # Le client choisit une fenêtre, pas l'ampleur du scan : au-delà du plafond, c'est un refus
    # explicite et non un scan silencieux de toute la table.
    assert client.get("/api/gamification/history?days=99999").status_code == 422
    assert client.get("/api/gamification/history?days=0").status_code == 422


def test_history_ne_sert_aucune_donnee_de_temps(client_db) -> None:
    """Aucune minute, aucune session, aucun `event_type` : on ne chronomètre pas l'enfant."""
    client, TestSession = client_db
    _seed_xp(TestSession, days_ago_and_amount=[(1, 30)])

    day = client.get("/api/gamification/history").json()["days"][0]
    assert set(day) == {"date", "xp"}


# --- XP par matière : `xp_by_subject` (ADR-0038 §3) --------------------------------------------
#
# La page « Progression » est la seule maison du XP côté Papa (ADR-0028 §5), et elle l'affichait
# en mock. Ces trois tests protègent trois propriétés du cumul, pas un format : que rien n'est tu,
# que rien n'est absent, qu'aucune fenêtre ne s'invite.


def _ajoute_matiere(TestSession, *, name: str, slug: str) -> int:
    from app.db import models as m

    db = TestSession()
    subject = m.Subject(name=name, slug=slug)
    db.add(subject)
    db.commit()
    subject_id = subject.id
    db.close()
    return subject_id


def _matiere_id(TestSession, slug: str) -> int:
    from app.db import models as m

    db = TestSession()
    subject_id = db.query(m.Subject).filter_by(slug=slug).one().id
    db.close()
    return subject_id


def _seed_xp_matiere(TestSession, rows: list[tuple[int | None, int, int]]) -> None:
    """Pose des XPEvent `(subject_id, montant, jours dans le passé)`. `None` = hors matière."""
    from datetime import datetime, timedelta, timezone

    from app.db import models as m

    db = TestSession()
    student = db.query(m.StudentProfile).first()
    now = datetime.now(timezone.utc)
    for subject_id, amount, days_ago in rows:
        db.add(
            m.XPEvent(
                student_id=student.id,
                subject_id=subject_id,
                amount=amount,
                reason="mission_remediation",
                created_at=(now - timedelta(days=days_ago)).replace(hour=12, minute=0),
            )
        )
    db.commit()
    db.close()


def _reparti(TestSession):
    """(répartition par matière, total XP) — le total vient de `summary`, seule maison du total."""
    from app.db import models as m
    from app.modules.gamification import service

    db = TestSession()
    student = db.query(m.StudentProfile).first()
    try:
        return service.xp_by_subject(db, student), service.summary(db, student)["total_xp"]
    finally:
        db.close()


def test_xp_par_matiere_ne_tait_aucun_evenement(client_db) -> None:
    """LE verrou : matières + hors-matière = le total. Rien ne disparaît en chemin.

    Taire les événements sans matière ferait que la somme des colonnes d'un écran ne vaudrait pas
    son total — le défaut exact déjà payé sur le donut du dashboard (`unattributed_minutes`)."""
    _, TestSession = client_db
    maths = _matiere_id(TestSession, "mathematiques")
    francais = _ajoute_matiere(TestSession, name="Français", slug="francais")
    _seed_xp_matiere(TestSession, [(maths, 40, 0), (francais, 25, 3), (None, 15, 1)])

    reparti, total = _reparti(TestSession)

    # Anti-vacuité : sans XP hors matière dans la fixture, l'égalité finale tiendrait même si le
    # champ était oublié — le test passerait sans rien prouver.
    assert reparti.unattributed_xp == 15
    assert reparti.by_subject[maths] == 40
    assert reparti.by_subject[francais] == 25
    assert sum(reparti.by_subject.values()) + reparti.unattributed_xp == total == 80


def test_xp_par_matiere_rend_zero_et_non_l_absence(client_db) -> None:
    """Une matière sans le moindre XP a sa ligne, à `0`.

    Absente, elle obligerait l'appelant à deviner — et une matière qu'on ne voit pas se lit
    « elle n'existe pas », pas « elle n'a rien rapporté »."""
    _, TestSession = client_db
    maths = _matiere_id(TestSession, "mathematiques")
    jamais_travaillee = _ajoute_matiere(TestSession, name="Espagnol", slug="espagnol")
    _seed_xp_matiere(TestSession, [(maths, 40, 0)])

    reparti, _total = _reparti(TestSession)

    assert jamais_travaillee in reparti.by_subject, "une matière à zéro n'est pas une matière absente"
    assert reparti.by_subject[jamais_travaillee] == 0


def test_xp_par_matiere_n_a_aucune_fenetre(client_db) -> None:
    """Un cumul d'XP est un stock : un événement ancien compte autant qu'un événement d'hier.

    400 jours dépasse même `XP_HISTORY_MAX_DAYS` (365) : un filtre de date, fût-il généreux,
    ferait tomber ce test."""
    _, TestSession = client_db
    maths = _matiere_id(TestSession, "mathematiques")
    _seed_xp_matiere(TestSession, [(maths, 30, 400), (maths, 12, 0)])

    reparti, _total = _reparti(TestSession)

    assert reparti.by_subject[maths] == 42
