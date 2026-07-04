"""Suggestions ELI5 « d'après tes leçons en cours ».

Couvre : notions des leçons validées de l'année active, dans l'ordre du curriculum ;
dédup d'une notion partagée par deux leçons ; priorité aux non-maîtrisées (la maîtrisée
passe en fin, hors du top-N) ; exclusion des leçons non validées ; endpoint child ;
vide propre sans programme.
"""

from sqlalchemy import select

import app.db.models as m
from app.modules.curriculum.service import create_manual_lesson, lesson_suggestions


def _seed(Session) -> dict:
    with Session() as db:
        profile = db.scalars(select(m.StudentProfile)).first()
        subject = db.scalars(select(m.Subject)).first()
        year = m.SchoolYear(student_id=profile.id, label="2026-2027", level="4e", status="active")
        db.add(year)
        db.flush()
        sys_row = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject.id)
        db.add(sys_row)
        db.flush()
        ch0 = m.Chapter(
            school_year_subject_id=sys_row.id, name="Ch0", sort_order=0,
            source="generated", validation_status="validated", program_version="2020",
        )
        ch1 = m.Chapter(
            school_year_subject_id=sys_row.id, name="Ch1", sort_order=1,
            source="generated", validation_status="validated", program_version="2020",
        )
        db.add_all([ch0, ch1])
        db.flush()

        s_nr = db.scalars(select(m.Skill)).first()  # « Nombres relatifs » (conftest)
        s_a = m.Skill(subject_id=subject.id, name="Addition de relatifs", level="4e")
        s_b = m.Skill(subject_id=subject.id, name="Multiplication de relatifs", level="4e")
        s_c = m.Skill(subject_id=subject.id, name="Notion maîtrisée", level="4e")
        s_d = m.Skill(subject_id=subject.id, name="Notion brouillon", level="4e")
        db.add_all([s_a, s_b, s_c, s_d])
        db.flush()

        # Leçons validées : L0 (ch0) → [nr, a] ; L1 (ch0) → [a (dup), b] ; L2 (ch1) → [c].
        l0 = create_manual_lesson(db, ch0.id, title="Leçon A")
        l1 = create_manual_lesson(db, ch0.id, title="Leçon B")
        l2 = create_manual_lesson(db, ch1.id, title="Leçon C")
        ldraft = create_manual_lesson(db, ch0.id, title="Brouillon")
        ldraft.status = "draft"  # non validée → ses notions sont ignorées
        db.add_all(
            [
                m.LessonSkill(lesson_id=l0.id, skill_id=s_nr.id),
                m.LessonSkill(lesson_id=l0.id, skill_id=s_a.id),
                m.LessonSkill(lesson_id=l1.id, skill_id=s_a.id),  # dup s_a
                m.LessonSkill(lesson_id=l1.id, skill_id=s_b.id),
                m.LessonSkill(lesson_id=l2.id, skill_id=s_c.id),
                m.LessonSkill(lesson_id=ldraft.id, skill_id=s_d.id),  # brouillon → exclu
            ]
        )
        db.add(m.SkillMastery(student_id=profile.id, skill_id=s_c.id, status="mastered"))
        db.commit()
        return {"nr": s_nr.id, "a": s_a.id, "b": s_b.id, "c": s_c.id, "d": s_d.id}


def test_suggestions_order_dedup_and_mastery(client_db) -> None:
    _, Session = client_db
    ids = _seed(Session)
    with Session() as db:
        out = lesson_suggestions(db, limit=3)
    # Ordre curriculum + dédup s_a + non-maîtrisées d'abord (s_c maîtrisée hors top-3).
    assert [s["skill_id"] for s in out] == [ids["nr"], ids["a"], ids["b"]]
    assert ids["c"] not in [s["skill_id"] for s in out]  # maîtrisée reléguée
    assert ids["d"] not in [s["skill_id"] for s in out]  # sur brouillon → exclue
    # Titre de leçon porté (1ʳᵉ occurrence).
    by_id = {s["skill_id"]: s for s in out}
    assert by_id[ids["nr"]]["lesson_title"] == "Leçon A"
    assert by_id[ids["b"]]["lesson_title"] == "Leçon B"


def test_endpoint_returns_suggestions_for_child(client_db) -> None:
    client, Session = client_db  # rôle child (conftest)
    _seed(Session)
    resp = client.get("/api/student/lesson-suggestions")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) >= 1
    assert set(body[0]) == {"skill_id", "name", "lesson_id", "lesson_title"}


def test_empty_when_no_program(client_db) -> None:
    client, _ = client_db  # aucune année/leçon seedée
    resp = client.get("/api/student/lesson-suggestions")
    assert resp.status_code == 200
    assert resp.json() == []
