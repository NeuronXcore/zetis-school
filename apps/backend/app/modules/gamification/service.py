"""Service gamification : crédit d'XP et synthèse (niveau, streak, badges).

Gamification au service de l'apprentissage (CLAUDE.md) : XP, niveaux et badges
pédagogiques, streak raisonnable — pas de mécanique addictive ni de classement social.
Le crédit d'XP passe par `award_xp`, appelé aux moments clés (mission, verbalisation,
diagnostic)."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import StudentProfile, XPEvent

XP_PER_LEVEL = 100

# Récompenses par action (le crédit mission vit dans le module missions : +20).
XP_ELI5_REVERSE = 10
XP_DIAGNOSTIC = 15
# Quiz de fin de cours (ADR-0014) : base d'effort + bonus proportionnel au score.
XP_QUIZ_BASE = 10  # forfait « terminé » — l'effort est récompensé, jamais 0 (CLAUDE.md)
XP_QUIZ_MAX = 30  # atteint sur un score parfait (100 %)
# Reconstruction de mindmap (ADR-0016) : même barème d'effort + performance que le quiz.
XP_MINDMAP_BASE = 10
XP_MINDMAP_MAX = 30


def quiz_xp(score_percent: int) -> int:
    """XP d'un quiz terminé : base d'effort + bonus selon le score. 0 % → 10, 100 % → 30.

    Récompense l'engagement ET la performance sans jamais punir (aucun 0 après un quiz joué
    jusqu'au bout). Fonction pure, testée."""
    clamped = max(0, min(100, score_percent))
    bonus = round((XP_QUIZ_MAX - XP_QUIZ_BASE) * clamped / 100)
    return XP_QUIZ_BASE + bonus


XP_MINDMAP_FAIL_PENALTY = 5  # XP retirés par tentative ratée pendant une séance de reconstruction


def mindmap_xp(score_percent: int) -> int:
    """XP d'une reconstruction de mindmap : base d'effort + bonus selon le score. 0 % → 10, 100 % → 30.

    Même esprit que `quiz_xp` (jamais 0 après une tentative jouée). Fonction pure, testée."""
    clamped = max(0, min(100, score_percent))
    bonus = round((XP_MINDMAP_MAX - XP_MINDMAP_BASE) * clamped / 100)
    return XP_MINDMAP_BASE + bonus


def mindmap_reconstruction_xp(score_percent: int, failed_attempts: int = 0) -> int:
    """XP d'une reconstruction RÉUSSIE, réduit par le nombre d'échecs de la séance.

    L'effort reste récompensé (plancher = base) : chaque tentative ratée retire un forfait, mais on
    ne descend jamais sous `XP_MINDMAP_BASE`. Déterministe (mêmes score + échecs → même XP)."""
    base = mindmap_xp(score_percent)
    return max(XP_MINDMAP_BASE, base - XP_MINDMAP_FAIL_PENALTY * max(0, failed_attempts))


def award_xp(
    db: Session, *, student_id: int, subject_id: int | None, amount: int, reason: str
) -> None:
    """Ajoute un événement XP à la session (le commit est laissé à l'appelant)."""
    db.add(
        XPEvent(
            student_id=student_id,
            subject_id=subject_id,
            amount=amount,
            reason=reason,
            created_at=datetime.now(timezone.utc),
        )
    )


def _level_from_xp(total_xp: int) -> tuple[int, int]:
    """(niveau, xp acquis dans le niveau). Niveau 1 = 0–99 XP, etc."""
    level = total_xp // XP_PER_LEVEL + 1
    into = total_xp % XP_PER_LEVEL
    return level, into


def _compute_streak(dates: set, today) -> tuple[int, bool]:
    """Jours consécutifs d'activité jusqu'à aujourd'hui (tolérance d'un jour).

    `active_today` = activité enregistrée aujourd'hui. Le streak est ancré sur
    aujourd'hui si actif, sinon sur hier (on ne casse pas le streak en cours de journée)."""
    active_today = today in dates
    anchor = today if active_today else today - timedelta(days=1)
    if anchor not in dates:
        return 0, active_today
    streak = 0
    day = anchor
    while day in dates:
        streak += 1
        day = day - timedelta(days=1)
    return streak, active_today


def _badges(
    *, total_xp: int, streak: int, mission_count: int, diag_done: bool, eli5_count: int
) -> list[dict]:
    earned: list[dict] = []

    def add(code: str, label: str, icon: str) -> None:
        earned.append({"code": code, "label": label, "icon": icon})

    if mission_count >= 1:
        add("first_mission", "Première mission", "🎯")
    if mission_count >= 5:
        add("persevering", "Persévérant", "🏅")
    if eli5_count >= 1:
        add("explainer", "Petit prof", "🗣️")
    if diag_done:
        add("diagnostic", "Diagnostic passé", "🧭")
    if total_xp >= 100:
        add("xp_100", "100 XP", "⭐")
    if total_xp >= 500:
        add("xp_500", "500 XP", "🌟")
    if streak >= 3:
        add("streak_3", "Régulier 3 jours", "🔥")
    return earned


def summary(db: Session, student: StudentProfile) -> dict:
    events = list(
        db.scalars(
            select(XPEvent)
            .where(XPEvent.student_id == student.id)
            .order_by(XPEvent.created_at.desc(), XPEvent.id.desc())
        )
    )
    total_xp = sum(e.amount for e in events)
    level, into = _level_from_xp(total_xp)

    dates = {e.created_at.date() for e in events if e.created_at is not None}
    today = datetime.now(timezone.utc).date()
    streak, active_today = _compute_streak(dates, today)

    mission_count = sum(1 for e in events if e.reason == "mission_remediation")
    eli5_count = sum(1 for e in events if e.reason == "eli5_reverse")
    diag_done = any(e.reason == "diagnostic" for e in events)

    return {
        "total_xp": total_xp,
        "level": level,
        "xp_into_level": into,
        "xp_for_next": XP_PER_LEVEL,
        "streak_days": streak,
        "active_today": active_today,
        "badges": _badges(
            total_xp=total_xp,
            streak=streak,
            mission_count=mission_count,
            diag_done=diag_done,
            eli5_count=eli5_count,
        ),
        "recent": [
            {
                "amount": e.amount,
                "reason": e.reason,
                "created_at": e.created_at.isoformat() if e.created_at is not None else None,
            }
            for e in events[:5]
        ],
    }
