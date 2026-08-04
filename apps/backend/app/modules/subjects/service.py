"""Service Matières (Papa) : CRUD lecture/création sur Subject → Theme → Chapter.

Logique métier séparée des routes (CLAUDE.md). Aucune donnée pédagogique
n'est stockée côté front : tout passe par ces endpoints.
"""

import unicodedata
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models.school import Chapter, SchoolYearSubject, Subject, Theme
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

    # Tous les chapitres des thèmes en une seule requête (pas de N+1), puis regroupés en mémoire.
    theme_ids = [theme.id for theme in themes]
    chapters_by_theme: dict[int, list[Chapter]] = {tid: [] for tid in theme_ids}
    if theme_ids:
        chapters = db.scalars(
            select(Chapter)
            .where(Chapter.theme_id.in_(theme_ids))
            .order_by(Chapter.sort_order, Chapter.id)
        ).all()
        for chapter in chapters:
            chapters_by_theme[chapter.theme_id].append(chapter)

    chapter_total = sum(len(rows) for rows in chapters_by_theme.values())
    theme_payloads = [
        {
            "id": theme.id,
            "name": theme.name,
            "description": theme.description,
            "sort_order": theme.sort_order,
            "chapters": [_chapter_dict(c) for c in chapters_by_theme[theme.id]],
        }
        for theme in themes
    ]

    return {
        **_subject_dict(subject, {subject_id: len(themes)}, {subject_id: chapter_total}),
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


def _matiere_dannee_ou_422(db: Session, theme: Theme) -> SchoolYearSubject:
    """La matière d'année qui ANCRE un chapitre créé sous un thème.

    ## Pourquoi cette fonction existe (addendum ADR-0034, « le trou trouvé en chemin »)

    Un chapitre a **deux** rattachements possibles : `theme_id` (thème → matière) et
    `school_year_subject_id` (matière d'année → année + matière). Cette route ne posait que le
    premier. Or le résolveur canonique `lessons_by_skill` (ADR-0037) applique le périmètre « année
    active » **par une jointure sur `SchoolYearSubject`** : un chapitre sans matière d'année n'a
    aucun chemin vers une année, et devient invisible de **la production, de la galaxie et de
    `canonical_context`**.

    ⚠️ **Le défaut n'était pas dans la donnée, il était dans cette porte.** `create_manual_lesson`
    accepte n'importe quel `chapter_id` sans regarder son rattachement : un bouton fabriquait le
    chapitre, un autre y accrochait des leçons, et tout l'aval les ignorait **en silence** — aucune
    erreur, aucun test rouge, du contenu que personne n'atteint. C'est la famille de défaut que
    l'ADR-0037 appelle « le pire cas est silencieux ».

    ⚠️ **On ne révoque pas « un chapitre peut vivre sous un thème ».** Le thème garde la hiérarchie
    pédagogique ; la matière d'année ajoute l'ancrage temporel. Les deux colonnes coexistent — c'est
    le rattachement qui était **incomplet**, pas le modèle qui était faux.

    ⚠️ **On REFUSE plutôt que de créer un chapitre inerte**, et on dit quoi faire. Un 201 qui rend
    un objet que rien n'atteindra est le mensonge que ce correctif ferme.
    """
    from app.modules.lesson_resolution import active_year

    year = active_year(db)
    if year is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "Aucune année scolaire active : un chapitre créé maintenant ne serait rattaché à "
                "aucune année, et resterait invisible de la production comme de la galaxie. "
                "Activez une année scolaire d'abord."
            ),
        )
    sys_row = db.scalar(
        select(SchoolYearSubject).where(
            SchoolYearSubject.school_year_id == year.id,
            SchoolYearSubject.subject_id == theme.subject_id,
        )
    )
    if sys_row is None:
        subject = db.get(Subject, theme.subject_id)
        nom = subject.name if subject else f"#{theme.subject_id}"
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                f"« {nom} » n'est pas au programme de l'année {year.label} : un chapitre créé ici "
                "resterait invisible de la production comme de la galaxie. Ajoutez la matière à "
                "l'année scolaire d'abord."
            ),
        )
    return sys_row


def create_chapter(db: Session, theme_id: int, data: ChapterCreate) -> dict[str, Any]:
    theme = _theme_or_404(db, theme_id)
    # ⚠️ L'ancrage se résout AVANT toute écriture : un chapitre à moitié rattaché ne doit pas
    # exister, même une transaction.
    sys_row = _matiere_dannee_ou_422(db, theme)
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
        # Les DEUX rattachements : le thème dit la place pédagogique, la matière d'année dit à
        # quelle année ce chapitre appartient — et c'est celle-là que lit `lessons_by_skill`.
        school_year_subject_id=sys_row.id,
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
