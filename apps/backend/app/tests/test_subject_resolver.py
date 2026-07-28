"""Test-verrou du résolveur « leçon → matière » (`subjects/resolver.py`).

Ce résolveur est devenu le point unique par lequel passent trois consommateurs (fiches,
mindmaps, journal d'activité) : ce qui était trois bugs indépendants serait maintenant un bug
partagé. D'où un test sur la logique elle-même, et non sur chacun de ses appelants.

Ce fichier n'importe VOLONTAIREMENT aucun de ces trois modules : c'est la preuve mécanique que
le résolveur est neutre (modèles seuls) et non de la logique de fiche déguisée.

Les DEUX branches de rattachement d'un chapitre sont couvertes — c'est le seul point où les
jumeaux pouvaient diverger : un chapitre passé du programme d'année (`school_year_subject_id`)
au thème (`theme_id`) doit rendre la même matière.
"""

from sqlalchemy import select

import app.db.models as m
from app.modules.subjects.resolver import subject_id_for_lesson, subject_of_lesson


def _subject(db, *, name: str = "SVT", slug: str = "svt") -> m.Subject:
    subject = m.Subject(name=name, slug=slug)
    db.add(subject)
    db.flush()
    return subject


def _lesson_under(db, chapter_id: int) -> m.Lesson:
    lesson = m.Lesson(chapter_id=chapter_id, title="Leçon test", status="validated", created_by="ai")
    db.add(lesson)
    db.flush()
    return lesson


def _chapter(db, **kwargs) -> m.Chapter:
    chapter = m.Chapter(name="Chapitre test", **kwargs)
    db.add(chapter)
    db.flush()
    return chapter


def test_branche_matiere_d_annee(client_db) -> None:
    # Chapitre rattaché au programme d'année : chapter → school_year_subject → subject.
    _, Session = client_db
    with Session() as db:
        subject = _subject(db)
        student_id = db.scalar(select(m.StudentProfile.id))  # seedé par conftest
        year = m.SchoolYear(student_id=student_id, label="2026-2027", level="4e")
        db.add(year)
        db.flush()
        sys_row = m.SchoolYearSubject(school_year_id=year.id, subject_id=subject.id)
        db.add(sys_row)
        db.flush()
        lesson = _lesson_under(db, _chapter(db, school_year_subject_id=sys_row.id).id)
        db.commit()

        assert subject_id_for_lesson(db, lesson.id) == subject.id
        assert subject_of_lesson(db, lesson).slug == "svt"


def test_branche_theme(client_db) -> None:
    # Chapitre rattaché directement à un thème : chapter → theme → subject.
    _, Session = client_db
    with Session() as db:
        subject = _subject(db, name="Histoire", slug="histoire")
        theme = m.Theme(subject_id=subject.id, name="Thème test")
        db.add(theme)
        db.flush()
        lesson = _lesson_under(db, _chapter(db, theme_id=theme.id).id)
        db.commit()

        assert subject_id_for_lesson(db, lesson.id) == subject.id
        assert subject_of_lesson(db, lesson).slug == "histoire"


def test_chapitre_orphelin_ne_leve_pas(client_db) -> None:
    # Chapitre sans aucun rattachement : dégradation en None, jamais d'exception — le journal
    # d'activité écrit alors un événement sans `subject_id` plutôt que d'échouer.
    _, Session = client_db
    with Session() as db:
        lesson = _lesson_under(db, _chapter(db).id)
        db.commit()

        assert subject_id_for_lesson(db, lesson.id) is None
        assert subject_of_lesson(db, lesson) is None


def test_absences_rendent_none(client_db) -> None:
    # Leçon inexistante, id nul, leçon nulle : les trois formes d'absence que les appelants
    # rencontrent en sérialisant une ligne dont la leçon a disparu.
    _, Session = client_db
    with Session() as db:
        assert subject_id_for_lesson(db, 9999) is None
        assert subject_id_for_lesson(db, None) is None
        assert subject_of_lesson(db, None) is None
