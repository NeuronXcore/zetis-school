"""Scoring pondéré par contexte (ADR-0014 Décision 6).

Le résultat d'un quiz alimente `skill_mastery` avec un poids qui dépend du contexte de la
tentative. Cette fonction concentre la règle « la maîtrise ne doit jamais reposer sur un seul
quiz » (DATA_MODEL) : un quiz de fin de cours est un **signal faible** (l'effet de récence
gonfle le score) — il ajuste la confiance mais **n'ouvre jamais de lacune** à lui seul.

Testable : les seuls effets de bord sont des upserts `SkillMastery` sur la session fournie
(aucune ouverture de `Gap`, aucun commit — laissé à l'appelant), et le dict d'effets renvoyé
est déterministe. Le diagnostic (signal fort + ouverture de gaps) reste servi par le module
`diagnostics`, inchangé (étape 14) : ce module ne le rejoue pas.
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import SkillMastery
from app.modules.progress.mastery import set_mastery_status

# Poids « signal faible » d'un quiz de fin de cours / post-capsule : la nouvelle mesure ne
# déplace la maîtrise que partiellement (récence surévalue le score juste après le cours).
WEAK_SIGNAL_WEIGHT = 0.4


def _status_from_score(score: float) -> str:
    """Mêmes paliers que le diagnostic — dupliqués volontairement pour ne PAS importer
    `diagnostics` (modules évaluatifs indépendants ; le patron n'est pas modifié)."""
    if score >= 90:
        return "mastered"
    if score >= 70:
        return "solid"
    if score >= 40:
        return "learning"
    return "weak"


def _apply_weak_signal(
    db: Session, *, student_id: int, per_skill_scores: dict[int, int], now: datetime
) -> list[dict]:
    updated: list[dict] = []
    for skill_id, score in per_skill_scores.items():
        mastery = db.scalar(
            select(SkillMastery).where(
                SkillMastery.student_id == student_id, SkillMastery.skill_id == skill_id
            )
        )
        if mastery is None:
            mastery = SkillMastery(student_id=student_id, skill_id=skill_id)
            db.add(mastery)
        w = WEAK_SIGNAL_WEIGHT
        mastery.confidence_score = round((mastery.confidence_score or 0) * (1 - w) + score * w)
        mastery.mastery_score = round((mastery.mastery_score or 0) * (1 - w) + score * w)
        mastery.last_seen_at = now
        # Passe par le helper : ce site s'exécute à CHAQUE quiz de fin de cours, et un
        # re-tamponnage de `mastered_at` ferait recompter éternellement les mêmes notions
        # dans « consolidées cette semaine ».
        set_mastery_status(mastery, _status_from_score(mastery.mastery_score), now)
        updated.append(
            {
                "skill_id": skill_id,
                "score": score,
                "mastery_after": mastery.mastery_score,
                "confidence_after": mastery.confidence_score,
                "status": mastery.status,
            }
        )
    return updated


def apply_quiz_result(
    db: Session,
    *,
    student_id: int,
    per_skill_scores: dict[int, int],
    context: str,
    now: datetime,
) -> dict:
    """Applique le résultat d'un quiz à la maîtrise selon `context`.

    - ``mission`` / ``capsule_post_test`` : signal faible → ajuste la confiance, **jamais** de
      `Gap` (invariant testé).
    - ``revision`` : no-op tracé — le rating de `SpacedReviewCard` sera branché en Phase 7.
    - ``diagnostic`` : non branché ici (servi par le module `diagnostics`, signal fort + gaps).
    """
    if context in ("mission", "capsule_post_test"):
        updated = _apply_weak_signal(
            db, student_id=student_id, per_skill_scores=per_skill_scores, now=now
        )
        # Invariant ADR-0014 : un quiz de fin de cours n'ouvre JAMAIS de lacune — la liste
        # est vide par construction (aucune écriture `Gap` dans cette branche).
        return {"context": context, "updated_masteries": updated, "opened_gaps": []}

    if context == "revision":
        # Stub explicite (Phase 7) : le score deviendra un rating de carte SRS. Pas d'effet ici.
        return {"context": context, "updated_masteries": [], "opened_gaps": [], "deferred": True}

    # diagnostic ou contexte inconnu : servi ailleurs, aucun effet ici.
    return {"context": context, "updated_masteries": [], "opened_gaps": [], "handled_elsewhere": True}
