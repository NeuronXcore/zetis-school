"""Service d'évidence — substrat neutre, déterministe, read-only (ADR-0017 lot 2, patron ADR-0011).

Un substrat, plusieurs consommateurs (le sélecteur de missions d'abord ; le Conseil de classe IA
ensuite — narration LLM locale posée sur la MÊME évidence). Ces fonctions **calculent** l'évidence
pédagogique à partir des tables existantes ; elles n'écrivent rien, ne tracent rien, ne décident
rien.

Module NEUTRE : il n'importe **aucun** consommateur (`missions/`, conseil de classe…) — ce sont eux
qui l'importent. Il consomme en revanche le **poids de scoring ADR-0014** (`WEAK_SIGNAL_WEIGHT`),
jamais réécrit ici. Un test-verrou vérifie qu'aucun symbole de `missions` n'est importé.
"""

from datetime import date, datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    Gap,
    LearningEvent,
    Quiz,
    QuizAttempt,
    QuizQuestion,
    Skill,
    SkillMastery,
    SkillMasteryHistory,
    SpacedReviewCard,
)
from app.modules.activity.timeutils import local_day
from app.modules.progress.service import OPEN_GAP_STATUSES
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
        .where(Gap.student_id == student_id, Gap.status.in_(OPEN_GAP_STATUSES))
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


def history_since(db: Session, *, student_id: int) -> date | None:
    """Plus ancienne bascule connue de `skill_mastery_history` — `None` si la table est vide.

    **La borne de la trace**, et elle n'est PAS le `period` du Conseil (adr-0040 §9) : `period` ne
    sélectionne aucune donnée et reste une étiquette, celle-ci est une date réelle. Les fondre
    rendrait indétectable, demain, le défaut que le Lot 0 vient de corriger.

    ⚠️ Volontairement sur TOUS les statuts, et non sur les seuls fragiles : ce qu'on date ici est
    la mise en service de l'historique, pas la première régression. Se restreindre aux statuts
    fragiles rendrait une date plus RÉCENTE que la réalité.

    Vit ici plutôt que dans `dashboard` — où elle est née privée — parce qu'elle a désormais trois
    consommateurs (le dashboard, Progression, le Conseil au Lot 3). `dashboard` la délègue.
    """
    when = db.scalar(
        select(func.min(SkillMasteryHistory.changed_at)).where(
            SkillMasteryHistory.student_id == student_id
        )
    )
    return local_day(when) if when else None


def mastery_transitions(
    db: Session, *, student_id: int, since: datetime, subject_id: int | None = None
) -> list[dict]:
    """Bascules de palier depuis `since`, récentes d'abord — LA fonction de mesure (adr-0040 §10).

    Un substrat, deux consommateurs : Progression (les noms et les dates, à l'écran) et le Conseil
    (les mêmes, en prose ancrée, au Lot 3). Les calculer séparément refabriquerait la classe de bug
    que ce dépôt paie depuis trois chantiers — deux mesures divergentes sous un même mot.

    ⚠️ **`from_status` est calculé par FENÊTRAGE, pas lu** : `skill_mastery_history` ne stocke que
    le statut d'ARRIVÉE. Le palier de départ est celui de la ligne précédente de la même notion,
    `None` s'il n'y en a pas — la bascule est alors la première tracée pour elle, et prétendre
    connaître son origine serait une invention.

    Contrainte du module respectée : `evidence` ne reçoit que des données **probantes**. Des
    bascules horodatées écrites par `record_mastery_transition` en sont.
    """
    query = (
        select(
            SkillMasteryHistory.skill_id,
            SkillMasteryHistory.status,
            SkillMasteryHistory.changed_at,
            Skill.name,
            Skill.subject_id,
        )
        .join(Skill, Skill.id == SkillMasteryHistory.skill_id)
        .where(SkillMasteryHistory.student_id == student_id)
    )
    if subject_id is not None:
        query = query.where(Skill.subject_id == subject_id)
    # Tout l'historique de la notion est lu, pas seulement la fenêtre : sans la ligne qui PRÉCÈDE
    # `since`, la première bascule de la fenêtre n'aurait pas de palier de départ. Le filtrage
    # temporel se fait après, sur le résultat fenêtré.
    rows = db.execute(
        query.order_by(SkillMasteryHistory.skill_id, SkillMasteryHistory.changed_at, SkillMasteryHistory.id)
    ).all()

    previous: dict[int, str] = {}
    out: list[dict] = []
    for skill_id, status, changed_at, skill_name, subj_id in rows:
        from_status = previous.get(skill_id)
        previous[skill_id] = status
        moment = changed_at if changed_at.tzinfo is not None else changed_at.replace(tzinfo=timezone.utc)
        if moment < since:
            continue
        out.append(
            {
                "skill_id": skill_id,
                "skill_name": skill_name,
                "subject_id": subj_id,
                "from_status": from_status,
                "to_status": status,
                "changed_at": moment,
            }
        )
    # Récentes d'abord, départagées par `skill_id` : sans cette queue, deux bascules du même instant
    # changeraient de place d'un rendu à l'autre (même raison que `created_at DESC, id DESC`).
    out.sort(key=lambda t: (t["changed_at"], t["skill_id"]), reverse=True)
    return out


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
