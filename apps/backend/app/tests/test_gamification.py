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
