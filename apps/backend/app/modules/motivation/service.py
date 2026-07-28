"""Régularité douce et engagement hebdomadaire — les leviers d'auto-motivation de Massimo.

Ce module REMPLACE la mécanique de streak (`gamification._compute_streak`), qui tombait à zéro
dès un jour entier manqué. Un capital qu'on peut perdre pousse à venir par peur de perdre ; ce
n'est pas de l'auto-motivation, et c'est la définition même de la pression quotidienne anxiogène
que CLAUDE.md proscrit.

**Ce qui le remplace** : un COMPTE de jours dans la semaine courante. Il ne peut pas casser — un
jour manqué ne retire rien, et le lundi la grille repart de zéro cases cochées, ce qui est un
départ et non une chute. Il n'existe volontairement aucune notion de « jours consécutifs », de
« meilleure série » ni de « record » : les fournir reviendrait à rebâtir le streak sous un autre
nom.

**Source = `learning_events`, jamais `xp_events`.** Trois raisons : le journal d'activité
bucketise déjà en Europe/Paris (le streak comptait en UTC — deux définitions du « jour » dans la
même app) ; un jour où Massimo lit un cours sans gagner d'XP reste un jour où il est venu ; et
« ne punit jamais » veut dire compter la PRÉSENCE, pas la performance. La connexion compte donc
elle aussi : « j'étais là et ça n'a pas compté » est exactement l'effet à éviter.

**Aucune donnée punitive n'est produite.** Le payload ne contient ni `missed`, ni `failed`, ni
`remaining`. Ce n'est pas une omission d'affichage : le backend ne fournit pas la matière première
d'une punition, donc aucun frontend présent ou futur ne pourra en inventer une.
"""

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import LearningEvent, StudentWeeklyGoal
from app.modules.activity.timeutils import local_day, range_bounds_utc, today_local, week_start

# Bornes de l'engagement. 0 n'est pas un engagement (« je ne viens pas » n'a pas à être déclaré) ;
# au-delà de 7 la semaine n'existe plus.
MIN_TARGET_DAYS = 1
MAX_TARGET_DAYS = 7


def _active_days(db: Session, *, student_id: int, monday: date) -> set[date]:
    """Jours Europe/Paris de la semaine portant au moins un événement d'activité."""
    start, end = range_bounds_utc(monday, monday + timedelta(days=6))
    moments = db.scalars(
        select(LearningEvent.created_at).where(
            LearningEvent.student_id == student_id,
            LearningEvent.created_at >= start,
            LearningEvent.created_at < end,
        )
    ).all()
    return {local_day(moment) for moment in moments}


def get_goal(db: Session, *, student_id: int, monday: date) -> StudentWeeklyGoal | None:
    return db.scalar(
        select(StudentWeeklyGoal).where(
            StudentWeeklyGoal.student_id == student_id,
            StudentWeeklyGoal.week_start == monday,
        )
    )


def week_engagement(db: Session, *, student_id: int, today: date | None = None) -> dict:
    """La semaine de Massimo : 7 cases, son engagement s'il en a pris un, et où il en est.

    Les 7 jours sont TOUJOURS servis, y compris ceux à venir : le client n'a ni grille à
    reconstruire ni date à calculer, donc aucune occasion de se tromper de fuseau.

    `today` est injectable pour les tests (même patron que le `now` passé aux services
    d'évaluation) — les routes ne le passent jamais."""
    today = today or today_local()
    monday = week_start(today)
    active = _active_days(db, student_id=student_id, monday=monday)

    days = []
    for offset in range(7):
        day = monday + timedelta(days=offset)
        days.append(
            {"date": day.isoformat(), "active": day in active, "is_today": day == today}
        )

    days_done = sum(1 for day in days if day["active"])
    goal = get_goal(db, student_id=student_id, monday=monday)
    goal_days = goal.target_days if goal is not None else None

    return {
        "week_start": monday.isoformat(),
        "days": days,
        "days_done": days_done,
        "today_done": today in active,
        "goal_days": goal_days,
        # `False` quand aucun objectif n'est pris : il n'y a rien à atteindre, pas un échec.
        "goal_met": goal_days is not None and days_done >= goal_days,
    }


def set_week_goal(
    db: Session, *, student_id: int, target_days: int, today: date | None = None
) -> dict:
    """Pose (ou révise) l'engagement de la semaine COURANTE.

    La semaine est déduite serveur et jamais reçue du client : impossible de modifier
    rétroactivement un engagement passé, impossible aussi de se voir opposer une semaine ancienne.

    Réviser à la baisse est autorisé et ne laisse aucune trace servie — un engagement qu'on ne
    peut pas ajuster est un piège. Effet de bord vertueux : baisser peut faire basculer `goal_met`
    à vrai, ce que le calcul rend naturellement sans code dédié."""
    today = today or today_local()
    monday = week_start(today)

    goal = get_goal(db, student_id=student_id, monday=monday)
    if goal is None:
        goal = StudentWeeklyGoal(
            student_id=student_id, week_start=monday, target_days=target_days
        )
        db.add(goal)
    else:
        goal.target_days = target_days
    db.commit()

    return week_engagement(db, student_id=student_id, today=today)
