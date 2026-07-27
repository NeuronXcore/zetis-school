"""Substrat de contexte canonique partagé par TOUS les dérivés (ADR-0011).

Un dérivé (ELI5, quiz, mindmap, fiches, SRS…) NE réimplémente PAS sa résolution de
contexte : il appelle `resolve_canonical_context` puis insère `build_canonical_sections`
dans son propre prompt. Contexte commun, tâche propre à chacun (ADR-0011 §2).

Module NEUTRE : il ne connaît aucun dérivé et n'en importe aucun — ce sont eux qui
l'importent. Aucun code ELI5 ici (invariant du chantier). Le module est testé SANS
importer `eli5/` : preuve mécanique que le substrat est partagé (test-verrou ADR-0011).

Le gate `status='validated'` vit DANS la requête (§1) : un dérivé ne PEUT pas recevoir un
cours non validé — la donnée n'existe pas dans ce qu'il reçoit. Read-only : le résolveur
ne valide rien, ne trace rien, aucun effet de bord.

Note d'implémentation (écart assumé vs le croquis §C de l'ADR) : `retrieve_for_skill` du
module `rag` exige un `embedder` et une `query` (il vectorise la requête) et renvoie
`list[str]`. Le résolveur les propage donc — le contrat conceptuel de l'ADR est inchangé,
seuls les paramètres réels du RAG transitent.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Lesson, LessonSkill
from app.modules.ai.provider import EmbeddingProvider
from app.modules.rag.service import retrieve_for_skill


@dataclass(frozen=True)
class CanonicalContext:
    """Contexte résolu pour une notion : le cours validé (source canonique) + complément RAG."""

    lesson: Lesson | None  # cours validé, source canonique (None si aucune leçon validée)
    chunks: list[str]  # complément RAG (BO, sources Papa) — peut être vide

    @property
    def has_course(self) -> bool:
        return self.lesson is not None


def resolve_canonical_context(
    db: Session,
    embedder: EmbeddingProvider,
    *,
    skill_id: int,
    query: str = "",
    k_with_course: int = 3,
    k_without: int = 5,
) -> CanonicalContext:
    """Résout le contexte canonique d'une notion (cours validé d'abord, RAG en complément).

    Cascade de dégradation : cours validé → RAG seul → connaissance du modèle. Le premier
    cran est ajouté ici, une fois pour tous les dérivés. Le gate `status='validated'` est
    une clause du SELECT (addendum ADR-0009 §C, verbatim) : impossible de recevoir un cours
    non validé. `k` réduit quand un cours existe (le RAG n'est plus que complément).

    Read-only : aucune écriture, aucune trace, aucun effet de bord.
    """
    lesson = db.scalars(
        select(Lesson)
        .join(LessonSkill, LessonSkill.lesson_id == Lesson.id)
        .where(
            LessonSkill.skill_id == skill_id,
            Lesson.status == "validated",  # ← le gate, appliqué DANS la requête
            Lesson.content_markdown.isnot(None),
        )
        .order_by(Lesson.updated_at.desc())
        .limit(1)
    ).first()
    chunks = retrieve_for_skill(
        db,
        embedder,
        skill_id=skill_id,
        query=query,
        k=k_with_course if lesson is not None else k_without,
    )
    return CanonicalContext(lesson=lesson, chunks=chunks)


def build_canonical_sections(ctx: CanonicalContext) -> str:
    """Compose le BLOC de contexte (pas le prompt entier) à insérer dans un prompt dérivé.

    Deux sections + une règle d'autorité. La ligne « le cours fait foi » est la garantie de
    cohérence inter-dérivés : même cours → mêmes notations/vocabulaire partout (ADR-0011 §2).
    """
    parts: list[str] = []
    if ctx.lesson is not None:
        parts.append(f"## COURS VALIDÉ (source canonique)\n{ctx.lesson.content_markdown}")
    if ctx.chunks:
        parts.append("## EXTRAITS COMPLÉMENTAIRES\n" + "\n\n".join(ctx.chunks))
    parts.append(
        "Règle : appuie-toi d'abord sur le COURS VALIDÉ. Si tes connaissances ou les "
        "extraits le contredisent, le cours fait foi (vocabulaire, notations, méthode)."
    )
    return "\n\n".join(parts)
