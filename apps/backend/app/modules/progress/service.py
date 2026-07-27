"""Lecture de la progression pédagogique : lacunes ouvertes et notions consolidées.

Deux STOCKS (« où en est Massimo aujourd'hui »), à distinguer des flux hebdomadaires du module
`activity` (« qu'a-t-il fait cette semaine »). C'est pourquoi ils sont servis SANS delta : voir
`dashboard_kpis`.

Vocabulaire figé ici, faute de définition dans le glossaire :

- **lacune ouverte** = `Gap.status ∈ (open, in_progress)`, la même définition que celle
  qu'utilise le générateur de missions de remédiation (`missions._OPEN_GAP_STATUSES`) — deux
  comptages divergents de « lacune ouverte » dans la même app seraient un piège ;
- **notion consolidée** = `SkillMastery.status == "mastered"`, soit un score ≥ 90 selon les
  paliers partagés par le diagnostic et le quiz (`_status_from_score`). `solid` (≥ 70) n'est
  volontairement PAS compté : « consolidé » doit vouloir dire acquis, pas « presque ».

Lecture seule : aucune écriture, aucun effet de bord.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Gap, Skill, SkillMastery, Subject

# Repris à l'identique de `missions._OPEN_GAP_STATUSES` (même notion, même définition).
OPEN_GAP_STATUSES = ("open", "in_progress")
MASTERED_STATUS = "mastered"

# Ordre de gravité décroissante : ce qui est le plus urgent se lit en premier.
_SEVERITY_RANK = {"high": 0, "medium": 1, "low": 2}


def open_gaps(db: Session, *, student_id: int) -> list[dict]:
    """Lacunes ouvertes de l'élève, les plus sévères d'abord.

    Formulation bienveillante côté client (CLAUDE.md) : ce sont des « notions à renforcer ».
    Le service sert la donnée brute, l'UI choisit les mots."""
    rows = db.execute(
        select(Gap, Skill, Subject)
        .outerjoin(Skill, Skill.id == Gap.skill_id)
        .outerjoin(Subject, Subject.id == Gap.subject_id)
        .where(Gap.student_id == student_id, Gap.status.in_(OPEN_GAP_STATUSES))
    ).all()

    gaps = [
        {
            "skill_id": gap.skill_id,
            "skill_name": skill.name if skill is not None else "Notion",
            "subject_slug": subject.slug if subject is not None else None,
            "subject_name": subject.name if subject is not None else None,
            "severity": gap.severity,
            "status": gap.status,
            "first_detected_at": (
                gap.first_detected_at.isoformat() if gap.first_detected_at else None
            ),
        }
        for gap, skill, subject in rows
    ]
    gaps.sort(key=lambda g: (_SEVERITY_RANK.get(g["severity"], 3), g["skill_name"]))
    return gaps


def consolidated_skills(db: Session, *, student_id: int) -> list[dict]:
    """Notions consolidées (`mastered`), la maîtrise la plus haute d'abord."""
    rows = db.execute(
        select(SkillMastery, Skill, Subject)
        .outerjoin(Skill, Skill.id == SkillMastery.skill_id)
        .outerjoin(Subject, Subject.id == Skill.subject_id)
        .where(
            SkillMastery.student_id == student_id,
            SkillMastery.status == MASTERED_STATUS,
        )
    ).all()

    skills = [
        {
            "skill_id": mastery.skill_id,
            "skill_name": skill.name if skill is not None else "Notion",
            "subject_slug": subject.slug if subject is not None else None,
            "subject_name": subject.name if subject is not None else None,
            "mastery_score": round(mastery.mastery_score),
            "last_seen_at": mastery.last_seen_at.isoformat() if mastery.last_seen_at else None,
        }
        for mastery, skill, subject in rows
    ]
    skills.sort(key=lambda s: (-s["mastery_score"], s["skill_name"]))
    return skills


def open_gap_count(db: Session, *, student_id: int) -> int:
    return len(open_gaps(db, student_id=student_id))


def consolidated_count(db: Session, *, student_id: int) -> int:
    return len(consolidated_skills(db, student_id=student_id))
