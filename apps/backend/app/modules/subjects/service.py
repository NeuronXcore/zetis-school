"""Service Matières (Papa) : CRUD lecture/création sur Subject → Theme → Chapter.

Logique métier séparée des routes (CLAUDE.md). Aucune donnée pédagogique
n'est stockée côté front : tout passe par ces endpoints.
"""

import unicodedata
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models.school import Chapter, Subject, Theme
from app.modules.subjects.schemas import ChapterCreate, SubjectCreate, ThemeCreate


def _slugify(name: str) -> str:
    """nom lisible → slug ASCII (sans accents, tirets)."""
    normalized = unicodedata.normalize("NFKD", name)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii").lower()
    slug = "".join(c if c.isalnum() else "-" for c in ascii_only)
    slug = "-".join(part for part in slug.split("-") if part)
    return slug or "matiere"


def _unique_slug(db: Session, base: str) -> str:
    """Garantit l'unicité du slug (contrainte UNIQUE sur subjects.slug)."""
    slug = base
    counter = 2
    while db.scalar(select(Subject.id).where(Subject.slug == slug)) is not None:
        slug = f"{base}-{counter}"
        counter += 1
    return slug


def _subject_or_404(db: Session, subject_id: int) -> Subject:
    subject = db.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Matière {subject_id} introuvable."
        )
    return subject


def _theme_or_404(db: Session, theme_id: int) -> Theme:
    theme = db.get(Theme, theme_id)
    if theme is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Thème {theme_id} introuvable."
        )
    return theme


# --- Lecture ----------------------------------------------------------------


def list_subjects(db: Session) -> list[dict[str, Any]]:
    """Matières actives + compteurs thèmes/chapitres pour la grille Papa."""
    subjects = db.scalars(
        select(Subject).order_by(Subject.sort_order, Subject.id)
    ).all()

    theme_counts = dict(
        db.execute(select(Theme.subject_id, func.count(Theme.id)).group_by(Theme.subject_id)).all()
    )
    chapter_counts = dict(
        db.execute(
            select(Theme.subject_id, func.count(Chapter.id))
            .join(Chapter, Chapter.theme_id == Theme.id)
            .group_by(Theme.subject_id)
        ).all()
    )

    return [_subject_dict(s, theme_counts, chapter_counts) for s in subjects]


def get_subject_detail(db: Session, subject_id: int) -> dict[str, Any]:
    """Matière + ses thèmes, chacun avec ses chapitres triés."""
    subject = _subject_or_404(db, subject_id)
    themes = db.scalars(
        select(Theme).where(Theme.subject_id == subject_id).order_by(Theme.sort_order, Theme.id)
    ).all()

    theme_payloads = []
    theme_total = len(themes)
    chapter_total = 0
    for theme in themes:
        chapters = db.scalars(
            select(Chapter).where(Chapter.theme_id == theme.id).order_by(Chapter.sort_order, Chapter.id)
        ).all()
        chapter_total += len(chapters)
        theme_payloads.append(
            {
                "id": theme.id,
                "name": theme.name,
                "description": theme.description,
                "sort_order": theme.sort_order,
                "chapters": [_chapter_dict(c) for c in chapters],
            }
        )

    return {
        **_subject_dict(subject, {subject_id: theme_total}, {subject_id: chapter_total}),
        "themes": theme_payloads,
    }


# --- Création ---------------------------------------------------------------


def create_subject(db: Session, data: SubjectCreate) -> dict[str, Any]:
    next_order = db.scalar(select(func.coalesce(func.max(Subject.sort_order), -1))) + 1
    subject = Subject(
        name=data.name.strip(),
        slug=_unique_slug(db, _slugify(data.name)),
        color=data.color,
        icon=data.icon,
        sort_order=next_order,
        is_active=True,
    )
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return _subject_dict(subject, {}, {})


def create_theme(db: Session, subject_id: int, data: ThemeCreate) -> dict[str, Any]:
    _subject_or_404(db, subject_id)
    next_order = (
        db.scalar(
            select(func.coalesce(func.max(Theme.sort_order), -1)).where(
                Theme.subject_id == subject_id
            )
        )
        + 1
    )
    theme = Theme(
        subject_id=subject_id,
        name=data.name.strip(),
        description=data.description,
        sort_order=next_order,
        is_active=True,
    )
    db.add(theme)
    db.commit()
    db.refresh(theme)
    return {
        "id": theme.id,
        "name": theme.name,
        "description": theme.description,
        "sort_order": theme.sort_order,
        "chapters": [],
    }


def create_chapter(db: Session, theme_id: int, data: ChapterCreate) -> dict[str, Any]:
    _theme_or_404(db, theme_id)
    next_order = (
        db.scalar(
            select(func.coalesce(func.max(Chapter.sort_order), -1)).where(
                Chapter.theme_id == theme_id
            )
        )
        + 1
    )
    chapter = Chapter(
        theme_id=theme_id,
        name=data.name.strip(),
        description=data.description,
        period=data.period,
        sort_order=next_order,
        status="planned",
    )
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return _chapter_dict(chapter)


# --- Sérialisation ----------------------------------------------------------


def _subject_dict(
    subject: Subject,
    theme_counts: dict[int, int],
    chapter_counts: dict[int, int],
) -> dict[str, Any]:
    return {
        "id": subject.id,
        "name": subject.name,
        "slug": subject.slug,
        "color": subject.color,
        "icon": subject.icon,
        "sort_order": subject.sort_order,
        "is_active": subject.is_active,
        "theme_count": theme_counts.get(subject.id, 0),
        "chapter_count": chapter_counts.get(subject.id, 0),
    }


def _chapter_dict(chapter: Chapter) -> dict[str, Any]:
    return {
        "id": chapter.id,
        "name": chapter.name,
        "description": chapter.description,
        "period": chapter.period,
        "status": chapter.status,
        "sort_order": chapter.sort_order,
    }
