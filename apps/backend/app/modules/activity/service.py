"""Projection de l'activité : jours, sessions, minutes actives, journal lisible.

Principe (event sourcing) : `learning_events` est la vérité brute, tout le reste est CALCULÉ à
la lecture. Aucune table `sessions`, aucun agrégat matérialisé — changer `SESSION_GAP_MINUTES`
recalcule tout l'historique sans migration. PostgreSQL agrège six mois d'événements d'un élève
unique en millisecondes : une table d'agrégats serait une optimisation prématurée (fausse bonne
idée explicitement écartée par la spec).

Le temps actif est une **heuristique de présence assumée**, pas une mesure d'attention : somme
des écarts entre événements consécutifs, chaque écart plafonné à `ACTIVE_GAP_CAP_MINUTES`.
L'UI l'explicite à Papa — un chiffre dont on ne dit pas comment il est fabriqué est un chiffre
qui ment.

Les fonctions de la première section sont PURES (aucun accès DB) et testées isolément.
"""

from collections import OrderedDict
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import LearningEvent, Skill, Subject, XPEvent
from app.modules.activity.events import (
    EVENT_ELI5_REQUESTED,
    EVENT_ELI5_REVERSE,
    EVENT_FICHE_VIEWED,
    EVENT_LESSON_VIEWED,
    EVENT_LOGIN,
    EVENT_MISSION_COMPLETED,
    EVENT_MISSION_STEP_VIEW,
    EVENT_PAGE_VIEWED,
    EVENT_QUIZ_ATTEMPTED,
    EVENT_REVIEW_ATTEMPTED,
)
from app.modules.activity.timeutils import (
    day_bounds_utc,
    local_day,
    local_time_label,
    range_bounds_utc,
    to_utc,
    today_local,
    week_start,
)

# ==============================================================================================
# 1. Projections pures
# ==============================================================================================


def _sorted(events: list) -> list:
    """Événements triés chronologiquement (l'ordre SQL n'est jamais présumé)."""
    return sorted(events, key=lambda e: (to_utc(e.created_at), e.id or 0))


def bucket_days(events: list, tz=None) -> "OrderedDict[date, list]":
    """Regroupe les événements par jour **Europe/Paris**, jours croissants.

    Le paramètre `tz` est accepté pour la signature spécifiée mais le fuseau vient de la config
    (source unique) : `local_day` l'applique."""
    buckets: OrderedDict[date, list] = OrderedDict()
    for event in _sorted(events):
        buckets.setdefault(local_day(event.created_at), []).append(event)
    return buckets


def build_sessions(events: list) -> list[list]:
    """Découpe une suite d'événements en sessions.

    Une session = événements consécutifs espacés de MOINS que `SESSION_GAP_MINUTES`. Un écart
    strictement supérieur au seuil ouvre une nouvelle session ; un écart ÉGAL au seuil reste
    dans la même (14 min → une session, 15 min → une session, 16 min → deux)."""
    gap = timedelta(minutes=settings.session_gap_minutes)
    sessions: list[list] = []
    current: list = []
    previous: datetime | None = None
    for event in _sorted(events):
        moment = to_utc(event.created_at)
        if previous is not None and moment - previous > gap:
            sessions.append(current)
            current = []
        current.append(event)
        previous = moment
    if current:
        sessions.append(current)
    return sessions


def event_minutes(events: list) -> list[int]:
    """Minutes attribuées à CHAQUE événement : l'écart jusqu'au suivant, plafonné.

    Le dernier événement d'une suite vaut 0 (on ne sait pas ce qui s'est passé après). La somme
    de cette liste est exactement `active_minutes` de la même suite — le client n'a donc jamais
    à recalculer quoi que ce soit."""
    ordered = _sorted(events)
    cap = settings.active_gap_cap_minutes
    minutes: list[int] = []
    for index, event in enumerate(ordered):
        if index + 1 >= len(ordered):
            minutes.append(0)
            continue
        delta = to_utc(ordered[index + 1].created_at) - to_utc(event.created_at)
        minutes.append(min(cap, max(0, int(delta.total_seconds() // 60))))
    return minutes


def active_minutes(events: list) -> int:
    """Temps actif d'une suite d'événements : somme des écarts plafonnés."""
    return sum(event_minutes(events))


def group_reviews(entries: list[dict]) -> list[dict]:
    """Fusionne les `review_attempted` CONSÉCUTIFS en une ligne « Révision SRS · n cartes ».

    Une séance de révision produit une rafale d'événements (une carte = un événement) : servie
    telle quelle, elle noierait le reste du journal. L'agrégation se fait CÔTÉ SERVEUR pour que
    le client se contente d'afficher. XP et minutes sont sommés ; l'heure est celle de la
    première carte."""
    grouped: list[dict] = []
    for entry in entries:
        previous = grouped[-1] if grouped else None
        if (
            entry["event_type"] == EVENT_REVIEW_ATTEMPTED
            and previous is not None
            and previous["event_type"] == EVENT_REVIEW_ATTEMPTED
        ):
            count = previous.get("count", 1) + 1
            previous["count"] = count
            previous["xp"] += entry["xp"]
            previous["minutes"] += entry["minutes"]
            previous["label"] = f"Révision SRS · {count} cartes"
            continue
        grouped.append(dict(entry))
    return grouped


# ==============================================================================================
# 2. Libellés du journal
# ==============================================================================================

# Vocabulaire bienveillant (CLAUDE.md §pédagogie) : on décrit une ACTION, jamais un jugement.
_LABELS = {
    EVENT_LOGIN: "Connexion",
    EVENT_PAGE_VIEWED: "Navigation",
    EVENT_LESSON_VIEWED: "Cours lu",
    EVENT_FICHE_VIEWED: "Fiche de révision",
    EVENT_QUIZ_ATTEMPTED: "Quiz",
    EVENT_ELI5_REQUESTED: "Explication ELI5",
    EVENT_ELI5_REVERSE: "Verbalisation ELI5",
    EVENT_REVIEW_ATTEMPTED: "Révision SRS",
    EVENT_MISSION_COMPLETED: "Mission terminée",
    EVENT_MISSION_STEP_VIEW: "Étape de mission",
}


def label_for(event_type: str) -> str:
    """Libellé lisible d'un événement. Un type inconnu ne casse jamais l'affichage.

    Le journal accueillera d'autres producteurs que ceux de ce chantier : le repli rend le type
    brut présentable plutôt que de masquer l'événement."""
    known = _LABELS.get(event_type)
    if known is not None:
        return known
    return event_type.replace("_", " ").capitalize()


def _detail_for(event_type: str, payload: dict | None) -> str | None:
    """Complément court affiché sous le libellé (jamais un jugement de valeur)."""
    data = payload or {}
    if event_type == EVENT_LESSON_VIEWED:
        title = data.get("lesson_title")
        return str(title) if title else None
    if event_type == EVENT_PAGE_VIEWED:
        route = data.get("route")
        return str(route) if route else None
    if event_type == EVENT_QUIZ_ATTEMPTED:
        score = data.get("score_percent")
        return f"{score} %" if score is not None else None
    if event_type == EVENT_MISSION_COMPLETED:
        # Verdict d'acquisition (ADR-0017 §5bis) formulé sans humilier l'enfant.
        return "notion acquise" if data.get("verdict") == "acquired" else "notion à renforcer"
    return None


# ==============================================================================================
# 3. Lectures (accès DB)
# ==============================================================================================


def _load_events(
    db: Session,
    *,
    student_id: int,
    start: datetime,
    end: datetime,
    subject_id: int | None = None,
) -> list[LearningEvent]:
    """Événements de la fenêtre [start, end[, filtrés matière si demandé."""
    query = select(LearningEvent).where(
        LearningEvent.student_id == student_id,
        LearningEvent.created_at >= start,
        LearningEvent.created_at < end,
    )
    if subject_id is not None:
        query = query.where(LearningEvent.subject_id == subject_id)
    return list(db.scalars(query.order_by(LearningEvent.created_at, LearningEvent.id)).all())


def _xp_by_day(
    db: Session,
    *,
    student_id: int,
    start: datetime,
    end: datetime,
    subject_id: int | None = None,
) -> dict[date, int]:
    """XP par jour Europe/Paris, sommé depuis `xp_events`.

    Métrique SÉPARÉE du journal d'activité : jamais d'UNION avec `learning_events` (les deux
    tables comptent des choses différentes, les mélanger double-compterait). Le bucketing par
    jour se fait en Python pour rester en Europe/Paris sans dépendre du fuseau du serveur SQL."""
    query = select(XPEvent).where(
        XPEvent.student_id == student_id,
        XPEvent.created_at >= start,
        XPEvent.created_at < end,
    )
    if subject_id is not None:
        # Filtre matière actif : le XP non imputé à une matière (missions croisées « champion »)
        # sort du total, par cohérence avec la ligne affichée.
        query = query.where(XPEvent.subject_id == subject_id)
    totals: dict[date, int] = {}
    for event in db.scalars(query):
        day = local_day(event.created_at)
        totals[day] = totals.get(day, 0) + event.amount
    return totals


def _subject_slugs(db: Session) -> dict[int, str]:
    return {row.id: row.slug for row in db.scalars(select(Subject))}


def _skill_names(db: Session) -> dict[int, str]:
    return {row.id: row.name for row in db.scalars(select(Skill))}


def _entries(
    events: list[LearningEvent], *, slugs: dict[int, str], skills: dict[int, str]
) -> list[dict]:
    """Journal lisible d'une suite d'événements (minutes incluses, révisions non encore groupées).

    Le `xp` d'une ligne est lu dans le payload de l'événement : les hooks qui accompagnent un
    crédit d'XP l'y recopient. On ne rapproche JAMAIS `learning_events` de `xp_events` par
    horodatage — le journal reste auto-suffisant, les deux tables ne se croisent pas."""
    minutes = event_minutes(events)
    ordered = _sorted(events)
    entries: list[dict] = []
    for index, event in enumerate(ordered):
        payload = event.payload_json or {}
        entries.append(
            {
                "time": local_time_label(event.created_at),
                "event_type": event.event_type,
                "label": label_for(event.event_type),
                "subject_slug": slugs.get(event.subject_id) if event.subject_id else None,
                "skill_name": skills.get(event.skill_id) if event.skill_id else None,
                "xp": int(payload.get("xp") or 0),
                "minutes": minutes[index],
                "detail": _detail_for(event.event_type, payload),
            }
        )
    return entries


def _trailing_inactive_days(db: Session, *, student_id: int, last_day: date) -> int:
    """Jours consécutifs SANS aucun événement, en fin de série (toutes matières confondues).

    Toujours calculé sans filtre matière : « Massimo n'a rien fait depuis 5 jours » est une
    information sur l'enfant, pas sur une matière — un filtre actif ne doit pas la fausser."""
    last = db.scalars(
        select(LearningEvent)
        .where(LearningEvent.student_id == student_id)
        .order_by(LearningEvent.created_at.desc(), LearningEvent.id.desc())
        .limit(1)
    ).first()
    if last is None:
        return 0
    delta = (last_day - local_day(last.created_at)).days
    return max(0, delta)


def heatmap(
    db: Session, *, student_id: int, weeks: int, subject_id: int | None = None
) -> dict:
    """Minutes actives par jour sur N semaines + décrochage.

    Les jours vides sont OMIS du payload : le client reconstruit la grille (présentation)."""
    bounded = max(1, min(settings.activity_max_weeks, weeks))
    last_day = today_local()
    # Semaines pleines lundi→dimanche : on remonte au lundi de la semaine la plus ancienne.
    first_day = week_start(last_day) - timedelta(weeks=bounded - 1)
    start, end = range_bounds_utc(first_day, last_day)

    events = _load_events(
        db, student_id=student_id, start=start, end=end, subject_id=subject_id
    )
    xp_by_day = _xp_by_day(
        db, student_id=student_id, start=start, end=end, subject_id=subject_id
    )

    days = []
    buckets = bucket_days(events)
    for day in sorted(set(buckets) | set(xp_by_day)):
        day_events = buckets.get(day, [])
        days.append(
            {
                "date": day.isoformat(),
                "active_minutes": active_minutes(day_events),
                "events": len(day_events),
                "xp": xp_by_day.get(day, 0),
            }
        )
    return {
        "days": days,
        "days_inactive": _trailing_inactive_days(db, student_id=student_id, last_day=last_day),
    }


def day_detail(
    db: Session, *, student_id: int, day: date, subject_id: int | None = None
) -> dict:
    """Journal chronologique d'un jour, révisions agrégées, minutes par événement."""
    start, end = day_bounds_utc(day)
    events = _load_events(
        db, student_id=student_id, start=start, end=end, subject_id=subject_id
    )
    entries = _entries(events, slugs=_subject_slugs(db), skills=_skill_names(db))
    return {"date": day.isoformat(), "events": group_reviews(entries)}


def sessions_range(
    db: Session,
    *,
    student_id: int,
    date_from: date,
    date_to: date,
    subject_id: int | None = None,
) -> dict:
    """Sessions reconstruites sur une période, du jour le plus RÉCENT au plus ancien.

    Tous les jours de la fenêtre sont servis, y compris ceux sans session (`sessions: []`) :
    l'absence d'activité est une information, pas un trou à masquer."""
    start, end = range_bounds_utc(date_from, date_to)
    events = _load_events(
        db, student_id=student_id, start=start, end=end, subject_id=subject_id
    )
    slugs = _subject_slugs(db)
    skills = _skill_names(db)
    buckets = bucket_days(events)

    days = []
    cursor = date_to
    while cursor >= date_from:
        day_sessions = []
        for group in build_sessions(buckets.get(cursor, [])):
            entries = group_reviews(_entries(group, slugs=slugs, skills=skills))
            ordered = _sorted(group)
            day_sessions.append(
                {
                    "started_at": to_utc(ordered[0].created_at).isoformat(),
                    "ended_at": to_utc(ordered[-1].created_at).isoformat(),
                    # Bornes AUSSI pré-formatées en heure locale, comme le `time` de chaque
                    # événement : sans elles, une carte de session afficherait des bornes
                    # converties par le fuseau du NAVIGATEUR à côté d'heures calculées en
                    # Europe/Paris par le serveur — deux heures différentes pour le même
                    # instant dès que le poste n'est pas à l'heure française.
                    "started_time": local_time_label(ordered[0].created_at),
                    "ended_time": local_time_label(ordered[-1].created_at),
                    "active_minutes": active_minutes(group),
                    "events": entries,
                }
            )
        days.append({"date": cursor.isoformat(), "sessions": day_sessions})
        cursor -= timedelta(days=1)
    return {"days": days}


# ==============================================================================================
# 4. KPI hebdomadaires du dashboard
# ==============================================================================================


def _week_metrics(
    db: Session, *, student_id: int, monday: date
) -> dict[str, int]:
    """Métriques brutes d'une semaine lundi→dimanche (Europe/Paris)."""
    start, end = range_bounds_utc(monday, monday + timedelta(days=6))
    events = _load_events(db, student_id=student_id, start=start, end=end)
    xp_total = db.scalar(
        select(func.coalesce(func.sum(XPEvent.amount), 0)).where(
            XPEvent.student_id == student_id,
            XPEvent.created_at >= start,
            XPEvent.created_at < end,
        )
    )
    sessions = sum(len(build_sessions(day_events)) for day_events in bucket_days(events).values())
    return {
        "sessions": sessions,
        "active_minutes": sum(
            active_minutes(day_events) for day_events in bucket_days(events).values()
        ),
        "xp": int(xp_total or 0),
        "missions_completed": sum(
            1 for event in events if event.event_type == EVENT_MISSION_COMPLETED
        ),
    }


def dashboard_kpis(db: Session, *, student_id: int) -> dict:
    """Les 4 KPI de régularité en `{value, delta}` — semaine en cours vs précédente.

    Le delta est calculé SERVEUR (le client n'invente aucun chiffre). Semaine lundi→dimanche en
    Europe/Paris, conformément à la spec des deltas hebdomadaires."""
    monday = week_start(today_local())
    current = _week_metrics(db, student_id=student_id, monday=monday)
    previous = _week_metrics(db, student_id=student_id, monday=monday - timedelta(days=7))
    return {
        "week_start": monday.isoformat(),
        "sessions": {"value": current["sessions"], "delta": current["sessions"] - previous["sessions"]},
        "active_minutes": {
            "value": current["active_minutes"],
            "delta": current["active_minutes"] - previous["active_minutes"],
        },
        "xp": {"value": current["xp"], "delta": current["xp"] - previous["xp"]},
        "missions_completed": {
            "value": current["missions_completed"],
            "delta": current["missions_completed"] - previous["missions_completed"],
        },
    }
