"""Service du Conseil de classe IA (ADR-0020).

Narration LLM **locale** posée sur le **service d'évidence** (2e consommateur, ADR-0011/0017) :
1. `_build_context` compose l'évidence CALCULÉE (mastery, lacunes, signal quiz, pression SRS) en
   un contexte par matière → notions fragiles ;
2. le LLM (provider local — jamais `curriculum` cloud, données privées de Massimo) narre et
   hiérarchise, sortie **typée** validée dur (patron ADR-0007/0015), une réparation ;
3. `_anchor` revalide chaque `skill_id`/`subject_id` contre l'évidence (garde-fou
   anti-hallucination : le LLM ne peut pas inventer d'identifiant) ;
4. on **fige** l'artefact + l'évidence (`evidence_snapshot_json`) : un rapport LLM n'est pas
   rejouable, l'auditabilité vient du figeage (contraste avec l'élection de mission).

Le pont d'actionnabilité réutilise le flux Commander (ADR-0018) tel quel : une recommandation →
`create_command_missions` (fan-out mono-notion, validées par le clic Papa).
"""

from datetime import datetime, timezone

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    AIJob,
    CouncilReport,
    Skill,
    Subject,
)
from app.modules.ai.provider import LLMProvider, LLMRequest
from app.modules.evidence import service as evidence
from app.modules.missions import command
from app.prompts import council

from app.modules.reports.schemas import CouncilReportSpec, generation_schema

# Bornes de composition : on plafonne les notions fournies au LLM (prompt borné + focus sur les
# plus fragiles). Purement de présentation — l'évidence complète reste calculable.
_MAX_NOTIONS_PER_SUBJECT = 8
_RECENT_VERDICTS = 20


class CouncilGenerationError(Exception):
    """Sortie LLM invalide après réparation, ou erreur provider."""


def _skill_name(db: Session, skill_id: int) -> str:
    skill = db.get(Skill, skill_id)
    return skill.name if skill is not None else f"notion {skill_id}"


def _strip_fences(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1] if "\n" in text else text
        if text.endswith("```"):
            text = text[: -3]
    return text.strip()


def _default_period(db: Session, student) -> str:
    return "Bilan"


def _build_context(db: Session, student, period: str) -> tuple[dict, set[int], set[int]]:
    """Compose l'évidence read-only en un contexte par matière (notions fragiles d'abord)."""
    mastery = evidence.mastery_by_skill(db, student_id=student.id)
    gaps = evidence.open_gaps(db, student_id=student.id)
    weak = evidence.weighted_quiz_signal(db, student_id=student.id)
    srs = evidence.srs_pressure(db, student_id=student.id)
    verdicts = evidence.recent_verdicts(db, student_id=student.id, limit=_RECENT_VERDICTS)

    gap_by_skill = {g["skill_id"]: g for g in gaps}
    candidate_ids = set(mastery) | set(gap_by_skill) | set(weak)

    per_subject: dict[int, list[dict]] = {}
    for skill_id in candidate_ids:
        skill = db.get(Skill, skill_id)
        if skill is None:
            continue
        m = float(mastery.get(skill_id, {}).get("mastery", 0.0))
        per_subject.setdefault(skill.subject_id, []).append(
            {
                "skill_id": skill_id,
                "name": skill.name,
                "mastery": round(m, 2),
                "status": mastery.get(skill_id, {}).get("status"),
                "open_gap": skill_id in gap_by_skill,
                "gap_severity": gap_by_skill.get(skill_id, {}).get("severity"),
                "weak_quiz_signal": round(float(weak[skill_id]), 2) if skill_id in weak else None,
                "_fragility": round(1.0 - m, 2),
            }
        )

    subjects_ctx: list[dict] = []
    allowed_skill_ids: set[int] = set()
    for subject_id, notions in per_subject.items():
        subject = db.get(Subject, subject_id)
        if subject is None:
            continue
        notions.sort(key=lambda n: (-n["_fragility"], n["skill_id"]))
        notions = notions[:_MAX_NOTIONS_PER_SUBJECT]
        for n in notions:
            allowed_skill_ids.add(n["skill_id"])
        s = srs.get(subject_id, {})
        subjects_ctx.append(
            {
                "subject_id": subject_id,
                "subject_name": subject.name,
                "srs_due": int(s.get("due", 0)),
                "srs_max_overdue_days": int(s.get("max_overdue_days", 0)),
                "notions": [{k: v for k, v in n.items() if k != "_fragility"} for n in notions],
            }
        )
    subjects_ctx.sort(key=lambda s: s["subject_id"])

    acquired = sum(1 for v in verdicts if v.get("verdict") == "acquired")
    review_later = sum(1 for v in verdicts if v.get("verdict") == "review_later")
    context = {
        "period": period,
        "note": "Évidence à l'instant (v1 : état courant, pas de fenêtre temporelle).",
        "subjects": subjects_ctx,
        "recent_activity": {
            "verdicts_considered": len(verdicts),
            "acquired": acquired,
            "review_later": review_later,
        },
    }
    allowed_subject_ids = {s["subject_id"] for s in subjects_ctx}
    return context, allowed_subject_ids, allowed_skill_ids


def _try_validate(raw: str) -> tuple[CouncilReportSpec | None, str | None]:
    try:
        return CouncilReportSpec.model_validate_json(_strip_fences(raw)), None
    except ValidationError as exc:
        return None, str(exc)


def _anchor(
    spec: CouncilReportSpec, allowed_subject_ids: set[int], allowed_skill_ids: set[int]
) -> list[dict]:
    """Ne garde que les matières et `skill_id` présents dans l'évidence (anti-hallucination)."""
    out: list[dict] = []
    for s in spec.subjects:
        if s.subject_id not in allowed_subject_ids:
            continue
        recos: list[dict] = []
        for r in s.recommendations:
            ids = [sid for sid in dict.fromkeys(r.skill_ids) if sid in allowed_skill_ids]
            if not ids:
                continue
            recos.append(
                {
                    "skill_ids": ids,
                    "mission_type": "manual",  # v1 : mono-notion via Commander (croisées différées)
                    "template_hint": r.template_hint,
                    "justification": r.justification,
                }
            )
        out.append(
            {
                "subject_id": s.subject_id,
                "subject_name": s.subject_name,
                "strengths": s.strengths,
                "to_reinforce": s.to_reinforce,
                "recent_evolution": s.recent_evolution,
                "recommendations": recos,
            }
        )
    return out


def _to_out(db: Session, report: CouncilReport) -> dict:
    subjects = []
    for s in report.subjects_json or []:
        recos = []
        for r in s.get("recommendations", []):
            skill_ids = r.get("skill_ids", [])
            recos.append(
                {
                    "skill_ids": skill_ids,
                    "skill_names": [_skill_name(db, sid) for sid in skill_ids],
                    "mission_type": r.get("mission_type", "manual"),
                    "template_hint": r.get("template_hint"),
                    "justification": r.get("justification", ""),
                }
            )
        subjects.append(
            {
                "subject_id": s.get("subject_id"),
                "subject_name": s.get("subject_name", ""),
                "strengths": s.get("strengths", ""),
                "to_reinforce": s.get("to_reinforce", ""),
                "recent_evolution": s.get("recent_evolution", ""),
                "recommendations": recos,
            }
        )
    return {
        "id": report.id,
        "period": report.period,
        "global_summary": report.global_summary,
        "subjects": subjects,
        "prompt_version": report.prompt_version,
        "created_at": report.created_at,
    }


def generate_council_report(
    db: Session, student, llm: LLMProvider, *, period: str | None = None
) -> dict:
    """Génère + persiste un rapport figé. 100 % local (`llm` = provider Ollama/MLX)."""
    period = (period or "").strip() or _default_period(db, student)
    context, allowed_subject_ids, allowed_skill_ids = _build_context(db, student, period)

    now = datetime.now(timezone.utc)
    job = AIJob(
        job_type="council_generate",
        status="running",
        input_json={
            "period": period,
            "prompt_version": council.COUNCIL_PROMPT_VERSION,
            "subjects": len(context["subjects"]),
        },
        created_by="parent",
        created_at=now,
        started_at=now,
    )
    db.add(job)
    db.flush()

    if not context["subjects"]:
        # Dégradation gracieuse : aucune évidence → rapport serein, pas d'appel LLM.
        spec_subjects: list[dict] = []
        global_summary = (
            "Pas encore assez de données pour un conseil de classe. Lance quelques activités "
            "avec Massimo, puis reviens : la synthèse s'appuiera sur ses résultats réels."
        )
    else:
        system, prompt = council.build_prompt(context)
        schema = generation_schema()
        try:
            raw = llm.generate(
                LLMRequest(system=system, prompt=prompt, fmt=schema, temperature=0.2)
            ).text
            spec, error = _try_validate(raw)
            if spec is None:
                repair = (
                    f"{prompt}\n\n--- Ta réponse précédente (invalide) ---\n{raw}\n\n"
                    f"{council.REPAIR_INSTRUCTION}{error}"
                )
                raw = llm.generate(
                    LLMRequest(system=system, prompt=repair, fmt=schema, temperature=0.2)
                ).text
                spec, error = _try_validate(raw)
        except Exception as exc:  # provider indisponible / erreur réseau locale
            job.status = "failed"
            job.error_message = str(exc)
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
            raise CouncilGenerationError(str(exc)) from exc

        if spec is None:
            job.status = "failed"
            job.error_message = error
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
            raise CouncilGenerationError(error or "sortie LLM invalide")

        spec_subjects = _anchor(spec, allowed_subject_ids, allowed_skill_ids)
        global_summary = spec.global_summary

    report = CouncilReport(
        student_id=student.id,
        period=period,
        global_summary=global_summary,
        subjects_json=spec_subjects,
        prompt_version=council.COUNCIL_PROMPT_VERSION,
        evidence_snapshot_json=context,
        created_by="ai",
        created_at=datetime.now(timezone.utc),
    )
    db.add(report)
    job.status = "succeeded"
    job.output_json = {"report_subjects": len(spec_subjects)}
    job.finished_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(report)
    return _to_out(db, report)


def list_reports(db: Session, student, *, period: str | None = None) -> list[dict]:
    q = select(CouncilReport).where(CouncilReport.student_id == student.id)
    if period:
        q = q.where(CouncilReport.period == period)
    rows = db.scalars(q.order_by(CouncilReport.created_at.desc(), CouncilReport.id.desc()))
    return [
        {
            "id": r.id,
            "period": r.period,
            "subjects_count": len(r.subjects_json or []),
            "created_at": r.created_at,
        }
        for r in rows
    ]


def get_report(db: Session, student, report_id: int) -> dict:
    report = db.get(CouncilReport, report_id)
    if report is None or report.student_id != student.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Rapport introuvable.")
    return _to_out(db, report)


def create_missions_from_reco(
    db: Session, student, *, skill_ids: list[int], due_date, force_priority: bool
) -> list[dict]:
    """Pont d'actionnabilité (ADR-0020 déc. 6) : recommandation → missions mono-notion via le
    flux Commander (ADR-0018). La validation Papa exigée pour le scolaire = ce clic."""
    return command.create_command_missions(
        db, student, skill_ids=skill_ids, due_date=due_date, force_priority=force_priority
    )


def create_champion_from_reco(db: Session, student, *, skill_ids: list[int], flavor: str) -> dict:
    """Pont d'actionnabilité CROISÉ (ADR-0022 §8) : une recommandation champion → UNE mission
    `champion` multi-matières. La page Conseil a déjà **équipé** chaque notion (boucle `equip_notion`,
    barres par notion) ; ici on ne fait que **composer** (compose-only). Import paresseux → pas de
    cycle reports↔missions."""
    from app.modules.missions import champion, pilot

    mission = champion.compose_champion_mission(db, student, skill_ids=skill_ids, flavor=flavor)
    return pilot._to_pilot_out(db, mission)
