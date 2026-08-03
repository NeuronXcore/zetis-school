"""Test-verrou du substrat canonique (ADR-0011).

Ce fichier n'importe VOLONTAIREMENT jamais `app.modules.eli5` : c'est la preuve mécanique
que `resolve_canonical_context` est un substrat partagé et non de l'ELI5 déguisé. Le jour
où le quiz consommera le substrat, ce module et ses tests restent verts sans qu'on y touche.
"""

from datetime import datetime, timezone

from sqlalchemy import select

import app.db.models as m
from app.modules.ai.canonical_context import (
    CanonicalContext,
    build_canonical_sections,
    resolve_canonical_context,
)
from app.tests.fakes import FakeEmbeddingProvider

_SKILL_ID = 1  # « Nombres relatifs », seedé par conftest


def _chapitre(db, *, annee_active: bool = True) -> m.Chapter:
    """Un chapitre validé, rattaché à une année scolaire. Créé une fois par année demandée.

    ⚠️ **La fixture posait `chapter_id=1` sur un chapitre INEXISTANT** — « SQLite n'applique pas les
    FK ». Elle tenait tant que le résolveur ignorait l'année scolaire ; depuis l'ADR-0037, le
    périmètre est réel et la jointure ne trouvait plus rien. **Aucune assertion n'a changé** : c'est
    le décor qui devient vrai, pas l'attente qui s'assouplit.
    """
    statut = "active" if annee_active else "archived"
    annee = db.scalars(select(m.SchoolYear).where(m.SchoolYear.status == statut)).first()
    if annee is None:
        annee = m.SchoolYear(
            student_id=db.scalar(select(m.StudentProfile.id)),
            label="2026-2027" if annee_active else "2025-2026",
            level="4e",
            status=statut,
        )
        db.add(annee)
        db.flush()
    sys_row = m.SchoolYearSubject(
        school_year_id=annee.id, subject_id=db.scalar(select(m.Subject.id))
    )
    db.add(sys_row)
    db.flush()
    chapter = m.Chapter(
        school_year_subject_id=sys_row.id, name="Chapitre", validation_status="validated"
    )
    db.add(chapter)
    db.flush()
    return chapter


def _add_lesson(
    db,
    *,
    status: str,
    skill_id: int = _SKILL_ID,
    content: str | None = "# Cours\n\nContenu canonique.",
    title: str = "Leçon test",
    updated_at: datetime | None = None,
    annee_active: bool = True,
) -> m.Lesson:
    """Insère une leçon liée à une notion, dans un chapitre validé d'une année scolaire réelle."""
    lesson = m.Lesson(
        chapter_id=_chapitre(db, annee_active=annee_active).id,
        title=title,
        content_markdown=content,
        status=status,
        created_by="ai",
    )
    if updated_at is not None:
        lesson.updated_at = updated_at
    db.add(lesson)
    db.flush()
    db.add(m.LessonSkill(lesson_id=lesson.id, skill_id=skill_id))
    db.commit()
    return lesson


def test_validated_lesson_is_resolved(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        _add_lesson(db, status="validated", content="# Relatifs\n\nUn nombre signé.")
        ctx = resolve_canonical_context(db, FakeEmbeddingProvider(), skill_id=_SKILL_ID)
        assert ctx.has_course is True
        assert ctx.lesson is not None
        assert "nombre signé" in (ctx.lesson.content_markdown or "")


def test_gate_excludes_draft_and_archived(client_db) -> None:
    # Le gate `status='validated'` : une leçon non validée n'existe pas dans ce que le dérivé
    # reçoit. ⚠️ Il a quitté le SELECT le 2026-08-03 (ADR-0037) — le résolveur partagé rend les
    # brouillons, dont la production a besoin au palier 3. La garantie tient autrement : le filtre
    # est appliqué sur le chemin UNIQUE par lequel tous les dérivés passent. Ce test est ce qui
    # rend ce déplacement sûr, et c'est pourquoi son assertion n'a pas bougé d'un caractère.
    _, Session = client_db
    with Session() as db:
        _add_lesson(db, status="draft")
        _add_lesson(db, status="archived")
        ctx = resolve_canonical_context(db, FakeEmbeddingProvider(), skill_id=_SKILL_ID)
        assert ctx.lesson is None
        assert ctx.has_course is False


def test_no_lesson_falls_back_gracefully(client_db) -> None:
    # Dégradation gracieuse : sans cours ET sans RAG indexé → lesson None, chunks vides.
    _, Session = client_db
    with Session() as db:
        ctx = resolve_canonical_context(db, FakeEmbeddingProvider(), skill_id=_SKILL_ID)
        assert ctx.lesson is None
        assert ctx.chunks == []


def test_most_recent_validated_wins(client_db) -> None:
    _, Session = client_db
    with Session() as db:
        _add_lesson(
            db,
            status="validated",
            title="Ancienne",
            content="# Ancienne",
            updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        _add_lesson(
            db,
            status="validated",
            title="Récente",
            content="# Récente",
            updated_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
        )
        ctx = resolve_canonical_context(db, FakeEmbeddingProvider(), skill_id=_SKILL_ID)
        assert ctx.lesson is not None
        assert ctx.lesson.title == "Récente"


def test_k_and_chunks_propagate(client_db, monkeypatch) -> None:
    # `k` réduit quand un cours existe (RAG = complément), plus large sinon ; chunks propagés.
    seen: dict[str, int] = {}

    def fake_retrieve(db, embedder, *, skill_id, query, k):
        seen["k"] = k
        return ["passage 1", "passage 2"]

    monkeypatch.setattr(
        "app.modules.ai.canonical_context.retrieve_for_skill", fake_retrieve
    )
    _, Session = client_db
    with Session() as db:
        no_course_skill = m.Skill(subject_id=1, name="Notion sans cours", level="4e")
        db.add(no_course_skill)
        db.commit()

        _add_lesson(db, status="validated")
        ctx = resolve_canonical_context(db, FakeEmbeddingProvider(), skill_id=_SKILL_ID)
        assert seen["k"] == 3  # k_with_course
        assert ctx.chunks == ["passage 1", "passage 2"]

        resolve_canonical_context(db, FakeEmbeddingProvider(), skill_id=no_course_skill.id)
        assert seen["k"] == 5  # k_without


def test_build_sections_two_when_course_and_chunks() -> None:
    ctx = CanonicalContext(
        lesson=m.Lesson(chapter_id=1, title="T", content_markdown="Le cours.", created_by="ai"),
        chunks=["extrait A", "extrait B"],
    )
    block = build_canonical_sections(ctx)
    assert "## COURS VALIDÉ (source canonique)" in block
    assert "Le cours." in block
    assert "## EXTRAITS COMPLÉMENTAIRES" in block
    assert "le cours fait foi" in block


def test_build_sections_single_when_no_course() -> None:
    block = build_canonical_sections(CanonicalContext(lesson=None, chunks=[]))
    assert "## COURS VALIDÉ" not in block
    assert "## EXTRAITS COMPLÉMENTAIRES" not in block
    assert "le cours fait foi" in block  # la règle d'autorité reste
