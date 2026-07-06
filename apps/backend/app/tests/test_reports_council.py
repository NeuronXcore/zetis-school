"""Conseil de classe IA (ADR-0020) — narration locale sur évidence, ancrage `skill_id`
anti-hallucination, dégradation gracieuse, Papa-only, pont Commander."""

from sqlalchemy import select

import app.db.models as m
from app.main import app
from app.modules.ai import get_provider
from app.modules.auth.deps import get_current_user
from app.tests.fakes import FakeLLMProvider


def _as_parent() -> None:
    app.dependency_overrides[get_current_user] = lambda: {"username": "papa", "role": "papa"}


def _seed_mastery(db, *, score: float = 0.2):
    """Fait apparaître la notion seedée dans l'évidence (maîtrise faible = fragile)."""
    student = db.scalar(select(m.StudentProfile))
    skill = db.scalar(select(m.Skill))
    db.add(
        m.SkillMastery(
            student_id=student.id, skill_id=skill.id, mastery_score=score, status="in_progress"
        )
    )
    db.commit()
    return student, skill


def test_council_requires_parent(client_db) -> None:
    client, _ = client_db
    # Rôle enfant par défaut (conftest) → route Papa refusée.
    assert client.post("/api/reports/class-council", json={}).status_code == 403


def test_generate_empty_evidence_is_graceful(client_db) -> None:
    client, _ = client_db
    _as_parent()
    # Aucune mastery/lacune seedée → pas d'appel LLM, rapport serein.
    r = client.post("/api/reports/class-council", json={})
    assert r.status_code == 200
    body = r.json()
    assert body["subjects"] == []
    assert "assez de données" in body["global_summary"].lower()


def test_generate_narrates_and_anchors_skill_ids(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _, skill = _seed_mastery(db)
        real_id = skill.id
        subject_id = db.get(m.Skill, real_id).subject_id
    _as_parent()
    # Le LLM (fake) renvoie une reco mêlant le skill réel ET un id inventé (999999).
    app.dependency_overrides[get_provider] = lambda: FakeLLMProvider(
        council={
            "global_summary": "Bilan encourageant.",
            "subjects": [
                {
                    "subject_id": subject_id,
                    "subject_name": "Mathématiques",
                    "strengths": "des bases solides",
                    "to_reinforce": "une notion en construction",
                    "recent_evolution": "stable",
                    "recommendations": [
                        {
                            "skill_ids": [real_id, 999999],
                            "mission_type": "manual",
                            "template_hint": "recall_first",
                            "justification": "maîtrise en construction",
                        }
                    ],
                }
            ],
        }
    )
    r = client.post("/api/reports/class-council", json={"period": "Trimestre 1"})
    assert r.status_code == 200
    body = r.json()
    assert body["period"] == "Trimestre 1"
    assert len(body["subjects"]) == 1
    reco = body["subjects"][0]["recommendations"][0]
    # Ancrage : le skill réel est gardé, l'id inventé (hors évidence) est retiré.
    assert real_id in reco["skill_ids"]
    assert 999999 not in reco["skill_ids"]
    assert reco["skill_names"] and all(reco["skill_names"])  # noms résolus pour l'affichage
    # Trace IA + persistance figée.
    with Session() as db:
        job = db.scalar(select(m.AIJob).where(m.AIJob.job_type == "council_generate"))
        assert job is not None and job.status == "succeeded"
        report = db.scalar(select(m.CouncilReport))
        assert report is not None and report.evidence_snapshot_json["subjects"]


def test_anchoring_drops_unknown_subject(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _seed_mastery(db)
    _as_parent()
    app.dependency_overrides[get_provider] = lambda: FakeLLMProvider(
        council={
            "global_summary": "x",
            "subjects": [
                {
                    "subject_id": 987654,  # matière absente de l'évidence
                    "subject_name": "Inventée",
                    "strengths": "",
                    "to_reinforce": "",
                    "recent_evolution": "",
                    "recommendations": [],
                }
            ],
        }
    )
    r = client.post("/api/reports/class-council", json={})
    assert r.status_code == 200
    assert r.json()["subjects"] == []  # matière hors évidence retirée


def test_create_missions_from_reco_reuses_commander(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _, skill = _seed_mastery(db)
        real_id = skill.id
    _as_parent()
    r = client.post(
        "/api/reports/class-council/create-missions",
        json={"skill_ids": [real_id], "force_priority": True},
    )
    assert r.status_code == 200
    assert len(r.json()) == 1
    with Session() as db:
        mission = db.scalar(select(m.Mission).where(m.Mission.mission_type == "manual"))
        assert mission is not None
        assert mission.skill_id == real_id
        # 5ter : validée par construction (le clic Papa EST l'approbation) + priorité forcée.
        assert mission.validation_status == "validated"
        assert mission.force_priority is True


def _seed_validated_lesson_for_skill(db):
    """Année active → matière → chapitre validé → leçon validée + contenu, rattachée à la notion."""
    subject = db.scalar(select(m.Subject))
    skill = db.scalar(select(m.Skill))
    student = db.scalar(select(m.StudentProfile))
    year = m.SchoolYear(student_id=student.id, label="2026-2027", level="4e", status="active")
    db.add(year)
    db.flush()
    sysr = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject.id, status="active")
    db.add(sysr)
    db.flush()
    chap = m.Chapter(
        school_year_subject_id=sysr.id, name="Ch", validation_status="validated", sort_order=0
    )
    db.add(chap)
    db.flush()
    lesson = m.Lesson(
        chapter_id=chap.id,
        title="Leçon",
        status="validated",
        created_by="ai",
        content_markdown="# Titre\n\nUn contenu de cours suffisant pour dériver.",
        program_version="2020",
        sort_order=0,
    )
    db.add(lesson)
    db.flush()
    db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill.id))
    db.commit()
    return lesson, skill


def test_equip_notion_skips_when_no_lesson(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        sid = db.scalar(select(m.Skill)).id
    _as_parent()
    r = client.post("/api/reports/class-council/equip-notion", json={"skill_id": sid})
    assert r.status_code == 200
    body = r.json()
    assert body["has_lesson"] is False
    assert body["generated"] == []
    assert set(body["skipped"]) == {"cours", "fiche", "srs", "quiz", "mindmap"}


def test_equip_notion_generates_and_autovalidates_kit(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _seed_validated_lesson_for_skill(db)
        sid = db.scalar(select(m.Skill)).id
    _as_parent()
    r = client.post("/api/reports/class-council/equip-notion", json={"skill_id": sid})
    assert r.status_code == 200
    body = r.json()
    assert body["has_lesson"] is True
    assert body["errors"] == []
    # Cours déjà validé → sauté (idempotence) ; les dérivés sont générés.
    assert "cours" in body["skipped"]
    assert {"fiche", "srs", "quiz", "mindmap"}.issubset(set(body["generated"]))
    # Auto-validation en base : le kit est utilisable par une mission tout de suite.
    with Session() as db:
        assert db.scalar(
            select(m.Fiche).where(m.Fiche.validation_status == "validated")
        ) is not None
        assert db.scalar(
            select(m.Mindmap).where(m.Mindmap.validation_status == "validated")
        ) is not None
        assert db.scalar(
            select(m.Quiz).where(m.Quiz.quiz_type == "mission", m.Quiz.status == "ready")
        ) is not None
    # Idempotence : un 2e passage ne régénère pas les pièces déjà validées.
    again = client.post("/api/reports/class-council/equip-notion", json={"skill_id": sid}).json()
    assert {"fiche", "quiz", "mindmap"}.issubset(set(again["skipped"]))


def test_equip_notion_does_not_regenerate_existing_pending_content(client_db) -> None:
    """Une pièce déjà créée (brouillon `pending` de Papa) n'est PAS régénérée — juste validée."""
    client, Session = client_db
    with Session() as db:
        lesson, _ = _seed_validated_lesson_for_skill(db)
        # Papa a déjà créé une fiche (encore `pending`).
        db.add(m.Fiche(lesson_id=lesson.id, validation_status="pending", source="manual"))
        db.commit()
        sid = db.scalar(select(m.Skill)).id
    _as_parent()
    body = client.post("/api/reports/class-council/equip-notion", json={"skill_id": sid}).json()
    # La fiche existante est SAUTÉE (pas régénérée), pas dans `generated`.
    assert "fiche" in body["skipped"]
    assert "fiche" not in body["generated"]
    with Session() as db:
        fiches = list(db.scalars(select(m.Fiche)))
        assert len(fiches) == 1  # aucune fiche en double
        assert fiches[0].validation_status == "validated"  # le brouillon a été validé, pas recréé


def test_list_and_get_report(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _seed_mastery(db)
    _as_parent()
    rid = client.post("/api/reports/class-council", json={"period": "T1"}).json()["id"]
    listed = client.get("/api/reports/class-council").json()
    assert any(item["id"] == rid and item["period"] == "T1" for item in listed)
    detail = client.get(f"/api/reports/class-council/{rid}").json()
    assert detail["id"] == rid and detail["period"] == "T1"


# --- Pont d'actionnabilité CROISÉ (ADR-0022 §8) : reco champion → mission champion -------------


def test_create_champion_from_reco(client_db) -> None:
    """`create-champion` compose UNE mission `champion` multi-matières à partir de notions
    (déjà équipées côté page). Papa-only, validated par construction, étapes taggées `skill_id`."""
    client, Session = client_db
    with Session() as db:
        subj_a = db.scalar(select(m.Subject))  # Mathématiques (seedé)
        skill_a = db.scalar(select(m.Skill))
        subj_b = m.Subject(name="Français", slug="francais")
        db.add(subj_b)
        db.flush()
        skill_b = m.Skill(subject_id=subj_b.id, name="Temps du récit", level="4e")
        db.add(skill_b)
        db.commit()
        ids = [skill_a.id, skill_b.id]
    _as_parent()
    res = client.post(
        "/api/reports/class-council/create-champion",
        json={"skill_ids": ids, "flavor": "consolidation"},
    )
    assert res.status_code == 200
    mission = res.json()
    assert mission["mission_type"] == "champion"
    assert mission["subject_id"] is None and mission["skill_id"] is None
    assert mission["validation_status"] == "validated"
    assert {s["skill_id"] for s in mission["steps"]} == set(ids)


def test_create_champion_requires_two_subjects(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        subj_a = db.scalar(select(m.Subject))
        s1 = db.scalar(select(m.Skill))
        s2 = m.Skill(subject_id=subj_a.id, name="Autre notion maths", level="4e")
        db.add(s2)
        db.commit()
        ids = [s1.id, s2.id]
    _as_parent()
    res = client.post(
        "/api/reports/class-council/create-champion",
        json={"skill_ids": ids, "flavor": "consolidation"},
    )
    assert res.status_code == 422  # 1 seule matière → pas une croisée
