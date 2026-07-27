"""Service d'évidence — substrat neutre, déterministe, read-only (ADR-0017 lot 2, patron ADR-0011).

Un substrat, plusieurs consommateurs (le sélecteur de missions d'abord ; le Conseil de classe IA
ensuite — narration LLM locale posée sur la MÊME évidence). Ces fonctions **calculent** l'évidence
pédagogique à partir des tables existantes ; elles n'écrivent rien, ne tracent rien, ne décident
rien.

Module NEUTRE : il n'importe **aucun** consommateur (`missions/`, conseil de classe…) — ce sont eux
qui l'importent. Il consomme en revanche le **poids de scoring ADR-0014** (`WEAK_SIGNAL_WEIGHT`),
jamais réécrit ici. Un test-verrou vérifie qu'aucun symbole de `missions` n'est importé.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    Gap,
    LearningEvent,
    Quiz,
    QuizAttempt,
    QuizQuestion,
    Skill,
    SkillMastery,
    SpacedReviewCard,
)
from app.modules.quizzes.scoring import WEAK_SIGNAL_WEIGHT

VERDICT_EVENT = "mission_verdict"
_WEAK_CONTEXTS = ("mission", "capsule_post_test")


def mastery_by_skill(db: Session, *, student_id: int) -> dict[int, dict]:
    """Maîtrise courante par notion : {skill_id: {mastery, confidence, status, last_seen_at}}."""
    rows = db.scalars(
        select(SkillMastery).where(SkillMastery.student_id == student_id)
    )
    return {
        row.skill_id: {
            "mastery": row.mastery_score or 0.0,
            "confidence": row.confidence_score or 0.0,
            "status": row.status,
            "last_seen_at": row.last_seen_at,
        }
        for row in rows
    }


def open_gaps(db: Session, *, student_id: int) -> list[dict]:
    """Lacunes ouvertes/en cours, ordre stable (id) : {id, skill_id, subject_id, severity, status}."""
    rows = db.scalars(
        select(Gap)
        .where(Gap.student_id == student_id, Gap.status.in_(("open", "in_progress")))
        .order_by(Gap.id)
    )
    return [
        {
            "id": g.id,
            "skill_id": g.skill_id,
            "subject_id": g.subject_id,
            "severity": g.severity,
            "status": g.status,
        }
        for g in rows
    ]


def recent_verdicts(db: Session, *, student_id: int, limit: int = 20) -> list[dict]:
    """Derniers verdicts d'acquisition (trace `LearningEvent` `mission_verdict`), récents d'abord.

    Retourne le payload brut : {mission_id, verdict, reverse_score, quiz_score, xp, effect, ...}."""
    rows = db.scalars(
        select(LearningEvent)
        .where(
            LearningEvent.student_id == student_id,
            LearningEvent.event_type == VERDICT_EVENT,
        )
        .order_by(LearningEvent.created_at.desc())
        .limit(limit)
    )
    out: list[dict] = []
    for ev in rows:
        payload = dict(ev.payload_json or {})
        payload.setdefault("skill_id", ev.skill_id)
        payload.setdefault("subject_id", ev.subject_id)
        payload["at"] = ev.created_at
        out.append(payload)
    return out


def weighted_quiz_signal(db: Session, *, student_id: int) -> dict[int, float]:
    """Signal quiz pondéré par notion (poids ADR-0014, consommé — jamais réécrit).

    Repli exact de `apply_quiz_result` en LECTURE : pour chaque notion, on plie les scores des
    tentatives `mission`/`capsule_post_test` terminées, de la plus ancienne à la plus récente,
    `signal = signal*(1-w) + score*w`. C'est le même « signal faible » que celui qui alimente
    `skill_mastery`, recalculé sans effet de bord."""
    rows = db.execute(
        select(QuizQuestion.skill_id, QuizAttempt.score_percent, QuizAttempt.completed_at)
        .join(QuizAttempt, QuizAttempt.quiz_id == QuizQuestion.quiz_id)
        .where(
            QuizAttempt.student_id == student_id,
            QuizAttempt.context.in_(_WEAK_CONTEXTS),
            QuizAttempt.completed_at.is_not(None),
            QuizAttempt.score_percent.is_not(None),
            QuizQuestion.skill_id.is_not(None),
        )
        .order_by(QuizAttempt.completed_at)
    ).all()
    signal: dict[int, float] = {}
    for skill_id, score, _completed in rows:
        prev = signal.get(skill_id, float(score))
        signal[skill_id] = prev * (1 - WEAK_SIGNAL_WEIGHT) + float(score) * WEAK_SIGNAL_WEIGHT
    return {k: round(v, 1) for k, v in signal.items()}


def srs_pressure(db: Session, *, student_id: int) -> dict[int, dict]:
    """Pression des révisions dues par matière : {subject_id: {due, max_overdue_days}}.

    « Due » = `due_at <= maintenant`. `max_overdue_days` = retard le plus ancien (0 si à l'heure)."""
    now = datetime.now(timezone.utc)
    rows = db.execute(
        select(Skill.subject_id, SpacedReviewCard.due_at)
        .join(Skill, Skill.id == SpacedReviewCard.skill_id)
        .where(
            SpacedReviewCard.student_id == student_id,
            SpacedReviewCard.due_at.is_not(None),
            SpacedReviewCard.due_at <= now,
        )
    ).all()
    out: dict[int, dict] = {}
    for subject_id, due_at in rows:
        entry = out.setdefault(subject_id, {"due": 0, "max_overdue_days": 0})
        entry["due"] += 1
        # SQLite perd la tzinfo (DateTime(timezone=True)) : on suppose UTC pour comparer.
        due_aware = due_at if due_at.tzinfo is not None else due_at.replace(tzinfo=timezone.utc)
        overdue_days = max(0, (now - due_aware).days)
        entry["max_overdue_days"] = max(entry["max_overdue_days"], overdue_days)
    return out
