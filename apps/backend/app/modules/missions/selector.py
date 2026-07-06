"""Sélecteur de la mission du jour (ADR-0017 lot 2, décisions 2 & 3) — scoring DÉTERMINISTE.

Zéro LLM : même état de base ⇒ même élection (invariant testé). Chaque candidate reçoit un score
composé de facteurs NOMMÉS dont les pondérations vivent en config (`MISSION_SCORING_VERSION`). Le
facteur dominant choisit une **phrase template** figée (jamais de texte libre) — la raison servie à
Massimo est bienveillante par construction.

Consomme le service d'évidence (substrat neutre) ; n'écrit rien. L'élection est **recalculable à la
demande** (déterminisme) → aucune trace d'élection stockée.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import (
    Chapter,
    Lesson,
    LessonSkill,
    Mission,
    SchoolYear,
    SchoolYearSubject,
    StudentProfile,
)
from app.modules.evidence import service as evidence

_ACTIVE_STATUSES = ("planned", "active")
_SEVERITY_VALUE = {"high": 1.0, "medium": 0.6, "low": 0.3}

# Phrases servies à Massimo, choisies par le facteur dominant. Dict FIGÉ (jamais de LLM, jamais de
# texte libre — vocabulaire bienveillant de CLAUDE.md garanti par construction).
REASON_PHRASES: dict[str, str] = {
    "severity": "parce qu'on renforce une notion importante",
    "due_pressure": "parce que cette notion revient bientôt",
    "continuity": "parce que c'est la prochaine étape de ton programme",
    "forced_priority": "parce que Papa te l'a demandée en priorité",
    "default": "parce que c'est une bonne prochaine étape",
}
_NONE_REASON = "Tu n'as rien d'obligatoire maintenant."


@dataclass(frozen=True)
class Factor:
    name: str
    value: float  # valeur brute normalisée [0,1] (variety = flag 0/1)
    weight: float
    contribution: float  # value * weight (négatif pour le malus variety)


@dataclass(frozen=True)
class Scored:
    mission: Mission
    score: float
    factors: list[Factor]
    reason_code: str


@dataclass(frozen=True)
class _Context:
    gap_severity_by_skill: dict[int, str]
    srs_due_by_subject: dict[int, int]
    last_completed_subject: int | None
    active_chapter_skills: set[int]


def _last_completed_subject(db: Session, student_id: int) -> int | None:
    """Proxy déterministe de « matière élue la veille » (l'ADR interdit de stocker les élections) :
    la matière de la mission complétée la plus récente."""
    return db.scalar(
        select(Mission.subject_id)
        .where(Mission.student_id == student_id, Mission.status == "completed")
        .order_by(Mission.updated_at.desc(), Mission.id.desc())
        .limit(1)
    )


def _active_chapter_skills(db: Session, student_id: int) -> set[int]:
    """Notions des leçons validées de chapitres validés actifs/planifiés de l'année active."""
    year = db.scalar(
        select(SchoolYear)
        .where(SchoolYear.student_id == student_id, SchoolYear.status == "active")
        .order_by(SchoolYear.id.desc())
    )
    if year is None:
        return set()
    return set(
        db.scalars(
            select(LessonSkill.skill_id)
            .join(Lesson, Lesson.id == LessonSkill.lesson_id)
            .join(Chapter, Chapter.id == Lesson.chapter_id)
            .join(
                SchoolYearSubject,
                SchoolYearSubject.id == Chapter.school_year_subject_id,
            )
            .where(
                SchoolYearSubject.school_year_id == year.id,
                Chapter.validation_status == "validated",
                Chapter.status.in_(_ACTIVE_STATUSES),
                Lesson.status == "validated",
            )
        )
    )


def _build_context(db: Session, student: StudentProfile) -> _Context:
    return _Context(
        gap_severity_by_skill={
            g["skill_id"]: g["severity"] for g in evidence.open_gaps(db, student_id=student.id)
        },
        srs_due_by_subject={
            subject_id: info["due"]
            for subject_id, info in evidence.srs_pressure(db, student_id=student.id).items()
        },
        last_completed_subject=_last_completed_subject(db, student.id),
        active_chapter_skills=_active_chapter_skills(db, student.id),
    )


def _score(mission: Mission, ctx: _Context) -> Scored:
    """Score composé d'une candidate + facteurs bruts + facteur dominant (positif)."""
    severity = 0.0
    if mission.mission_type == "remediation" and mission.skill_id is not None:
        severity = _SEVERITY_VALUE.get(ctx.gap_severity_by_skill.get(mission.skill_id, ""), 0.0)

    due_pressure = 0.0
    if mission.mission_type == "revision" and mission.subject_id is not None:
        due = ctx.srs_due_by_subject.get(mission.subject_id, 0)
        cap = max(1, settings.mission_due_pressure_cap)
        due_pressure = min(1.0, due / cap)

    continuity = 0.0
    if mission.mission_type == "progression":
        continuity = 1.0 if mission.skill_id in ctx.active_chapter_skills else 0.5

    variety = (
        1.0
        if mission.subject_id is not None and mission.subject_id == ctx.last_completed_subject
        else 0.0
    )
    # v2 (ADR-0018) : plancher lu PAR MISSION via `force_priority`, plus par le type `manual`.
    # Une mission commandée par Papa mais non prioritaire (thématique « Prioritaire » décochée)
    # n'est pas plancher-isée — elle concourt sur ses seuls facteurs naturels.
    forced_priority = 1.0 if mission.force_priority else 0.0

    factors = [
        Factor("severity", severity, settings.mission_weight_severity,
               severity * settings.mission_weight_severity),
        Factor("due_pressure", due_pressure, settings.mission_weight_due_pressure,
               due_pressure * settings.mission_weight_due_pressure),
        Factor("continuity", continuity, settings.mission_weight_continuity,
               continuity * settings.mission_weight_continuity),
        Factor("forced_priority", forced_priority, settings.mission_weight_forced_priority,
               forced_priority * settings.mission_weight_forced_priority),
        Factor("variety", variety, settings.mission_weight_variety,
               -variety * settings.mission_weight_variety),  # MALUS
    ]
    score = sum(f.contribution for f in factors)

    # Facteur dominant = plus forte contribution POSITIVE (le malus ne « justifie » pas l'élection).
    positives = [f for f in factors if f.name != "variety" and f.contribution > 0]
    reason_code = max(positives, key=lambda f: f.contribution).name if positives else "default"
    return Scored(mission=mission, score=round(score, 4), factors=factors, reason_code=reason_code)


def _candidates(db: Session, student: StudentProfile) -> list[Mission]:
    """Missions validées, planned|active (pas de `available_from` sur le modèle réel : toutes
    disponibles). Ordre de base stable pour un tri déterministe en aval."""
    return list(
        db.scalars(
            select(Mission)
            .where(
                Mission.student_id == student.id,
                Mission.validation_status == "validated",
                Mission.status.in_(_ACTIVE_STATUSES),
            )
            .order_by(Mission.id)
        )
    )


def elect(db: Session, student: StudentProfile) -> dict:
    """Élit la mission du jour. Déterministe : tri (score desc, priorité desc, id asc).

    Retourne un objet neutre consommé par les deux frontières (student / pilot) :
    { elected: Scored|None, alternatives: [Scored] (≤2), scoring_version }."""
    ctx = _build_context(db, student)
    scored = [_score(m, ctx) for m in _candidates(db, student)]
    scored.sort(key=lambda s: (-s.score, -s.mission.priority, s.mission.id))
    elected = scored[0] if scored else None
    alternatives = scored[1:3]
    return {
        "elected": elected,
        "alternatives": alternatives,
        "scoring_version": settings.mission_scoring_version,
    }


def reason_for(scored: Scored | None) -> tuple[str, str]:
    """(reason, reason_code) — phrase figée du facteur dominant, ou état serein « rien d'obligatoire »."""
    if scored is None:
        return _NONE_REASON, "none"
    return REASON_PHRASES.get(scored.reason_code, REASON_PHRASES["default"]), scored.reason_code
