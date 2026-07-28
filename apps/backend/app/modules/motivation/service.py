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

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    LearningEvent,
    Mission,
    MissionStep,
    Skill,
    StudentProfile,
    StudentWeeklyGoal,
)
from app.modules.activity.events import (
    EVENT_ELI5_REQUESTED,
    EVENT_ELI5_REVERSE,
    EVENT_MISSION_COMPLETED,
    EVENT_MISSION_STEP_VIEW,
    EVENT_REVIEW_ATTEMPTED,
)
from app.modules.activity.timeutils import (
    day_bounds_utc,
    local_day,
    range_bounds_utc,
    today_local,
    week_start,
)
from app.modules.memory.service import get_reviews_summary
from app.modules.progress import service as progress_service
from app.modules.motivation.messages import (
    Message,
    WelcomeContext,
    WrapUpContext,
    choose_welcome,
    choose_wrap_up,
)

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


# ==============================================================================================
# Accueil et clôture : ZETIS se souvient
# ==============================================================================================

# Événements qui témoignent d'un TRAVAIL sur une notion. `login` et `page_viewed` en sont exclus :
# ils cochent la journée (présence) mais ne disent pas sur quoi Massimo a travaillé.
_NOTION_WORK_EVENTS = (
    EVENT_ELI5_REVERSE,
    EVENT_ELI5_REQUESTED,
    EVENT_REVIEW_ATTEMPTED,
    EVENT_MISSION_COMPLETED,
    EVENT_MISSION_STEP_VIEW,
)

# Au-delà, on ne « reprend » plus le fil : ressortir une notion vue il y a des mois serait
# désorientant plutôt qu'accueillant.
_LAST_NOTION_WINDOW_DAYS = 30


def _last_notion(db: Session, *, student_id: int, today: date) -> str | None:
    """Dernière notion travaillée, dans une fenêtre récente. `None` si la dernière séance s'est
    passée entièrement en quiz (ces événements ne portent pas de `skill_id`)."""
    start, _ = day_bounds_utc(today - timedelta(days=_LAST_NOTION_WINDOW_DAYS))
    row = db.execute(
        select(Skill.name)
        .join(LearningEvent, LearningEvent.skill_id == Skill.id)
        .where(
            LearningEvent.student_id == student_id,
            LearningEvent.event_type.in_(_NOTION_WORK_EVENTS),
            LearningEvent.created_at >= start,
        )
        .order_by(LearningEvent.created_at.desc(), LearningEvent.id.desc())
        .limit(1)
    ).first()
    return row[0] if row is not None else None


def _days_since_last_visit(db: Session, *, student_id: int, today: date) -> int | None:
    """Jours écoulés depuis la dernière venue, `None` si Massimo n'est jamais venu.

    **Le piège** : la connexion est journalisée AVANT que l'accueil ne soit demandé. Mesurer
    « depuis le dernier événement » rendrait donc toujours 0 et le message de retour ne se
    déclencherait jamais. On ne regarde que les événements STRICTEMENT antérieurs à aujourd'hui.
    """
    start_of_today, _ = day_bounds_utc(today)
    moment = db.scalar(
        select(LearningEvent.created_at)
        .where(
            LearningEvent.student_id == student_id,
            LearningEvent.created_at < start_of_today,
        )
        .order_by(LearningEvent.created_at.desc())
        .limit(1)
    )
    return (today - local_day(moment)).days if moment is not None else None


def _has_history(db: Session, *, student_id: int) -> bool:
    return (
        db.scalar(
            select(LearningEvent.id).where(LearningEvent.student_id == student_id).limit(1)
        )
        is not None
    )


def _active_mission(db: Session, *, student_id: int) -> tuple[int, str | None]:
    """(étapes restantes, notion) de la mission en cours — (0, None) s'il n'y en a pas."""
    mission = db.scalar(
        select(Mission)
        .where(
            Mission.student_id == student_id,
            Mission.status == "active",
            Mission.validation_status == "validated",
        )
        .order_by(Mission.priority.desc(), Mission.id.desc())
        .limit(1)
    )
    if mission is None:
        return 0, None
    left = int(
        db.scalar(
            select(func.count())
            .select_from(MissionStep)
            .where(MissionStep.mission_id == mission.id, MissionStep.status != "done")
        )
        or 0
    )
    skill = db.get(Skill, mission.skill_id) if mission.skill_id is not None else None
    return left, (skill.name if skill is not None else None)


def _reviews_due(db: Session, *, student_id: int) -> int:
    """Cartes dues aujourd'hui — réutilise le compteur du module `memory`, seule autorité sur
    ce qui est « dû » (aucune définition parallèle)."""
    student = db.get(StudentProfile, student_id)
    if student is None:
        return 0
    return int(get_reviews_summary(db, student).get("total_due", 0))


def _first_name(db: Session, *, student_id: int) -> str:
    student = db.get(StudentProfile, student_id)
    return student.first_name if student is not None else ""


def _message_out(message: Message) -> dict:
    """Sérialise un message. Le `cta` est absent (et non vide) quand il n'y en a pas — le client
    n'a alors aucun bouton à masquer."""
    return {
        "code": message.code,
        "title": message.title,
        "subtitle": message.subtitle,
        "cta": (
            {"label": message.cta_label, "target": message.cta_target}
            if message.cta_label and message.cta_target
            else None
        ),
    }


def welcome(db: Session, *, student_id: int, today: date | None = None) -> dict:
    """Message d'accueil + le contexte qui a servi à le choisir.

    Le contexte est servi pour que l'UI choisisse une illustration et alimente d'autres blocs
    (cartes dues, régularité) — **jamais** pour recomposer une phrase."""
    today = today or today_local()
    monday = week_start(today)
    week = week_engagement(db, student_id=student_id, today=today)
    steps_left, mission_notion = _active_mission(db, student_id=student_id)
    reviews_due = _reviews_due(db, student_id=student_id)

    consolidated = progress_service.consolidated_this_week(
        db, student_id=student_id, monday=monday
    )
    closed = progress_service.gaps_closed_this_week(db, student_id=student_id, monday=monday)
    goal_days = week["goal_days"]

    ctx = WelcomeContext(
        first_name=_first_name(db, student_id=student_id),
        has_history=_has_history(db, student_id=student_id),
        days_since_last_visit=_days_since_last_visit(db, student_id=student_id, today=today),
        last_notion=_last_notion(db, student_id=student_id, today=today),
        consolidated_this_week=consolidated,
        gaps_closed_this_week=closed,
        reviews_due=reviews_due,
        goal_days=goal_days,
        days_done=week["days_done"],
        goal_met=week["goal_met"],
        # « Franchi AUJOURD'HUI » : l'objectif est atteint et c'est la venue du jour qui l'a
        # fait basculer. Sans cette nuance, on féliciterait tous les jours suivants à l'identique.
        goal_met_today=bool(
            week["goal_met"] and week["today_done"] and goal_days == week["days_done"]
        ),
        mission_steps_left=steps_left,
        mission_notion=mission_notion,
    )

    return {
        **_message_out(choose_welcome(ctx)),
        "context": {
            "first_name": ctx.first_name,
            "last_notion": ctx.last_notion,
            "days_since_last_visit": ctx.days_since_last_visit,
            "consolidated_this_week": ctx.consolidated_this_week,
            "gaps_closed_this_week": ctx.gaps_closed_this_week,
            "reviews_due": ctx.reviews_due,
            "regularity": week,
        },
    }


def wrap_up(db: Session, *, student_id: int, today: date | None = None) -> dict:
    """Mot de fin de séance : ce qui a été gagné, et le prochain pas."""
    today = today or today_local()
    week = week_engagement(db, student_id=student_id, today=today)
    steps_left, mission_notion = _active_mission(db, student_id=student_id)

    ctx = WrapUpContext(
        first_name=_first_name(db, student_id=student_id),
        mission_steps_left=steps_left,
        mission_notion=mission_notion,
        reviews_due=_reviews_due(db, student_id=student_id),
        goal_met_today=bool(
            week["goal_met"] and week["today_done"] and week["goal_days"] == week["days_done"]
        ),
        today_done=week["today_done"],
    )
    return _message_out(choose_wrap_up(ctx))
