"""Assemblage de l'agrégat unique du dashboard Papa (ADR-0028 §1, §2).

**Une seule requête HTTP au premier rendu**, trois fenêtres (7 / 30 / 90) dans la même réponse,
séries livrées PAR MATIÈRE et jamais pré-agrégées : « toutes matières » est une somme que le
client calcule. C'est la condition technique pour que changer de période, de matière ou de focus
ne déclenche aucun aller-retour réseau.

Ce module ne décide d'aucun statut pédagogique : il lit `progress` pour « consolidée » et
« fragile » (§3 bis), `missions` pour « lacune sans mission », `memory` pour les cartes dues. La
frontière du §3 tient tant qu'aucun seuil n'est recalculé ici.
"""

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    Capsule,
    Chapter,
    ContentRequest,
    Fiche,
    Gap,
    LearningEvent,
    Lesson,
    LessonSkill,
    Mindmap,
    Mission,
    NotionRequest,
    Quiz,
    RagDocument,
    SchoolYear,
    SchoolYearSubject,
    Skill,
    SkillMastery,
    SkillMasteryHistory,
    SpacedReviewCard,
    StudentProfile,
    Subject,
)
from app.modules.activity import service as activity_service
from app.modules.missions import service as missions_service
from app.modules.activity.timeutils import (
    local_day,
    range_bounds_utc,
    to_utc,
    today_local,
    week_start,
)
from app.modules.dashboard import projections as p
from app.modules.progress.service import OPEN_GAP_STATUSES, skills_with_active_mission

# Fenêtre de la heatmap calendrier — indépendante du sélecteur de période, qui ne pilote que les
# KPI et les séries. La grille est là pour la tendance longue (adr-0028 §6).
CALENDAR_WEEKS = 26
REVIEW_LOAD_DAYS = 14

_ACTIVE_MISSION_STATUSES = ("planned", "active")


# ==================================================================================================
# Chargements
# ==================================================================================================


def _active_year(db: Session, student_id: int) -> SchoolYear | None:
    return db.scalars(
        select(SchoolYear)
        .where(SchoolYear.student_id == student_id, SchoolYear.status == "active")
        .order_by(SchoolYear.id.desc())
        .limit(1)
    ).first()


def _events(db: Session, *, student_id: int, first_day: date, last_day: date) -> list[LearningEvent]:
    """Journal d'activité de la fenêtre la plus large, chargé UNE fois puis projeté.

    Passe par `activity.service._load_events` ? Non : celui-ci filtre par matière et on a besoin
    de TOUT pour ventiler ensuite en mémoire. On reprend en revanche son exclusion — les
    événements d'agenda sont déclaratifs et ne comptent dans aucune projection d'activité
    (ADR-0025 §3, piège déjà tombé trois fois).
    """
    from app.modules.activity.events import NON_ACTIVITY_EVENTS

    start, end = range_bounds_utc(first_day, last_day)
    return list(
        db.scalars(
            select(LearningEvent)
            .where(
                LearningEvent.student_id == student_id,
                LearningEvent.created_at >= start,
                LearningEvent.created_at < end,
                LearningEvent.event_type.not_in(NON_ACTIVITY_EVENTS),
            )
            .order_by(LearningEvent.created_at, LearningEvent.id)
        ).all()
    )


def _skills_by_subject(db: Session) -> dict[int, list[int]]:
    rows = db.execute(select(Skill.subject_id, Skill.id)).all()
    grouped: dict[int, list[int]] = {}
    for subject_id, skill_id in rows:
        grouped.setdefault(subject_id, []).append(skill_id)
    return grouped


def _mastery_rows(db: Session, student_id: int) -> list[tuple[int, int, str]]:
    """`(subject_id, skill_id, status)` des notions ayant une ligne de maîtrise."""
    return [
        (subject_id, skill_id, status)
        for subject_id, skill_id, status in db.execute(
            select(Skill.subject_id, SkillMastery.skill_id, SkillMastery.status)
            .join(Skill, Skill.id == SkillMastery.skill_id)
            .where(SkillMastery.student_id == student_id)
        ).all()
    ]


def _entered_fragile_at(db: Session, student_id: int) -> dict[int, date]:
    """Date de la DERNIÈRE entrée en statut fragile, par notion (`skill_mastery_history`).

    Alimente la reconstruction de la courbe ambre (`projections.reconstruct_series`). Une notion
    absente de ce dictionnaire est réputée fragile depuis avant la mise en service de
    l'historique : elle compte sur toute la fenêtre plutôt que d'apparaître d'un coup.
    """
    rows = db.execute(
        select(SkillMasteryHistory.skill_id, func.max(SkillMasteryHistory.changed_at))
        .where(
            SkillMasteryHistory.student_id == student_id,
            SkillMasteryHistory.status.in_(tuple(p.FRAGILE_STATUSES)),
        )
        .group_by(SkillMasteryHistory.skill_id)
    ).all()
    return {skill_id: local_day(changed_at) for skill_id, changed_at in rows if changed_at}


def _mastered_at(db: Session, student_id: int) -> dict[int, date]:
    rows = db.execute(
        select(SkillMastery.skill_id, SkillMastery.mastered_at).where(
            SkillMastery.student_id == student_id,
            SkillMastery.status == "mastered",
            SkillMastery.mastered_at.is_not(None),
        )
    ).all()
    return {skill_id: local_day(when) for skill_id, when in rows if when}


def _covered_at(db: Session) -> dict[int, date]:
    """Date à laquelle une notion a été couverte par un cours validé (`Lesson.validated_at`).

    `lessons` utilise `status`, pas `validation_status` : deux conventions coexistent dans le
    dépôt et interroger la mauvaise colonne rendrait un ensemble vide sans lever d'erreur.
    """
    rows = db.execute(
        select(LessonSkill.skill_id, func.min(Lesson.validated_at))
        .join(Lesson, Lesson.id == LessonSkill.lesson_id)
        .where(Lesson.status == "validated")
        .group_by(LessonSkill.skill_id)
    ).all()
    return {skill_id: local_day(when) for skill_id, when in rows if when}


def _covered_skill_ids(db: Session) -> set[int]:
    return {
        skill_id
        for (skill_id,) in db.execute(
            select(LessonSkill.skill_id)
            .join(Lesson, Lesson.id == LessonSkill.lesson_id)
            .where(Lesson.status == "validated")
            .distinct()
        ).all()
    }


def _review_load(db: Session, student_id: int, today: date) -> dict[int, list[int]]:
    """Cartes SRS dues par matière sur les 14 jours à venir, J+0 → J+13.

    Reprend les filtres de `memory/service` (`due_at` non nul, statuts inactifs exclus) : une
    carte suspendue ou archivée n'est pas une charge de travail.
    """
    from app.modules.memory.service import INACTIVE_CARD_STATUSES

    start, end = range_bounds_utc(today, today + timedelta(days=REVIEW_LOAD_DAYS - 1))
    rows = db.execute(
        select(Skill.subject_id, SpacedReviewCard.due_at)
        .join(Skill, Skill.id == SpacedReviewCard.skill_id)
        .where(
            SpacedReviewCard.student_id == student_id,
            SpacedReviewCard.due_at.is_not(None),
            SpacedReviewCard.due_at >= start,
            SpacedReviewCard.due_at < end,
            SpacedReviewCard.status.not_in(tuple(INACTIVE_CARD_STATUSES)),
        )
    ).all()

    load: dict[int, list[int]] = {}
    for subject_id, due_at in rows:
        offset = (local_day(due_at) - today).days
        if 0 <= offset < REVIEW_LOAD_DAYS:
            load.setdefault(subject_id, [0] * REVIEW_LOAD_DAYS)[offset] += 1
    return load


def _referentiel_subjects(db: Session, year_id: int | None) -> set[int]:
    """Matières de l'année active qui ont au moins un chapitre — le reste est un trou à nommer."""
    if year_id is None:
        return set()
    return {
        subject_id
        for (subject_id,) in db.execute(
            select(SchoolYearSubject.subject_id)
            .join(Chapter, Chapter.school_year_subject_id == SchoolYearSubject.id)
            .where(SchoolYearSubject.school_year_id == year_id)
            .distinct()
        ).all()
    }


# ==================================================================================================
# File « À décider »
# ==================================================================================================


def _inbox(db: Session, student_id: int, year_id: int | None) -> list[dict]:
    """Cinq familles d'items en attente d'une décision de Papa, dans un ordre FIXE.

    L'ordre encode la priorité pédagogique, pas la chronologie : ce qui bloque la diffusion d'un
    contenu passe avant ce qui n'attend qu'un rangement.

    ⚠️ **Les quiz n'y figurent pas** : `quizzes` n'a pas de `validation_status`, ils sont servis
    sans gate par doctrine (ADR-0014 §2). Les compter ici demanderait une migration hors périmètre.
    """
    items: list[dict] = []

    pending = {
        "leçon": db.scalar(
            select(func.count()).select_from(Lesson).where(Lesson.status == "draft")
        )
        or 0,
        "fiche": db.scalar(
            select(func.count()).select_from(Fiche).where(Fiche.validation_status == "pending")
        )
        or 0,
        "mindmap": db.scalar(
            select(func.count()).select_from(Mindmap).where(Mindmap.validation_status == "pending")
        )
        or 0,
        "capsule": db.scalar(
            select(func.count()).select_from(Capsule).where(Capsule.validation_status == "pending")
        )
        or 0,
        "chapitre": db.scalar(
            select(func.count())
            .select_from(Chapter)
            .where(Chapter.validation_status == "pending")
        )
        or 0,
    }
    total_pending = sum(pending.values())
    if total_pending:
        detail = " · ".join(
            f"{count} {label}{'s' if count > 1 else ''}" for label, count in pending.items() if count
        )
        items.append(
            {
                "kind": "validation",
                "count": total_pending,
                "label": f"{total_pending} contenu{'s' if total_pending > 1 else ''} en attente de relecture",
                "detail": detail,
                "href": "/couverture",
            }
        )

    orphan_gaps = _gaps_without_mission(db, student_id)
    if orphan_gaps:
        items.append(
            {
                "kind": "gap",
                "count": len(orphan_gaps),
                "label": (
                    f"{len(orphan_gaps)} notion{'s' if len(orphan_gaps) > 1 else ''} à renforcer "
                    "sans mission active"
                ),
                "detail": " · ".join(orphan_gaps[:3]),
                "href": "/lacunes",
            }
        )

    demandes = (
        db.scalar(
            select(func.count())
            .select_from(NotionRequest)
            .where(NotionRequest.status == "pending")
        )
        or 0
    ) + (
        db.scalar(
            select(func.count())
            .select_from(ContentRequest)
            .where(ContentRequest.status == "pending")
        )
        or 0
    )
    if demandes:
        items.append(
            {
                "kind": "demande",
                "count": demandes,
                "label": f"{demandes} demande{'s' if demandes > 1 else ''} de Massimo",
                "detail": "Notions hors programme et contenus réclamés",
                "href": "/demandes",
            }
        )

    if year_id is not None:
        with_referentiel = _referentiel_subjects(db, year_id)
        missing = [
            name
            for subject_id, name in db.execute(
                select(SchoolYearSubject.subject_id, Subject.name)
                .join(Subject, Subject.id == SchoolYearSubject.subject_id)
                .where(SchoolYearSubject.school_year_id == year_id)
            ).all()
            if subject_id not in with_referentiel
        ]
        if missing:
            items.append(
                {
                    "kind": "referentiel",
                    "count": len(missing),
                    "label": (
                        f"{len(missing)} matière{'s' if len(missing) > 1 else ''} sans programme généré"
                    ),
                    "detail": " · ".join(missing),
                    "href": "/programme",
                }
            )

    clips = (
        db.scalar(
            select(func.count())
            .select_from(RagDocument)
            .where(RagDocument.source_type == "web_clip", RagDocument.subject_id.is_(None))
        )
        or 0
    )
    if clips:
        items.append(
            {
                "kind": "source",
                "count": clips,
                "label": f"{clips} capture{'s' if clips > 1 else ''} à rattacher",
                "detail": "Captures zetis-clip sans matière",
                "href": "/sources",
            }
        )

    return items


def _gaps_without_mission(db: Session, student_id: int) -> list[str]:
    """Notions à renforcer qu'aucune mission active ne prend en charge.

    Délégué à `progress.service._skills_with_active_mission` — SOURCE UNIQUE, partagée avec la page
    Lacunes. Ce comptage regardait auparavant les seules missions de **remédiation** : une notion
    déjà couverte par une mission `manual` (Papa l'a commandée) ou `revision` était donc annoncée
    « sans mission active » sur le dashboard, alors que la page Lacunes la disait prise en charge.
    Constaté en base : deux surfaces qui se contredisaient sur la même notion.

    La question posée par le KPI est « reste-t-il un geste à faire ? » — et n'importe quelle
    mission active y répond, quel que soit son type.
    """
    rows = db.execute(
        select(Gap.skill_id, Skill.name)
        .outerjoin(Skill, Skill.id == Gap.skill_id)
        .where(Gap.student_id == student_id, Gap.status.in_(OPEN_GAP_STATUSES))
    ).all()
    covered = skills_with_active_mission(db, student_id=student_id)
    return [name or "Notion" for skill_id, name in rows if skill_id not in covered]


# ==================================================================================================
# Chaîne de contenus
# ==================================================================================================


def _content_chain(db: Session) -> list[dict]:
    """Entonnoir de production : chaque marche a pour cible la marche précédente.

    Lecture visée : la marche la plus haute est celle à produire en premier. Les quiz sont comptés
    sur `status='ready'` faute de `validation_status` (ADR-0014 §2).
    """
    chapters = db.scalar(select(func.count()).select_from(Chapter)) or 0
    chapters_ok = (
        db.scalar(
            select(func.count()).select_from(Chapter).where(Chapter.validation_status == "validated")
        )
        or 0
    )
    lessons_ok = (
        db.scalar(select(func.count()).select_from(Lesson).where(Lesson.status == "validated")) or 0
    )
    fiches_ok = (
        db.scalar(
            select(func.count()).select_from(Fiche).where(Fiche.validation_status == "validated")
        )
        or 0
    )
    quizzes_ok = (
        db.scalar(
            select(func.count())
            .select_from(Quiz)
            .where(Quiz.lesson_id.is_not(None), Quiz.status == "ready")
        )
        or 0
    )
    return [
        {"stage": "chapitres_valides", "label": "Chapitres validés", "value": chapters_ok, "target": chapters},
        {"stage": "cours_valides", "label": "Cours validés", "value": lessons_ok, "target": chapters_ok},
        {"stage": "fiches", "label": "Fiches", "value": fiches_ok, "target": lessons_ok},
        {"stage": "quiz", "label": "Quiz de fin de cours", "value": quizzes_ok, "target": lessons_ok},
    ]


# ==================================================================================================
# Lecture ZETIS
# ==================================================================================================


def _reading(db: Session, student_id: int, subjects: list[dict], events: list[LearningEvent]) -> list[dict]:
    """Constats adossés à des traces comptées. **Un constat sans preuve n'est pas émis.**

    Version délibérément sobre : aucun appel LLM, aucune interprétation — on énonce ce que les
    compteurs disent déjà, avec le nombre d'éléments qui le fonde. La narration écrite reste le
    travail du Conseil de classe (ADR-0020) ; le dashboard mesure, il n'explique pas.
    """
    reading: list[dict] = []

    for subject in sorted(subjects, key=lambda s: -s["notions"]["fragile"])[:2]:
        fragile = subject["notions"]["fragile"]
        if fragile:
            plural = "s" if fragile > 1 else ""
            reading.append(
                {
                    "trend": "watch",
                    # « à renforcer », pas « en cours de construction » : ce dernier est le
                    # vocabulaire du statut `in_progress` (CLAUDE.md §pédagogie). Employer les
                    # deux pour la même chose brouillerait le seul mot que Papa doit reconnaître.
                    "text": f"{subject['name']} : {fragile} notion{plural} à renforcer",
                    "evidence": {
                        "count": fragile,
                        "kind": "notion",
                        "href": f"/lacunes?subject={subject['slug']}",
                    },
                }
            )

    best = max(subjects, key=lambda s: s["notions"]["consolidated"], default=None)
    if best is not None and best["notions"]["consolidated"]:
        count = best["notions"]["consolidated"]
        reading.append(
            {
                "trend": "up",
                "text": (
                    f"{best['name']} : {count} notion{'s' if count > 1 else ''} "
                    f"consolidée{'s' if count > 1 else ''}"
                ),
                "evidence": {
                    "count": count,
                    "kind": "notion",
                    "href": f"/progression?subject={best['slug']}",
                },
            }
        )

    # Non-conclusion explicite : le silence laisserait croire qu'il n'y a rien à dire, alors que
    # c'est le VOLUME qui manque. Sa preuve est précisément le compte d'événements.
    for subject in subjects:
        traces = sum(1 for e in events if e.subject_id == subject["id"])
        # `notions.total > 0` et non `has_referentiel` : une matière peut avoir des chapitres sans
        # aucune notion (chapitres générés, notions pas encore rattachées). Dire d'elle « trop peu
        # d'activité pour conclure » remplirait la carte de constats sur des matières qui n'ont
        # rien à conclure — constaté sur la base de dev, invisible sur un jeu de test.
        if subject["notions"]["total"] > 0 and traces < 3:
            reading.append(
                {
                    "trend": "flat",
                    "text": f"{subject['name']} : trop peu d'activité sur la période pour conclure",
                    "evidence": {
                        "count": traces,
                        "kind": "trace",
                        "href": f"/cahier?subject={subject['slug']}",
                    },
                }
            )

    return [r for r in reading if r.get("evidence")]


# ==================================================================================================
# Assemblage
# ==================================================================================================


def build_dashboard(db: Session, *, student_id: int) -> dict:
    """Agrégat complet, non filtré, pour les trois fenêtres."""
    today = today_local()
    year = _active_year(db, student_id)

    calendar_first = week_start(today) - timedelta(weeks=CALENDAR_WEEKS - 1)
    events = _events(db, student_id=student_id, first_day=calendar_first, last_day=today)
    # SOURCE UNIQUE des minutes de tout l'agrégat : totaux, créneaux, sparklines et calendrier en
    # dérivent tous. Une seconde façon de compter le temps actif ferait diverger deux chiffres de
    # la même page.
    pairs = p.minutes_per_event(events)
    ordered = [event for event, _minutes in pairs]

    subject_rows = list(db.scalars(select(Subject).order_by(Subject.sort_order, Subject.name)))
    skills_by_subject = _skills_by_subject(db)
    mastery_rows = _mastery_rows(db, student_id)
    review_load = _review_load(db, student_id, today)
    referentiel = _referentiel_subjects(db, year.id if year else None)
    covered_ids = _covered_skill_ids(db)
    covered_at = _covered_at(db)
    mastered_at = _mastered_at(db, student_id)
    fragile_at = _entered_fragile_at(db, student_id)

    gaps_by_subject: dict[int, int] = {}
    for (subject_id,) in db.execute(
        select(Gap.subject_id).where(
            Gap.student_id == student_id, Gap.status.in_(OPEN_GAP_STATUSES)
        )
    ).all():
        gaps_by_subject[subject_id] = gaps_by_subject.get(subject_id, 0) + 1

    subjects: list[dict] = []
    for subject in subject_rows:
        skill_ids = set(skills_by_subject.get(subject.id, []))
        statuses = [status for sid, _skill, status in mastery_rows if sid == subject.id]
        # Minutes appariées à leur événement : `event_minutes` a été calculé sur la suite
        # COMPLÈTE, ce qui est voulu — l'écart jusqu'à l'événement suivant ne dépend pas de la
        # matière. Refaire le calcul par matière inventerait du temps sur chaque bascule.
        subject_pairs = [(e, m) for e, m in pairs if e.subject_id == subject.id]

        # Calendrier dérivé des MÊMES minutes que les totaux (et non d'un `active_minutes`
        # recalculé) : la somme d'une colonne de la grille égale exactement le KPI.
        by_day: dict[date, int] = {}
        for event, gained in subject_pairs:
            day = local_day(event.created_at)
            by_day[day] = by_day.get(day, 0) + gained
        calendar = [
            {"date": day.isoformat(), "active_minutes": total}
            for day, total in sorted(by_day.items())
            if total > 0  # jours vides omis, reconstruits côté client
        ]

        subject_covered = skill_ids & covered_ids
        consolidated_now = sum(1 for s in statuses if s in p.CONSOLIDATED_STATUSES)
        fragile_now = sum(1 for s in statuses if s in p.FRAGILE_STATUSES)

        minutes: dict[str, int] = {}
        slots: dict[str, list[list[int]]] = {}
        outside: dict[str, int] = {}
        series: dict[str, dict] = {}
        for period in p.PERIODS:
            first, last = p.period_window(period, today)
            in_window = [
                (e, m) for e, m in subject_pairs if first <= local_day(e.created_at) <= last
            ]
            minutes[str(period)] = sum(m for _e, m in in_window)
            matrix, out = p.bucket_slots(in_window, first_day=first, last_day=last)
            slots[str(period)] = matrix
            outside[str(period)] = out

            marks = p.series_marks(period, today)
            series[str(period)] = {
                "covered": p.reconstruct_series(
                    len(subject_covered),
                    [covered_at[s] for s in subject_covered if s in covered_at],
                    marks,
                ),
                "consolidated": p.reconstruct_series(
                    consolidated_now,
                    [mastered_at[s] for s in skill_ids if s in mastered_at],
                    marks,
                ),
                "fragile": p.reconstruct_series(
                    fragile_now,
                    [fragile_at[s] for s in skill_ids if s in fragile_at],
                    marks,
                ),
            }

        subjects.append(
            {
                "id": subject.id,
                "slug": subject.slug,
                "name": subject.name,
                "color": subject.color,
                "minutes": minutes,
                "calendar": calendar,
                "slots": slots,
                "slots_outside_minutes": outside,
                "notions": p.notions_breakdown(statuses, len(skill_ids)),
                "series": series,
                "review_load": review_load.get(subject.id, [0] * REVIEW_LOAD_DAYS),
                "gaps_open": gaps_by_subject.get(subject.id, 0),
                "has_referentiel": subject.id in referentiel,
            }
        )

    periods = _periods(
        db,
        student_id=student_id,
        today=today,
        pairs=pairs,
        mastered_at=mastered_at,
        subjects=subjects,
    )

    # Temps actif SANS matière : connexion, navigation, chat, étapes de mission non imputées.
    # Sans ce champ, le donut « Répartition du temps » totalisait 42 min à côté d'un KPI affichant
    # 7 h 05 — deux chiffres du même écran qui se contredisent (constaté au premier rendu réel).
    # On le nomme plutôt que de le taire : c'est du temps de présence mesuré, il n'appartient
    # simplement à aucune matière.
    unattributed = {
        str(period): sum(
            minutes
            for event, minutes in pairs
            if event.subject_id is None
            and p.period_window(period, today)[0] <= local_day(event.created_at) <= today
        )
        for period in p.PERIODS
    }

    last_event = ordered[-1] if ordered else None
    return {
        "unattributed_minutes": unattributed,
        "school_year": (
            {"level": year.level, "label": year.label, "program_version": None} if year else None
        ),
        "generated_at": _now_iso(),
        "last_activity_at": to_utc(last_event.created_at).isoformat() if last_event else None,
        # Délégué à `activity`, et NON déduit de `ordered` : celui-ci est borné aux 26 semaines
        # du calendrier. Un dernier événement plus ancien aurait rendu la liste vide et le
        # décrochage aurait valu 0 — soit « tout va bien » au moment précis où il faut alerter.
        "days_inactive": activity_service.trailing_inactive_days(
            db, student_id=student_id, last_day=today
        ),
        "inbox": _inbox(db, student_id, year.id if year else None),
        "periods": periods,
        "subjects": subjects,
        "content_chain": _content_chain(db),
        "reading": _reading(db, student_id, subjects, ordered),
        # Proposition composée EN LECTURE par le moteur de missions (`preview_remediation`,
        # patron preview/confirm ADR-0010). Le GET n'écrit rien : la mission n'existe qu'après
        # confirmation explicite de Papa, sur la route de création déjà en place. `None` quand
        # aucune lacune n'est découverte — la carte ne propose alors rien plutôt que d'inventer
        # un travail à faire.
        "proposed_mission": _proposed_mission(db, student_id),
    }


def _proposed_mission(db: Session, student_id: int) -> dict | None:
    """Passe-plat vers le moteur de missions, enrichi du lien de confirmation.

    Le dashboard ne compose PAS lui-même : il demande au module qui détient la doctrine des
    parcours (ADR-0017 §5). Recomposer ici un « eli5 → quiz » à la main aurait produit une
    proposition qui diverge du jour où l'ordre des étapes change.
    """
    student = db.get(StudentProfile, student_id)
    if student is None:
        return None
    proposal = missions_service.preview_remediation(db, student)
    if proposal is None:
        return None
    return {
        **proposal,
        # Où va Papa pour confirmer. La création reste un POST explicite sur la surface Missions,
        # jamais un effet de bord de l'affichage.
        "confirm_href": "/missions",
    }


def _periods(
    db: Session,
    *,
    student_id: int,
    today: date,
    pairs: list[tuple[LearningEvent, int]],
    mastered_at: dict[int, date],
    subjects: list[dict],
) -> dict[str, dict]:
    """KPI `{value, delta}` + sparklines de 12 points, par fenêtre.

    Les deltas sont calculés SERVEUR contre la fenêtre précédente de même longueur — le client
    n'invente aucun chiffre (adr-0028 §3).
    """
    day_minutes: dict[date, int] = {}
    for event, gained in pairs:
        day = local_day(event.created_at)
        day_minutes[day] = day_minutes.get(day, 0) + gained
    # Un jour « actif » est un jour où quelque chose a eu lieu, même si le temps actif y vaut 0
    # (une seule action isolée ne produit aucun écart mesurable). Compter les jours à minutes > 0
    # rendrait la régularité muette sur les journées courtes, qui sont justement le régime visé.
    active_days_set = {local_day(event.created_at) for event, _m in pairs}

    total_notions = sum(s["notions"]["total"] for s in subjects)
    consolidated_now = sum(s["notions"]["consolidated"] for s in subjects)
    open_gaps_now = sum(s["gaps_open"] for s in subjects)
    without_mission = len(_gaps_without_mission(db, student_id))
    gap_opened = _gap_open_dates(db, student_id)

    out: dict[str, dict] = {}
    for period in p.PERIODS:
        first, last = p.period_window(period, today)
        prev_first, prev_last = p.previous_window(period, today)
        marks = p.series_marks(period, today)

        minutes = sum(v for d, v in day_minutes.items() if first <= d <= last)
        prev_minutes = sum(v for d, v in day_minutes.items() if prev_first <= d <= prev_last)
        days = sum(1 for d in active_days_set if first <= d <= last)
        prev_days = sum(1 for d in active_days_set if prev_first <= d <= prev_last)
        consolidated_delta = sum(1 for d in mastered_at.values() if first <= d <= last)

        out[str(period)] = {
            "kpis": {
                "active_minutes": {"value": minutes, "delta": minutes - prev_minutes},
                "active_days": {"value": days, "of": period, "delta": days - prev_days},
                "consolidated": {
                    "value": consolidated_now,
                    "of": total_notions,
                    "delta": consolidated_delta,
                },
                "open_gaps": {
                    "value": open_gaps_now,
                    "delta": 0,
                    "without_mission": without_mission,
                },
            },
            "sparks": {
                "active_minutes": p.bucket_sums(
                    [(d, v) for d, v in day_minutes.items() if first <= d <= last], marks
                ),
                "active_days": p.bucket_counts(
                    [d for d in active_days_set if first <= d <= last], marks
                ),
                "consolidated": p.reconstruct_series(
                    consolidated_now, list(mastered_at.values()), marks
                ),
                "open_gaps": p.reconstruct_series(open_gaps_now, gap_opened, marks),
            },
        }
    return out


def _gap_open_dates(db: Session, student_id: int) -> list[date]:
    rows = db.execute(
        select(Gap.first_detected_at).where(
            Gap.student_id == student_id, Gap.status.in_(OPEN_GAP_STATUSES)
        )
    ).all()
    return [local_day(when) for (when,) in rows if when]


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()
