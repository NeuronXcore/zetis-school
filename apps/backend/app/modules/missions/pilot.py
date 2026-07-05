"""Pilotage Papa des missions (ADR-0017 lot 2) — frontière analytique `MissionPilotOut`.

Sur-ensemble de la vue student : `validation_status`, `generation_reason` (calculé, jamais
stocké — cohérent avec « rien à stocker »), preuves par étape avec **valeurs brutes**. Lecture
seule sauf `reject`/`validate`. L'élection est **recalculée** à la demande (déterminisme).
"""

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Gap, Mission, MissionStep, Skill, Subject
from app.modules.evidence import service as evidence
from app.modules.missions import selector
from app.modules.missions import service as msvc

_SEVERITY_LABEL = {"high": "élevée", "medium": "moyenne", "low": "faible"}


# --- Preuves & motif de génération (calculés) ----------------------------------------------


def _proof_for_step(db: Session, mission: Mission, step: MissionStep, started: datetime | None) -> dict:
    if step.step_type in msvc._CONSULT_STEPS:
        return {"label": "Consultation", "value": None, "satisfied": step.status == "done"}
    if step.step_type == msvc.STEP_VOCAL:
        value = (
            msvc._reverse_score_after(
                db,
                student_id=mission.student_id,
                skill_id=step.resource_id if step.resource_id is not None else mission.skill_id,
                after=started,
            )
            if started is not None
            else None
        )
        return {"label": "Reverse", "value": None if value is None else float(value), "satisfied": value is not None}
    if step.step_type == msvc.STEP_QUIZ:
        value = (
            msvc._quiz_score_after(
                db, student_id=mission.student_id, quiz_id=step.resource_id, after=started
            )
            if started is not None
            else None
        )
        return {"label": "Quiz", "value": value, "satisfied": value is not None}
    return {"label": step.step_type, "value": None, "satisfied": step.status == "done"}


def _generation_reason(db: Session, mission: Mission) -> str:
    if mission.mission_type == "remediation" and mission.skill_id is not None:
        gap = db.scalar(
            select(Gap).where(
                Gap.student_id == mission.student_id,
                Gap.skill_id == mission.skill_id,
                Gap.status.in_(("open", "in_progress")),
            )
        )
        sev = _SEVERITY_LABEL.get(gap.severity, gap.severity) if gap is not None else "?"
        return f"Lacune (sévérité {sev})"
    if mission.mission_type == "revision" and mission.subject_id is not None:
        due = evidence.srs_pressure(db, student_id=mission.student_id).get(mission.subject_id, {})
        return f"{due.get('due', 0)} carte(s) à revoir"
    if mission.mission_type == "progression":
        in_chapter = mission.skill_id in selector._active_chapter_skills(db, mission.student_id)
        return "Prochaine notion du programme" if in_chapter else "Rattrapage jamais travaillé"
    if mission.mission_type == "manual":
        return "Commandée par Papa"
    return ""


def _to_pilot_out(db: Session, mission: Mission) -> dict:
    subject = db.get(Subject, mission.subject_id) if mission.subject_id is not None else None
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
        "subject_id": mission.subject_id,
        "skill_id": mission.skill_id,
        "skill_name": msvc._skill_name(db, mission.skill_id),
        "title": mission.title,
        "description": mission.description,
        "mission_type": mission.mission_type,
        "status": mission.status,
        "validation_status": mission.validation_status,
        "priority": mission.priority,
        "created_by": mission.created_by,
        "generation_reason": _generation_reason(db, mission),
        "steps": [
            {
                "id": s.id,
                "step_type": s.step_type,
                "instruction": s.instruction,
                "resource_id": s.resource_id,
                "sort_order": s.sort_order,
                "status": s.status,
                "proof": _proof_for_step(db, mission, s, mission.started_at),
            }
            for s in steps
        ],
    }


# --- Files de pilotage ---------------------------------------------------------------------


def pending(db: Session, student) -> list[dict]:
    """Missions `pending` (la seule zone qui attend Papa), avec leur motif de génération."""
    missions = db.scalars(
        select(Mission)
        .where(Mission.student_id == student.id, Mission.validation_status == "pending")
        .order_by(Mission.id.desc())
    )
    return [_to_pilot_out(db, m) for m in missions]


def pilot_list(
    db: Session, student, *, mission_type: str | None = None, subject: str | None = None
) -> list[dict]:
    """« En cours & planifiées » (validées, planned|active), filtrables par type et matière."""
    query = select(Mission).where(
        Mission.student_id == student.id,
        Mission.validation_status == "validated",
        Mission.status.in_(("planned", "active")),
    )
    if mission_type:
        query = query.where(Mission.mission_type == mission_type)
    if subject:
        subj = db.scalar(select(Subject).where(Subject.slug == subject))
        query = query.where(Mission.subject_id == (subj.id if subj is not None else -1))
    missions = db.scalars(query.order_by(Mission.priority.desc(), Mission.id))
    return [_to_pilot_out(db, m) for m in missions]


def reject(db: Session, student, mission_id: int) -> dict:
    """Rejet à l'unité : `validation_status = rejected` (ne peut plus atteindre Massimo)."""
    mission = db.get(Mission, mission_id)
    if mission is None or mission.student_id != student.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Mission introuvable.")
    mission.validation_status = "rejected"
    db.commit()
    return {"id": mission.id, "validation_status": mission.validation_status}


def election_today(db: Session, student) -> dict:
    """Recalcule l'élection et l'expose côté Papa : élue + facteurs + alternatives + version."""
    result = selector.elect(db, student)
    elected = result["elected"]
    reason, reason_code = selector.reason_for(elected)
    if elected is None:
        return {
            "elected": None,
            "score": None,
            "factors": [],
            "scoring_version": result["scoring_version"],
            "reason": reason,
            "reason_code": reason_code,
            "alternatives": [],
        }
    factors = [
        {
            "name": f.name,
            "value": f.value,
            "weight": f.weight,
            "contribution": f.contribution,
            "dominant": f.name == elected.reason_code,
        }
        for f in elected.factors
    ]
    return {
        "elected": _to_pilot_out(db, elected.mission),
        "score": elected.score,
        "factors": factors,
        "scoring_version": result["scoring_version"],
        "reason": reason,
        "reason_code": reason_code,
        "alternatives": [
            {"mission": _to_pilot_out(db, alt.mission), "score": alt.score}
            for alt in result["alternatives"]
        ],
    }


def verdicts_recent(db: Session, student, limit: int = 20) -> list[dict]:
    rows = evidence.recent_verdicts(db, student_id=student.id, limit=limit)
    return [
        {
            "mission_id": r.get("mission_id"),
            "mission_type": r.get("mission_type"),
            "verdict": r.get("verdict"),
            "quiz_score": r.get("quiz_score"),
            "reverse_score": r.get("reverse_score"),
            "xp": r.get("xp"),
            "effect": r.get("effect"),
            "skill_id": r.get("skill_id"),
            "subject_id": r.get("subject_id"),
        }
        for r in rows
    ]


def pilot_summary(db: Session, student) -> dict:
    """KPI : à valider · pool · terminées cette semaine · % verdicts « acquise » (30 j)."""
    pending_count = (
        db.scalar(
            select(func.count())
            .select_from(Mission)
            .where(Mission.student_id == student.id, Mission.validation_status == "pending")
        )
        or 0
    )
    pool_count = (
        db.scalar(
            select(func.count())
            .select_from(Mission)
            .where(
                Mission.student_id == student.id,
                Mission.validation_status == "validated",
                Mission.status.in_(("planned", "active")),
            )
        )
        or 0
    )
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    completed_week = (
        db.scalar(
            select(func.count())
            .select_from(Mission)
            .where(
                Mission.student_id == student.id,
                Mission.status == "completed",
                Mission.updated_at >= week_ago,
            )
        )
        or 0
    )
    verdicts = [
        v
        for v in evidence.recent_verdicts(db, student_id=student.id, limit=200)
        if v.get("at") is not None and v["at"] >= now - timedelta(days=30)
    ]
    acquired = sum(1 for v in verdicts if v.get("verdict") == "acquired")
    rate = round(acquired / len(verdicts), 2) if verdicts else 0.0
    return {
        "pending": pending_count,
        "pool": pool_count,
        "completed_this_week": completed_week,
        "acquired_rate_30d": rate,
    }
