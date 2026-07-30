"""Résolution d'un texte libre → `skill_id` par similarité d'embeddings (module PARTAGÉ).

ADR-0026 §6, constat read-before-code n°4 : cette résolution était un différé d'ELI5
(page-eli5.md §Reporté). Le chat en fait un **prérequis dur** — sans elle, aucun événement de
chat ne peut être ancré sur une notion et la mémoire est vide. Implémentée UNE fois, ici (pas
dans `chat/`), pour qu'ELI5 en hérite (patron ADR-0011 : module neutre, consommateurs multiples).

Contrat :

- **Best-effort absolu** : toute défaillance (embedder muet, aucune notion candidate, erreur
  réseau) renvoie une résolution VIDE — jamais une exception. Un tour de chat ne doit jamais
  échouer parce que l'ancrage a raté ; il perd seulement sa trace (`chat_topic` non émis) et son
  contexte ciblé (§6).
- **Seuil de confiance** (`CHAT_SKILL_RESOLUTION_MIN_SCORE`, versionné) : en-deçà, on n'ancre
  pas. Mieux vaut pas de trace qu'une mauvaise trace — une notion mal résolue pollue la mémoire.
- **On ne touche RIEN du routage embeddings** : même `EmbeddingProvider` (nomic-embed-text, 768d)
  que le RAG, appelé en direct. Aucun embedding de `Skill` n'est persisté (l'index pgvector est
  verrouillé sur `RagChunk`) : les notions candidates sont vectorisées à la volée, ce qui est
  trivial au volume d'un élève.
"""

from dataclasses import dataclass
from math import sqrt

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Chapter, Lesson, LessonSkill, SchoolYear, SchoolYearSubject, Skill
from app.modules.ai.provider import EmbeddingProvider


@dataclass(frozen=True)
class SkillResolution:
    """Résultat d'une résolution. `skill_id is None` ⇔ aucun ancrage retenu (best-effort)."""

    skill_id: int | None
    score: float
    skill: Skill | None = None

    @property
    def resolved(self) -> bool:
        return self.skill_id is not None


_EMPTY = SkillResolution(skill_id=None, score=0.0, skill=None)


def _cosine(a: list[float], b: list[float]) -> float:
    """Cosinus de deux vecteurs. 0.0 si l'un est nul ou de dimension incompatible."""
    n = min(len(a), len(b))
    if n == 0:
        return 0.0
    dot = sum(a[i] * b[i] for i in range(n))
    na = sqrt(sum(a[i] * a[i] for i in range(n)))
    nb = sqrt(sum(b[i] * b[i] for i in range(n)))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


def active_year_skills(db: Session, *, student_id: int) -> list[Skill]:
    """Notions du référentiel de l'ANNÉE ACTIVE de l'élève (§6 : « les Skill de l'année active »).

    Chaîne réelle du modèle : `SchoolYear(active)` → `SchoolYearSubject` → `Chapter` → `Lesson`
    → `LessonSkill` → `Skill`. **Repli assumé** : si l'année active n'a encore aucune notion
    rattachée (installation fraîche, référentiel non construit), on résout contre TOUTES les
    notions — mieux vaut un candidat imparfait que zéro mémoire au démarrage. Le repli est
    borné par le seuil de confiance, qui écarte de toute façon un mauvais ancrage."""
    # Même chaîne de VISIBILITÉ que `galaxy._visible_notions` / `notion_panel` (chapitre ET leçon
    # validés) : sans ces deux filtres, la résolution renvoie des notions que `notion_panel` juge
    # invisibles → l'ancrage 404 et ZETIS dit « pas dans ton programme » APRÈS avoir parlé du sujet
    # (incohérent). Résolution et ancrage doivent voir le même référentiel.
    subq = (
        select(LessonSkill.skill_id)
        .join(Lesson, Lesson.id == LessonSkill.lesson_id)
        .join(Chapter, Chapter.id == Lesson.chapter_id)
        .join(SchoolYearSubject, SchoolYearSubject.id == Chapter.school_year_subject_id)
        .join(SchoolYear, SchoolYear.id == SchoolYearSubject.school_year_id)
        .where(
            SchoolYear.student_id == student_id,
            SchoolYear.status == "active",
            Chapter.validation_status == "validated",
            Lesson.status == "validated",
        )
    )
    candidates = db.scalars(select(Skill).where(Skill.id.in_(subq))).all()
    if candidates:
        return list(candidates)
    return list(db.scalars(select(Skill)).all())


def resolve_skill(
    db: Session,
    embedder: EmbeddingProvider,
    *,
    student_id: int,
    text: str,
    min_score: float | None = None,
) -> SkillResolution:
    """Ancre un texte libre sur la notion la plus proche, ou renvoie une résolution vide.

    Best-effort : ne lève jamais. `min_score` par défaut = `CHAT_SKILL_RESOLUTION_MIN_SCORE`."""
    threshold = settings.chat_skill_resolution_min_score if min_score is None else min_score
    query = (text or "").strip()
    if not query:
        return _EMPTY

    try:
        candidates = active_year_skills(db, student_id=student_id)
        if not candidates:
            return _EMPTY
        # Un seul appel batch (déterministe, une aller-retour) : requête d'abord, puis notions.
        vectors = embedder.embed([query] + [s.name for s in candidates])
    except Exception:  # noqa: BLE001 — best-effort : aucune défaillance d'ancrage ne remonte.
        return _EMPTY

    if not vectors or len(vectors) != len(candidates) + 1:
        return _EMPTY
    query_vec, skill_vecs = vectors[0], vectors[1:]

    best_skill: Skill | None = None
    best_score = -1.0
    for skill, vec in zip(candidates, skill_vecs):
        score = _cosine(query_vec, vec)
        if score > best_score:
            best_score, best_skill = score, skill

    if best_skill is None or best_score < threshold:
        return SkillResolution(skill_id=None, score=max(best_score, 0.0), skill=None)
    return SkillResolution(skill_id=best_skill.id, score=best_score, skill=best_skill)
