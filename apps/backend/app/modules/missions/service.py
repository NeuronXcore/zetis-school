"""Service missions : transforme les lacunes (gaps) du diagnostic en missions de
remédiation, et gère leur complétion (lacune résolue + XP).

Vocabulaire bienveillant (CLAUDE.md) : « renforcer », « consolidation », jamais
d'échec. Les étapes suivent la pédagogie ZETIS : expliquer → réexpliquer → vérifier."""

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    Gap,
    Mission,
    MissionStep,
    Skill,
    StudentProfile,
    Subject,
    XPEvent,
)

XP_REMEDIATION = 20
_PRIORITY_BY_SEVERITY = {"high": 2, "medium": 1, "low": 0}
_ACTIVE_STATUSES = ("planned", "active")


def _steps_for_skill(skill_name: str) -> list[tuple[str, str]]:
    return [
        ("explain", f"Demande à ZETIS de t'expliquer « {skill_name} » (ELI5)."),
        ("reverse", f"Réexplique « {skill_name} » avec tes mots à ZETIS."),
        ("quiz", f"Refais un petit quiz sur « {skill_name} » pour vérifier."),
    ]


def _skill_name(db: Session, skill_id: int | None) -> str:
    if skill_id is None:
        return "Notion"
    skill = db.get(Skill, skill_id)
    return skill.name if skill is not None else "Notion"


def _to_out(db: Session, mission: Mission) -> dict:
    subject = db.get(Subject, mission.subject_id)
    steps = list(
        db.scalars(
            select(MissionStep)
            .where(MissionStep.mission_id == mission.id)
            .order_by(MissionStep.sort_order)
        )
    )
    return {
        "id": mission.id,
        "subject": subject.name if subject is not None else "",
        "skill_id": mission.skill_id,
        "skill_name": _skill_name(db, mission.skill_id),
        "title": mission.title,
        "description": mission.description,
        "mission_type": mission.mission_type,
        "status": mission.status,
        "priority": mission.priority,
        "steps": [
            {
                "id": s.id,
                "step_type": s.step_type,
                "instruction": s.instruction,
                "sort_order": s.sort_order,
                "status": s.status,
            }
            for s in steps
        ],
    }


def _has_active_remediation(db: Session, *, student_id: int, skill_id: int | None) -> bool:
    return bool(
        db.scalar(
            select(Mission.id).where(
                Mission.student_id == student_id,
                Mission.skill_id == skill_id,
                Mission.mission_type == "remediation",
                Mission.status.in_(_ACTIVE_STATUSES),
            )
        )
    )


def generate_remediation(db: Session, student: StudentProfile) -> list[dict]:
    """Crée une mission de remédiation par lacune ouverte sans mission active.

    Idempotent : relancer ne recrée pas de mission pour une lacune déjà couverte."""
    open_gaps = list(
        db.scalars(
            select(Gap)
            .where(Gap.student_id == student.id, Gap.status == "open")
            .order_by(Gap.id)
        )
    )
    created: list[Mission] = []
    for gap in open_gaps:
        if _has_active_remediation(db, student_id=student.id, skill_id=gap.skill_id):
            continue
        skill_name = _skill_name(db, gap.skill_id)
        mission = Mission(
            student_id=student.id,
            subject_id=gap.subject_id,
            skill_id=gap.skill_id,
            title=f"Renforcer : {skill_name}",
            description=f"Mission de consolidation sur « {skill_name} ».",
            mission_type="remediation",
            status="planned",
            priority=_PRIORITY_BY_SEVERITY.get(gap.severity, 1),
            created_by="ai",
        )
        db.add(mission)
        db.flush()
        for index, (step_type, instruction) in enumerate(_steps_for_skill(skill_name)):
            db.add(
                MissionStep(
                    mission_id=mission.id,
                    step_type=step_type,
                    instruction=instruction,
                    sort_order=index,
                    status="pending",
                )
            )
        created.append(mission)
    db.commit()
    return [_to_out(db, m) for m in created]


def list_missions(db: Session, student: StudentProfile) -> list[dict]:
    missions = list(
        db.scalars(
            select(Mission)
            .where(Mission.student_id == student.id)
            .order_by(Mission.status, Mission.priority.desc(), Mission.id.desc())
        )
    )
    return [_to_out(db, m) for m in missions]


def today_missions(db: Session, student: StudentProfile, limit: int = 5) -> list[dict]:
    """Missions à faire (planned/active), les plus prioritaires d'abord."""
    missions = list(
        db.scalars(
            select(Mission)
            .where(
                Mission.student_id == student.id,
                Mission.status.in_(_ACTIVE_STATUSES),
            )
            .order_by(Mission.priority.desc(), Mission.id)
            .limit(limit)
        )
    )
    return [_to_out(db, m) for m in missions]


def complete_mission(db: Session, student: StudentProfile, mission_id: int) -> dict:
    """Termine une mission : étapes faites, lacune liée résolue, XP crédité."""
    mission = db.get(Mission, mission_id)
    if mission is None or mission.student_id != student.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mission introuvable.")

    mission.status = "completed"
    for step in db.scalars(select(MissionStep).where(MissionStep.mission_id == mission.id)):
        step.status = "done"

    gap_resolved = False
    if mission.skill_id is not None:
        gap = db.scalar(
            select(Gap).where(
                Gap.student_id == student.id,
                Gap.skill_id == mission.skill_id,
                Gap.status == "open",
            )
        )
        if gap is not None:
            gap.status = "resolved"
            gap_resolved = True

    db.add(
        XPEvent(
            student_id=student.id,
            subject_id=mission.subject_id,
            amount=XP_REMEDIATION,
            reason="mission_remediation",
            created_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    return {
        "id": mission.id,
        "status": mission.status,
        "gap_resolved": gap_resolved,
        "xp_awarded": XP_REMEDIATION,
    }
