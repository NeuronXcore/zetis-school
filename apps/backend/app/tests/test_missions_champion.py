"""Tests « Missions croisées champion » (ADR-0022) — invariants du défi multi-matières.

Couvre : preview exige ≥ 2 matières · la saveur ordonne la sélection cochée (boss vs
consolidation) · confirm compose UNE mission `champion` (subject/skill NULL, validated, étapes
taggées `skill_id` sur ≥ 2 matières) · confirm refuse < 2 matières · la champion est EXCLUE du
sélecteur quotidien (jamais élue) mais listée pour Massimo · verdict PAR NOTION à la complétion
(chaque notion voit sa mastery mise à jour) + XP majoré + badge Champion.

Notions seedées SANS leçon → l'équipement (ADR-0021) saute gracieusement (aucun appel LLM) et le
parcours se réduit à eli5 → vocal_explain par notion : suffisant pour prouver la mécanique croisée.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

import app.db.models as m
from app.core.config import settings
from app.modules.missions.champion import compose_champion_mission
from app.modules.missions.service import champion_xp


def _student(db):
    return db.scalar(select(m.StudentProfile))


def _two_subjects(db):
    """(student, subj_a, subj_b, skill_a, skill_b) : 2 matières, 1 notion travaillée chacune."""
    student = _student(db)
    subj_a = db.scalar(select(m.Subject))  # Mathématiques (seedé)
    skill_a = db.scalar(select(m.Skill))  # Nombres relatifs (subj_a)
    subj_b = m.Subject(name="Français", slug="francais")
    db.add(subj_b)
    db.flush()
    skill_b = m.Skill(subject_id=subj_b.id, name="Accord du participe", level="4e")
    db.add(skill_b)
    db.flush()
    db.add(m.SkillMastery(student_id=student.id, skill_id=skill_a.id, mastery_score=0.9, status="mastered"))
    db.add(m.SkillMastery(student_id=student.id, skill_id=skill_b.id, mastery_score=0.3, status="in_progress"))
    db.commit()
    return student, subj_a, subj_b, skill_a, skill_b


# --- Invariant : preview exige ≥ 2 matières (sinon ce n'est pas croisé) ----------------------


def test_preview_requires_two_subjects(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        subj_a = db.scalar(select(m.Subject))
    res = client.post(
        "/api/missions/champion/preview",
        json={"subject_ids": [subj_a.id], "flavor": "boss"},
    )
    assert res.status_code == 422


def test_preview_writes_nothing(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _, subj_a, subj_b, _, _ = _two_subjects(db)
        subject_ids = [subj_a.id, subj_b.id]
    res = client.post(
        "/api/missions/champion/preview",
        json={"subject_ids": subject_ids, "flavor": "consolidation"},
    )
    assert res.status_code == 200
    assert res.json()["flavor"] == "consolidation"
    with Session() as db:
        assert db.scalar(select(func.count()).select_from(m.Mission)) == 0


# --- Invariant : la saveur ordonne la sélection proposée cochée -----------------------------


def test_flavor_orders_checked_selection(client_db) -> None:
    """boss coche la notion la MIEUX maîtrisée d'une matière ; consolidation la plus fragile."""
    client, Session = client_db
    with Session() as db:
        student = _student(db)
        subj_a = db.scalar(select(m.Subject))
        # subj_a : 3 notions de maîtrise étagée (haut / moyen / bas).
        a_high = m.Skill(subject_id=subj_a.id, name="A_high", level="4e")
        a_mid = m.Skill(subject_id=subj_a.id, name="A_mid", level="4e")
        a_low = m.Skill(subject_id=subj_a.id, name="A_low", level="4e")
        subj_b = m.Subject(name="Français", slug="francais")
        db.add_all([a_high, a_mid, a_low, subj_b])
        db.flush()
        b = m.Skill(subject_id=subj_b.id, name="B", level="4e")
        db.add(b)
        db.flush()
        for sk, score, st in [
            (a_high, 0.9, "mastered"),
            (a_mid, 0.5, "in_progress"),
            (a_low, 0.1, "in_progress"),
            (b, 0.5, "in_progress"),
        ]:
            db.add(m.SkillMastery(student_id=student.id, skill_id=sk.id, mastery_score=score, status=st))
        db.commit()
        ids = {"high": a_high.id, "mid": a_mid.id, "low": a_low.id, "b": b.id, "sa": subj_a.id, "sb": subj_b.id}

    def checked(flavor):
        res = client.post(
            "/api/missions/champion/preview",
            json={"subject_ids": [ids["sa"], ids["sb"]], "flavor": flavor},
        )
        return {n["skill_id"] for n in res.json()["notions"] if n["checked"]}

    boss = checked("boss")
    conso = checked("consolidation")
    # boss : la mieux maîtrisée cochée, la plus fragile écartée (cap atteint avant).
    assert ids["high"] in boss and ids["low"] not in boss
    # consolidation : l'inverse.
    assert ids["low"] in conso and ids["high"] not in conso


# --- Invariant : confirm compose UNE mission champion croisée -------------------------------


def _confirm(client, skill_ids, flavor="mix"):
    return client.post(
        "/api/missions/champion/confirm", json={"skill_ids": skill_ids, "flavor": flavor}
    )


def test_confirm_composes_one_cross_subject_mission(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _, _, _, skill_a, skill_b = _two_subjects(db)
        ids = [skill_a.id, skill_b.id]
    res = _confirm(client, ids)
    assert res.status_code == 200
    body = res.json()
    mission = body["mission"]
    assert mission is not None
    # UNE seule mission, croisée : type champion, matière/notion NULL, validated par construction.
    assert mission["mission_type"] == "champion"
    assert mission["subject_id"] is None and mission["skill_id"] is None
    assert mission["validation_status"] == "validated"
    assert mission["created_by"] == "parent"
    # Les étapes portent LEUR notion (skill_id) et couvrent les 2 matières.
    step_skills = {s["skill_id"] for s in mission["steps"]}
    assert step_skills == set(ids)
    # Chaque notion a au moins ses étapes eli5 + vocal (rappel vide sans ressource).
    assert len(mission["steps"]) >= 4
    # Équipement remonté par notion (ADR-0021), sans leçon → has_lesson False.
    assert len(body["equipment"]) == 2
    assert all(e["has_lesson"] is False for e in body["equipment"])
    with Session() as db:
        assert db.scalar(select(func.count()).select_from(m.Mission)) == 1


# --- Invariant : compose-only (ADR-0022 §8, pont Conseil) compose SANS équiper ---------------


def test_compose_champion_without_equipment(client_db) -> None:
    """`compose_champion_mission` (utilisé par le pont Conseil) assemble la mission croisée à partir
    de notions déjà équipées : mêmes garanties que le confirm, sans appel aux générateurs."""
    _, Session = client_db
    with Session() as db:
        student, _, _, skill_a, skill_b = _two_subjects(db)
        mission = compose_champion_mission(
            db, student, skill_ids=[skill_a.id, skill_b.id], flavor="consolidation"
        )
        assert mission.mission_type == "champion"
        assert mission.subject_id is None and mission.skill_id is None
        assert mission.validation_status == "validated"
        step_skills = {
            s.skill_id
            for s in db.scalars(select(m.MissionStep).where(m.MissionStep.mission_id == mission.id))
        }
        assert step_skills == {skill_a.id, skill_b.id}


def test_compose_champion_refuses_single_subject(client_db) -> None:
    from fastapi import HTTPException

    _, Session = client_db
    with Session() as db:
        student = _student(db)
        subj_a = db.scalar(select(m.Subject))
        s1 = db.scalar(select(m.Skill))
        s2 = m.Skill(subject_id=subj_a.id, name="Autre notion", level="4e")
        db.add(s2)
        db.commit()
        ids = [s1.id, s2.id]
        try:
            compose_champion_mission(db, student, skill_ids=ids, flavor="consolidation")
            raised = False
        except HTTPException as exc:
            raised = exc.status_code == 422
    assert raised


def test_confirm_refuses_single_subject(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student = _student(db)
        subj_a = db.scalar(select(m.Subject))
        s1 = db.scalar(select(m.Skill))
        s2 = m.Skill(subject_id=subj_a.id, name="Autre notion maths", level="4e")
        db.add(s2)
        db.flush()
        db.add(m.SkillMastery(student_id=student.id, skill_id=s1.id, mastery_score=0.5, status="in_progress"))
        db.commit()
        ids = [s1.id, s2.id]
    res = _confirm(client, ids)
    assert res.status_code == 422  # 2 notions mais 1 seule matière → pas une croisée


# --- Invariant : la champion est EXCLUE du sélecteur quotidien -------------------------------


def test_champion_never_elected_but_listed(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        _, _, _, skill_a, skill_b = _two_subjects(db)
        ids = [skill_a.id, skill_b.id]
    assert _confirm(client, ids).status_code == 200
    # Jamais « mission du jour » (ADR-0017 §6, réaffirmé ADR-0022).
    today = client.get("/api/missions/today").json()
    assert today["elected"] is None
    election = client.get("/api/missions/election/today").json()
    assert election["elected"] is None
    # Mais listée pour Massimo (deck champion).
    listed = client.get("/api/missions").json()
    assert any(mm["mission_type"] == "champion" for mm in listed)


# --- Invariant : verdict PAR NOTION à la complétion + XP majoré + badge Champion -------------


def _reverse_event(db, student, skill_id, score, at):
    db.add(
        m.LearningEvent(
            student_id=student.id,
            skill_id=skill_id,
            event_type="reverse_eli5",
            payload_json={"score": score},
            created_at=at,
        )
    )


def test_verdict_applied_per_notion_with_boosted_xp_and_badge(client_db) -> None:
    client, Session = client_db
    with Session() as db:
        student, _, _, skill_a, skill_b = _two_subjects(db)
        ids = [skill_a.id, skill_b.id]
        sid_a, sid_b, student_id = skill_a.id, skill_b.id, student.id
    mission = _confirm(client, ids).json()["mission"]
    mid = mission["id"]
    client.post(f"/api/missions/{mid}/start")

    # Preuve de réexplication (reverse) POSTÉRIEURE au start, pour chaque notion.
    with Session() as db:
        student = _student(db)
        after = datetime.now(timezone.utc) + timedelta(seconds=1)
        _reverse_event(db, student, sid_a, 85, after)
        _reverse_event(db, student, sid_b, 90, after)
        db.commit()

    # Compléter toutes les étapes dans l'ordre (eli5 = consultation ; vocal = preuve reverse).
    steps = sorted(mission["steps"], key=lambda s: s["sort_order"])
    last = None
    for s in steps:
        last = client.post(f"/api/missions/{mid}/steps/{s['id']}/complete")
        assert last.status_code == 200
    payload = last.json()
    assert payload["mission_status"] == "completed"
    # XP majoré (ADR-0022) : base + bonus × nombre de notions.
    assert payload["xp_awarded"] == champion_xp(2)

    with Session() as db:
        # Verdict PAR NOTION : chaque notion de la mission a vu sa mastery mise à jour (last_seen).
        for sid in (sid_a, sid_b):
            sm = db.scalar(
                select(m.SkillMastery).where(
                    m.SkillMastery.student_id == student_id, m.SkillMastery.skill_id == sid
                )
            )
            assert sm is not None and sm.last_seen_at is not None
        # Un seul crédit XP champion (une trace, un montant majoré).
        xp = db.scalar(
            select(m.XPEvent).where(
                m.XPEvent.student_id == student_id, m.XPEvent.reason == "mission_champion"
            )
        )
        assert xp is not None and xp.amount == champion_xp(2)

    # Badge Champion décerné (dérivé de l'XPEvent champion).
    badges = {b["code"] for b in client.get("/api/gamification/summary").json()["badges"]}
    assert "champion" in badges
