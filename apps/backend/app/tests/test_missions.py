"""Tests missions — proof-based steps + verdict d'acquisition (ADR-0017 lot 1).

Deux niveaux :
- intégration : générer (pending) → valider (Papa) → exposer aux routes student ;
- invariants (un test par invariant du prompt lot 1), en construisant les missions et leurs
  preuves directement en base (le fixture n'a ni leçon ni quiz — on maîtrise chaque timestamp).
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

import app.db.models as m


# --- Helpers ------------------------------------------------------------------------------


def _seeded(db):
    student = db.scalar(select(m.StudentProfile))
    skill = db.scalar(select(m.Skill))
    subject = db.scalar(select(m.Subject))
    return student, skill, subject


def _make_mission(db, *, student, skill, subject, steps, validation="validated"):
    """Crée une mission `remediation` avec ses étapes (step_type, resource_id). Retourne son id."""
    mission = m.Mission(
        student_id=student.id,
        subject_id=subject.id,
        skill_id=skill.id,
        title=f"Renforcer : {skill.name}",
        mission_type="remediation",
        status="planned",
        validation_status=validation,
        priority=1,
        created_by="ai",
    )
    db.add(mission)
    db.flush()
    for index, (step_type, resource_id) in enumerate(steps):
        db.add(
            m.MissionStep(
                mission_id=mission.id,
                step_type=step_type,
                resource_id=resource_id,
                sort_order=index,
                status="pending",
            )
        )
    db.commit()
    return mission.id


def _add_reverse_event(db, *, student, skill, score, at):
    db.add(
        m.LearningEvent(
            student_id=student.id,
            subject_id=skill.subject_id,
            skill_id=skill.id,
            event_type="reverse_eli5",
            payload_json={"score": score},
            created_at=at,
        )
    )
    db.commit()


def _add_mission_quiz_attempt(db, *, student, quiz_id, score, at):
    db.add(
        m.QuizAttempt(
            quiz_id=quiz_id,
            student_id=student.id,
            started_at=at,
            completed_at=at,
            score_percent=score,
            context="mission",
        )
    )
    db.commit()


def _open_gaps_via_failed_diagnostic(client, Session, executer_travail) -> None:
    """⚠️ `/diagnostics/generate` rend `202` depuis l'ADR-0041 §4 — on joue le travail ici, sinon
    aucun quiz n'existe et la lacune ne s'ouvre jamais."""
    res = client.post("/api/diagnostics/generate", json={"subject_id": 1})
    assert res.status_code == 202, res.text
    body = executer_travail(Session, res.json()["job_id"])
    quiz = client.get(f"/api/diagnostics/quizzes/{body['quiz_id']}").json()
    answers = [{"question_id": q["id"], "choice_index": 1} for q in quiz["questions"]]
    res = client.post(f"/api/diagnostics/quizzes/{body['quiz_id']}/submit", json={"answers": answers})
    assert res.json()["gaps"], "le diagnostic raté doit ouvrir une lacune"


def _steps_of(client, mission_id) -> list[dict]:
    return next(mm for mm in client.get("/api/missions").json() if mm["id"] == mission_id)["steps"]


# --- Intégration : génération pending + validation Papa ------------------------------------


def test_generate_creates_pending_missions_with_aligned_step_types(client_db, executer_travail) -> None:
    client, Session = client_db
    _open_gaps_via_failed_diagnostic(client, Session, executer_travail)
    data = client.post("/api/missions/generate-remediation").json()
    assert data["created"] >= 1
    mission = data["missions"][0]
    assert mission["mission_type"] == "remediation"
    # Vocabulaire step_type aligné sur l'ADR (plus explain/reverse).
    types = [s["step_type"] for s in mission["steps"]]
    assert types[:2] == ["eli5", "vocal_explain"]
    # Fixture sans leçon/quiz validés → étape quiz omise (réutiliser sinon dégrader).
    assert "quiz" not in types


def test_generate_is_idempotent(client_db, executer_travail) -> None:
    client, Session = client_db
    _open_gaps_via_failed_diagnostic(client, Session, executer_travail)
    first = client.post("/api/missions/generate-remediation").json()["created"]
    second = client.post("/api/missions/generate-remediation").json()["created"]
    assert first >= 1
    assert second == 0


# --- Invariant 1 : une mission pending n'atteint JAMAIS une route student ------------------


def test_pending_mission_never_reaches_student(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        mid = _make_mission(
            db,
            student=student,
            skill=skill,
            subject=subject,
            steps=[("eli5", skill.id), ("vocal_explain", skill.id)],
            validation="pending",
        )
    # Absente de today (élue + alternatives) et de la liste ; invisible même par id (start → 404).
    today = client.get("/api/missions/today").json()
    today_ids = {m["id"] for m in ([today["elected"]] if today["elected"] else []) + today["alternatives"]}
    assert mid not in today_ids
    assert all(mm["id"] != mid for mm in client.get("/api/missions").json())
    assert client.post(f"/api/missions/{mid}/start").status_code == 404
    # Après validation Papa → visible.
    assert client.post("/api/missions/validate", json={"ids": [mid]}).json()["validated"] == 1
    assert any(mm["id"] == mid for mm in client.get("/api/missions").json())


# --- Invariant 2 : preuve absente / antérieure au start / hors ordre → 409 -----------------


def test_complete_step_requires_ordered_posterior_proof(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        mid = _make_mission(
            db,
            student=student,
            skill=skill,
            subject=subject,
            steps=[("eli5", skill.id), ("vocal_explain", skill.id)],
        )
    steps = _steps_of(client, mid)
    eli5_step, vocal_step = steps[0], steps[1]

    # Hors ordre : compléter l'étape 2 avant l'étape 1 → 409.
    assert (
        client.post(f"/api/missions/{mid}/steps/{vocal_step['id']}/complete").status_code == 409
    )

    # Démarrage puis étape 1 (consultation) OK.
    client.post(f"/api/missions/{mid}/start")
    assert client.post(f"/api/missions/{mid}/steps/{eli5_step['id']}/complete").status_code == 200

    # Étape 2 sans preuve reverse → 409.
    assert (
        client.post(f"/api/missions/{mid}/steps/{vocal_step['id']}/complete").status_code == 409
    )

    with Session() as db:
        student, skill, _ = _seeded(db)
        started = db.get(m.Mission, mid).started_at
        # Preuve ANTÉRIEURE au start → ne compte pas.
        _add_reverse_event(db, student=student, skill=skill, score=80, at=started - timedelta(hours=1))
    assert (
        client.post(f"/api/missions/{mid}/steps/{vocal_step['id']}/complete").status_code == 409
    )

    with Session() as db:
        student, skill, _ = _seeded(db)
        started = db.get(m.Mission, mid).started_at
        _add_reverse_event(db, student=student, skill=skill, score=80, at=started + timedelta(seconds=1))
    # Preuve postérieure → 200 (et fin de mission, 2 étapes).
    assert client.post(f"/api/missions/{mid}/steps/{vocal_step['id']}/complete").status_code == 200


# --- Invariant 3 : XP crédité même si verdict review_later ---------------------------------


def test_xp_awarded_even_when_review_later(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        mid = _make_mission(
            db,
            student=student,
            skill=skill,
            subject=subject,
            steps=[("eli5", skill.id), ("vocal_explain", skill.id)],
        )
    client.post(f"/api/missions/{mid}/start")
    with Session() as db:
        student, skill, _ = _seeded(db)
        started = db.get(m.Mission, mid).started_at
        # Score bas → verdict review_later (et pas de quiz).
        _add_reverse_event(db, student=student, skill=skill, score=40, at=started + timedelta(seconds=1))
    steps = _steps_of(client, mid)
    client.post(f"/api/missions/{mid}/steps/{steps[0]['id']}/complete")
    res = client.post(f"/api/missions/{mid}/steps/{steps[1]['id']}/complete").json()
    assert res["mission_status"] == "completed"
    assert res["verdict"] == "review_later"
    assert res["xp_awarded"] == 50
    with Session() as db:
        xp = db.scalar(select(m.XPEvent).where(m.XPEvent.reason == "mission_remediation"))
        assert xp is not None and xp.amount == 50


# --- Invariant 4 : review_later ⇒ lacune in_progress + carte SRS programmée ----------------


def test_review_later_reopens_gap_and_schedules_srs(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        db.add(
            m.Gap(student_id=student.id, skill_id=skill.id, subject_id=subject.id, status="open")
        )
        db.commit()
        mid = _make_mission(
            db,
            student=student,
            skill=skill,
            subject=subject,
            steps=[("eli5", skill.id), ("vocal_explain", skill.id)],
        )
    client.post(f"/api/missions/{mid}/start")
    with Session() as db:
        student, skill, _ = _seeded(db)
        started = db.get(m.Mission, mid).started_at
        _add_reverse_event(db, student=student, skill=skill, score=45, at=started + timedelta(seconds=1))
    steps = _steps_of(client, mid)
    client.post(f"/api/missions/{mid}/steps/{steps[0]['id']}/complete")
    assert (
        client.post(f"/api/missions/{mid}/steps/{steps[1]['id']}/complete").json()["verdict"]
        == "review_later"
    )
    with Session() as db:
        _, skill, _ = _seeded(db)
        gap = db.scalar(select(m.Gap).where(m.Gap.skill_id == skill.id))
        assert gap is not None and gap.status == "in_progress"
        card = db.scalar(select(m.SpacedReviewCard).where(m.SpacedReviewCard.skill_id == skill.id))
        assert card is not None and card.status == "scheduled" and card.due_at is not None


# --- Le relais du §5bis peut enfin se refermer (addendum ADR-0017, scoring v4) --------------


def test_une_revision_peut_refermer_la_lacune(client_db, monkeypatch) -> None:
    """LE test de la réparation : une mission `revision` menée jusqu'au bout PEUT conclure.

    Avant, c'était structurellement impossible. Le template `revision` composait
    `[carte] → [quiz] → relire` sans étape de réexplication, alors que le verdict exige un
    `reverse_score` — et `eli5` est une étape de CONSULTATION qui n'en produit aucun. Toute
    révision rendait donc `review_later`, et la lacune que l'ADR-0017 §5bis promet de « vérifier
    dans le temps » restait `in_progress` à vie.
    """
    from app.modules.missions import service

    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        # Notion revenue par le SRS après un premier « à revoir ».
        db.add(
            m.Gap(
                student_id=student.id,
                skill_id=skill.id,
                subject_id=subject.id,
                status="in_progress",
            )
        )
        quiz = m.Quiz(subject_id=subject.id, title="Quiz révision", quiz_type="mission", status="ready")
        db.add(quiz)
        db.commit()
        quiz_id = quiz.id

    # Signal de RAPPEL disponible (le fixture n'a ni leçon ni carte : on isole le template, pas la
    # résolution des ressources — même procédé que `test_step_order_depends_on_mission_type`).
    monkeypatch.setattr(service, "_resolve_mission_quiz_id", lambda db, sid: quiz_id)
    monkeypatch.setattr(service, "_resolve_mission_mindmap_id", lambda db, sid: None)

    with Session() as db:
        student, skill, subject = _seeded(db)
        # Le parcours est celui que le générateur compose RÉELLEMENT — pas une liste écrite à la
        # main : c'est le template lui-même qui est sous test.
        steps = [
            (step_type, resource)
            for step_type, _instruction, resource in service._build_revision_steps(
                db, skill.id, skill.name
            )
        ]
        assert "vocal_explain" in [s[0] for s in steps], "le template doit pouvoir être mesuré"
        mid = _make_mission(db, student=student, skill=skill, subject=subject, steps=steps)

    client.post(f"/api/missions/{mid}/start")
    with Session() as db:
        student, skill, _ = _seeded(db)
        started = db.get(m.Mission, mid).started_at
        after = started + timedelta(seconds=1)
        # Réexplication au-dessus du seuil : Massimo sait redire la notion. Plus le rappel.
        _add_reverse_event(db, student=student, skill=skill, score=95, at=after)
        _add_mission_quiz_attempt(db, student=student, quiz_id=quiz_id, score=85, at=after)

    rendered = _steps_of(client, mid)
    for step in rendered[:-1]:
        client.post(f"/api/missions/{mid}/steps/{step['id']}/complete")
    verdict = client.post(f"/api/missions/{mid}/steps/{rendered[-1]['id']}/complete").json()["verdict"]

    assert verdict == "acquired"
    with Session() as db:
        _, skill, _ = _seeded(db)
        gap = db.scalar(select(m.Gap).where(m.Gap.skill_id == skill.id))
        assert gap is not None and gap.status == "resolved"
        assert gap.resolved_at is not None


def test_sans_mesure_la_maitrise_n_est_PAS_ecrasee(client_db) -> None:
    """Une absence de réexplication n'est pas un score de 0.

    Un parcours sans étape vocale (éditeur de steps de Papa, notion d'une champion croisée)
    écrasait `mastery_score` avec 0 : Massimo faisait son travail et sa maîtrise mesurée
    s'effondrait, tandis que la carte SRS était replanifiée au plus court intervalle.
    """
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        mastery = m.SkillMastery(student_id=student.id, skill_id=skill.id, status="solid")
        mastery.mastery_score = 80
        mastery.confidence_score = 80
        db.add(mastery)
        db.commit()
        # Parcours volontairement SANS étape vocale : rien ne mesurera la réexplication.
        mid = _make_mission(
            db, student=student, skill=skill, subject=subject, steps=[("eli5", skill.id)]
        )

    client.post(f"/api/missions/{mid}/start")
    steps = _steps_of(client, mid)
    res = client.post(f"/api/missions/{mid}/steps/{steps[0]['id']}/complete").json()

    # L'acquisition n'est pas prouvée — le verdict reste honnête.
    assert res["verdict"] == "review_later"
    with Session() as db:
        _, skill, _ = _seeded(db)
        mastery = db.scalar(select(m.SkillMastery).where(m.SkillMastery.skill_id == skill.id))
        assert mastery.mastery_score == 80, "la maîtrise a été écrasée par une mesure absente"
        assert mastery.confidence_score == 80
        # Et l'intervalle SRS se calcule sur la maîtrise connue (80 → 7 j), pas sur un 0 → 1 j.
        card = db.scalar(select(m.SpacedReviewCard).where(m.SpacedReviewCard.skill_id == skill.id))
        assert card is not None and card.interval_days == 7


# --- Verdict acquired (quiz + reverse au-dessus des seuils) → lacune résolue ---------------


def test_acquired_verdict_resolves_gap(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        db.add(
            m.Gap(student_id=student.id, skill_id=skill.id, subject_id=subject.id, status="open")
        )
        quiz = m.Quiz(subject_id=subject.id, title="Quiz mission", quiz_type="mission", status="ready")
        db.add(quiz)
        db.commit()
        quiz_id = quiz.id
        mid = _make_mission(
            db,
            student=student,
            skill=skill,
            subject=subject,
            steps=[("eli5", skill.id), ("vocal_explain", skill.id), ("quiz", quiz_id)],
        )
    client.post(f"/api/missions/{mid}/start")
    with Session() as db:
        student, skill, _ = _seeded(db)
        started = db.get(m.Mission, mid).started_at
        after = started + timedelta(seconds=1)
        _add_reverse_event(db, student=student, skill=skill, score=90, at=after)
        _add_mission_quiz_attempt(db, student=student, quiz_id=quiz_id, score=85, at=after)
    steps = _steps_of(client, mid)
    client.post(f"/api/missions/{mid}/steps/{steps[0]['id']}/complete")
    client.post(f"/api/missions/{mid}/steps/{steps[1]['id']}/complete")
    res = client.post(f"/api/missions/{mid}/steps/{steps[2]['id']}/complete").json()
    assert res["verdict"] == "acquired"
    assert res["xp_awarded"] == 50
    with Session() as db:
        _, skill, _ = _seeded(db)
        gap = db.scalar(select(m.Gap).where(m.Gap.skill_id == skill.id))
        assert gap is not None and gap.status == "resolved"
        mastery = db.scalar(select(m.SkillMastery).where(m.SkillMastery.skill_id == skill.id))
        assert mastery is not None and mastery.status == "mastered"


# --- Invariant 5 : `failed` n'est jamais écrit par un flux student -------------------------


def test_failed_status_never_written_by_student_flow(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        mid = _make_mission(
            db,
            student=student,
            skill=skill,
            subject=subject,
            steps=[("eli5", skill.id), ("vocal_explain", skill.id)],
        )
    client.post(f"/api/missions/{mid}/start")
    with Session() as db:
        student, skill, _ = _seeded(db)
        started = db.get(m.Mission, mid).started_at
        _add_reverse_event(db, student=student, skill=skill, score=30, at=started + timedelta(seconds=1))
    steps = _steps_of(client, mid)
    client.post(f"/api/missions/{mid}/steps/{steps[0]['id']}/complete")
    client.post(f"/api/missions/{mid}/steps/{steps[1]['id']}/complete")
    with Session() as db:
        assert db.scalar(select(m.Mission.id).where(m.Mission.status == "failed")) is None
        assert db.get(m.Mission, mid).status == "completed"


# --- Invariant 6 : aucune pénalité liée au temps ------------------------------------------


def test_no_time_penalty_on_old_mission(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        mid = _make_mission(
            db,
            student=student,
            skill=skill,
            subject=subject,
            steps=[("eli5", skill.id), ("vocal_explain", skill.id)],
        )
        # Mission « planned » vieille de 10 jours.
        db.get(m.Mission, mid).created_at = datetime.now(timezone.utc) - timedelta(days=10)
        db.commit()
    client.post(f"/api/missions/{mid}/start")
    with Session() as db:
        student, skill, _ = _seeded(db)
        started = db.get(m.Mission, mid).started_at
        _add_reverse_event(db, student=student, skill=skill, score=80, at=started + timedelta(seconds=1))
    steps = _steps_of(client, mid)
    client.post(f"/api/missions/{mid}/steps/{steps[0]['id']}/complete")
    res = client.post(f"/api/missions/{mid}/steps/{steps[1]['id']}/complete").json()
    # Traitée exactement comme une mission d'hier : complétion normale, XP plein.
    assert res["mission_status"] == "completed"
    assert res["xp_awarded"] == 50


def test_start_is_idempotent(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        mid = _make_mission(
            db,
            student=student,
            skill=skill,
            subject=subject,
            steps=[("eli5", skill.id), ("vocal_explain", skill.id)],
        )
    first = client.post(f"/api/missions/{mid}/start").json()
    assert first["status"] == "active"
    with Session() as db:
        started = db.get(m.Mission, mid).started_at
    # Rejouer /start ne réinitialise pas started_at.
    second = client.post(f"/api/missions/{mid}/start").json()
    assert second["status"] == "active"
    with Session() as db:
        assert db.get(m.Mission, mid).started_at == started


def test_unknown_mission_start_404(client_db) -> None:
    client, _ = client_db
    assert client.post("/api/missions/9999/start").status_code == 404


# --- Affichage enfant : durée + XP exposés, aucune fuite de score (frontière §3) -----------


def test_student_mission_exposes_minutes_and_xp_without_scores(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        _make_mission(
            db,
            student=student,
            skill=skill,
            subject=subject,
            steps=[("eli5", skill.id), ("vocal_explain", skill.id)],
        )
    mission = client.get("/api/missions").json()[0]
    # 5 + 5 minutes (eli5 + vocal), XP d'effort constant.
    assert mission["estimated_minutes"] == 10
    assert mission["xp_reward"] == 50
    # Aucun champ analytique ne fuit vers Massimo (ADR-0017 §3).
    leaked = {"score", "factors", "mastery", "fragility", "reverse_score", "quiz_score", "reason"}
    assert leaked.isdisjoint(mission.keys())


def test_student_mission_names_no_author(client_db) -> None:
    """Une seule voix côté Massimo : rien de ce qu'il voit ne désigne un auteur.

    `MissionStudentOut` exposait `origin` (`papa`/`zetis`), rendu tel quel par la page Missions
    (« 👤 par Papa » / « 🤖 par ZETIS »). Le motif du retrait est la TENUE DANS LE TEMPS, pas
    l'esthétique : le contenu scolaire doit atteindre Massimo dans la voix de ZETIS, quel que soit
    son producteur réel. Signer « par Papa » aujourd'hui obligerait à changer l'auteur du monde de
    Massimo le jour où ZETIS produira seul.

    Papa ne perd rien : `created_by` reste en base ET sur `MissionPilotOut` — c'est une
    information de pilotage, elle ne traverse simplement plus la frontière.
    """
    from app.modules.missions.schemas import MissionPilotOut, MissionStudentOut

    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        _make_mission(db, student=student, skill=skill, subject=subject, steps=[("eli5", skill.id)])
    mission = client.get("/api/missions").json()[0]

    authorship = {"origin", "created_by", "author", "made_by", "source"}
    assert authorship.isdisjoint(mission.keys()), "un auteur est nommé à Massimo"
    assert authorship.isdisjoint(MissionStudentOut.model_fields.keys())
    # La contrepartie : l'information n'est pas perdue, elle est restée du côté du pilotage.
    assert "created_by" in MissionPilotOut.model_fields


# --- « Terminées aujourd'hui » : verdict + XP relus des events, sans score ------------------


def test_completed_today_lists_verdict_and_xp_without_scores(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        mid = _make_mission(
            db,
            student=student,
            skill=skill,
            subject=subject,
            steps=[("eli5", skill.id), ("vocal_explain", skill.id)],
        )
    assert client.get("/api/missions/completed-today").json() == []  # rien de terminé encore

    client.post(f"/api/missions/{mid}/start")
    with Session() as db:
        student, skill, _ = _seeded(db)
        started = db.get(m.Mission, mid).started_at
        _add_reverse_event(db, student=student, skill=skill, score=90, at=started + timedelta(seconds=1))
    steps = _steps_of(client, mid)
    client.post(f"/api/missions/{mid}/steps/{steps[0]['id']}/complete")
    client.post(f"/api/missions/{mid}/steps/{steps[1]['id']}/complete")

    done = client.get("/api/missions/completed-today")
    assert done.status_code == 200
    cards = done.json()
    assert len(cards) == 1
    card = cards[0]
    assert card["mission_id"] == mid
    assert card["verdict"] in {"acquired", "review_later"}
    assert card["xp"] == 50
    assert card["title"] and "subject" in card
    # Aucun score brut relu depuis le payload de l'event (frontière §3).
    assert {"reverse_score", "quiz_score", "mindmap_score", "score"}.isdisjoint(card.keys())


# --- Ordre des étapes selon le type : ELI5 pas toujours en tête (ADR-0017 §5) ---------------


def test_step_order_depends_on_mission_type(client_db, monkeypatch) -> None:
    from app.modules.missions import service

    # Ressources de rappel présentes (on isole l'ORDRE, pas la résolution).
    monkeypatch.setattr(service, "_resolve_mission_mindmap_id", lambda db, sid: 100)
    monkeypatch.setattr(service, "_resolve_mission_quiz_id", lambda db, sid: 200)
    _, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        prog = [s[0] for s in service._build_steps(db, skill.id, skill.name, mission_type="progression")]
        remed = [s[0] for s in service._build_steps(db, skill.id, skill.name, mission_type="remediation")]
        rev = [s[0] for s in service._build_revision_steps(db, skill.id, skill.name)]

    # Notion NOUVELLE (progression) → découverte d'abord.
    assert prog == ["eli5", "vocal_explain", "mindmap", "quiz"]
    # Notion DÉJÀ VUE (remediation) → rappel d'abord, ELI5 ensuite.
    assert remed == ["mindmap", "quiz", "eli5", "vocal_explain"]
    # Révision → rappel, relecture, PUIS réexplication.
    #
    # Cette dernière assertion disait « pas de verbalisation » et figeait une contradiction : le
    # verdict exige un `reverse_score`, que seule l'étape `vocal_explain` produit. Une mission
    # `revision` ne pouvait donc jamais conclure `acquired` (addendum ADR-0017 §5bis, scoring v4).
    assert rev == ["mindmap", "quiz", "eli5", "vocal_explain"]


def test_step_order_identical_without_recall_resources(client_db, monkeypatch) -> None:
    """Sans carte ni quiz réutilisables, les deux ordres coïncident (expliquer → réexpliquer)."""
    from app.modules.missions import service

    monkeypatch.setattr(service, "_resolve_mission_mindmap_id", lambda db, sid: None)
    monkeypatch.setattr(service, "_resolve_mission_quiz_id", lambda db, sid: None)
    _, Session = client_db
    with Session() as db:
        student, skill, subject = _seeded(db)
        prog = [s[0] for s in service._build_steps(db, skill.id, skill.name, mission_type="progression")]
        remed = [s[0] for s in service._build_steps(db, skill.id, skill.name, mission_type="remediation")]
    assert prog == remed == ["eli5", "vocal_explain"]
