"""Écriture du journal d'activité (`learning_events`) : helper partagé + vocabulaire.

Deux journaux, deux sémantiques, JAMAIS d'UNION (cf. DATA_MODEL.md) :

- `xp_events` = grand livre de l'économie XP (solde, niveau, streak) ;
- `learning_events` = journal d'activité pédagogique (ce que Massimo a FAIT).

Le XP affiché sur la heatmap est sommé depuis `xp_events` comme métrique séparée ; les minutes
actives et les sessions se calculent sur `learning_events` seul. Mélanger les deux double-compte.

`log_learning_event` est calqué sur `award_xp` (gamification) : ajout à la session courante,
commit laissé à l'appelant — l'événement vit dans la MÊME transaction que l'acte qu'il trace.
Aucun try/except ici : le helper est assez simple pour ne pas pouvoir échouer, et un bug de
schéma doit remonter au lieu d'être avalé (un journal silencieusement vide est pire qu'une
erreur visible).
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import LearningEvent, StudentProfile
from app.modules.activity.timeutils import day_bounds_utc, today_local

# --- Vocabulaire du journal ------------------------------------------------------------------
# Événements POSÉS par ce chantier (slice A).
EVENT_LOGIN = "login"
EVENT_PAGE_VIEWED = "page_viewed"
EVENT_LESSON_VIEWED = "lesson_viewed"
EVENT_FICHE_VIEWED = "fiche_viewed"
EVENT_QUIZ_ATTEMPTED = "quiz_attempted"
EVENT_ELI5_REQUESTED = "eli5_requested"
EVENT_REVIEW_ATTEMPTED = "review_attempted"

# Événements PRÉEXISTANTS, écrits par d'autres modules et déjà LUS ailleurs (evidence, verdict
# de mission) : on les RÉUTILISE au lieu d'en émettre des doublons. Écart assumé avec la table
# de `page-dashboard.md`, qui a été écrite sans connaître ces producteurs :
#
# - `reverse_eli5` (eli5/service.py) EST la verbalisation reverse que la spec nomme
#   `eli5_reverse` — même acte, même instant, même (subject_id, skill_id) ;
# - `mission_verdict` (missions/service.py) est émis exactement là où `mission.status` passe à
#   "completed" : c'est la complétion de mission que la spec nomme `mission_completed`.
#
# Émettre en plus `eli5_reverse`/`mission_completed` créerait DEUX événements pour un seul acte,
# donc un double comptage dans la heatmap et les sessions. Renommer l'existant casserait ses
# lecteurs (`evidence.VERDICT_EVENT`, `completed-today`). On réutilise : zéro doublon, zéro
# régression.
EVENT_ELI5_REVERSE = "reverse_eli5"
EVENT_MISSION_COMPLETED = "mission_verdict"
EVENT_MISSION_STEP_VIEW = "mission_step_view"


def log_learning_event(
    db: Session,
    *,
    student_id: int,
    event_type: str,
    subject_id: int | None = None,
    skill_id: int | None = None,
    payload: dict | None = None,
) -> LearningEvent:
    """Ajoute un événement d'activité à la session (le commit est laissé à l'appelant).

    Le serveur horodate systématiquement (`created_at` UTC) : aucun timestamp client n'entre
    dans le journal. Patron `award_xp` — signature en keyword-only, aucun effet de bord au-delà
    du `db.add`."""
    event = LearningEvent(
        student_id=student_id,
        subject_id=subject_id,
        skill_id=skill_id,
        event_type=event_type,
        payload_json=payload,
        created_at=datetime.now(timezone.utc),
    )
    db.add(event)
    return event


# --- Dédupe des événements de CONSULTATION -----------------------------------------------------
# Un rafraîchissement de page n'est pas une activité : sans dédupe, un F5 gonflerait la heatmap.
# Le filtrage du payload se fait en Python et non en SQL : `payload_json` est une colonne JSON
# générique, dont l'interrogation diffère entre SQLite (tests) et PostgreSQL (production). Le
# volume est trivial (un élève, un jour), la portabilité vaut mieux que l'astuce.


def logged_today(
    db: Session, *, student_id: int, event_type: str, payload_key: str, payload_value: object
) -> bool:
    """Un événement de ce type porte-t-il déjà cette ressource AUJOURD'HUI (jour Europe/Paris) ?"""
    start, end = day_bounds_utc(today_local())
    rows = db.scalars(
        select(LearningEvent).where(
            LearningEvent.student_id == student_id,
            LearningEvent.event_type == event_type,
            LearningEvent.created_at >= start,
            LearningEvent.created_at < end,
        )
    ).all()
    return any((row.payload_json or {}).get(payload_key) == payload_value for row in rows)


def log_view_once_per_day(
    db: Session,
    *,
    student_id: int,
    event_type: str,
    payload_key: str,
    payload_value: object,
    subject_id: int | None = None,
    skill_id: int | None = None,
    payload: dict | None = None,
) -> LearningEvent | None:
    """Journalise une consultation au plus une fois par (élève, ressource, jour Paris).

    Renvoie l'événement écrit, ou None si la ressource a déjà été vue aujourd'hui."""
    if logged_today(
        db,
        student_id=student_id,
        event_type=event_type,
        payload_key=payload_key,
        payload_value=payload_value,
    ):
        return None
    return log_learning_event(
        db,
        student_id=student_id,
        event_type=event_type,
        subject_id=subject_id,
        skill_id=skill_id,
        payload=payload,
    )


def student_id_or_none(db: Session) -> int | None:
    """Élève courant, ou None si la base n'en contient aucun — SANS lever.

    `get_default_student` répond 404 quand aucun profil n'existe : parfait pour une route élève,
    inacceptable pour un hook. Une connexion sur une base fraîchement installée ne doit pas
    échouer parce que le journal n'a personne à qui attribuer l'événement."""
    student = db.scalar(select(StudentProfile).order_by(StudentProfile.id))
    return student.id if student is not None else None


def last_event_of_type(db: Session, *, student_id: int, event_type: str) -> LearningEvent | None:
    """Dernier événement de ce type pour cet élève (dédupe des routes consécutives)."""
    return db.scalars(
        select(LearningEvent)
        .where(LearningEvent.student_id == student_id, LearningEvent.event_type == event_type)
        .order_by(LearningEvent.created_at.desc(), LearningEvent.id.desc())
        .limit(1)
    ).first()
