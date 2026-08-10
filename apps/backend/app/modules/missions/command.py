"""Commander une mission (ADR-0018) — Papa apporte le scope, ZETIS résout les notions.

Deux temps, patron preview/confirm sans état (ADR-0010) :
- `preview` résout un chapitre en ses notions, avec fragilité mesurée (`1 − mastery`, service
  d'évidence read-only), et propose cochées celles à travailler (décoché si maîtrisé) — **rien en
  base** ;
- `confirm` crée **une mission `manual` mono-skill par notion cochée** (fan-out atomique, plafond
  `MISSION_COMMAND_MAX_SKILLS`), `validated` par construction (5ter), via le moteur d'étapes
  déterministe partagé (`eli5 → vocal_explain → quiz`).

La `due_date` est purement informationnelle (pilotage Papa) ; l'urgence passe par `force_priority`.
Une mission = une notion : parcours, verdict (par skill) et atome ~15 min sont définis par notion
dans l'ADR-0017 — une mission composite les casserait.
"""

from datetime import date

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Chapter, Mission, MissionStep, Skill
from app.modules.evidence import service as evidence
# La traversée chapitre → notions vit dans le résolveur NEUTRE (ADR-0049) : `memory` en a besoin
# aussi, et `memory → missions` inverserait la couche (cycle d'import, `missions.service` importe
# déjà `memory.service`). Elle était définie ici jusqu'au 2026-08-10.
from app.modules.lesson_resolution import ordered_chapter_skill_ids
from app.modules.missions import pilot
from app.modules.missions import service as msvc


def resolve_chapter_notions(db: Session, student, chapter_id: int) -> dict:
    """Preview : résout un chapitre en notions fragiles, sans rien écrire (ADR-0018 déc. 2/3)."""
    chapter = db.get(Chapter, chapter_id)
    if chapter is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Chapitre introuvable.")

    mastery = evidence.mastery_by_skill(db, student_id=student.id)
    threshold = settings.mission_command_mastered_threshold
    max_skills = settings.mission_command_max_skills

    notions = []
    for skill_id in ordered_chapter_skill_ids(db, chapter_id):
        skill = db.get(Skill, skill_id)
        if skill is None:
            continue
        m = float(mastery.get(skill_id, {}).get("mastery", 0.0))
        notions.append(
            {
                "skill_id": skill_id,
                "name": skill.name,
                "level": skill.level,
                "mastery": round(m, 2),
                "fragility": round(1.0 - m, 2),
                "checked": False,  # rempli après tri
            }
        )

    # Classement par fragilité décroissante (les plus faibles d'abord — ADR-0018 déc. 3).
    notions.sort(key=lambda n: (-n["fragility"], n["skill_id"]))
    # Proposé coché : non maîtrisé, dans la limite du plafond (les plus fragiles).
    checked_count = 0
    for n in notions:
        if n["mastery"] < threshold and checked_count < max_skills:
            n["checked"] = True
            checked_count += 1

    if checked_count == 0:
        note = "Aucune notion à travailler dans ce scope — cochez-en une ou changez de chapitre."
    else:
        plural = "s" if checked_count > 1 else ""
        note = f"ZETIS composera {checked_count} mission{plural} courte{plural}, ~15 min chacune."

    return {"scope_label": chapter.name, "notions": notions, "compose_note": note}


def create_command_missions(
    db: Session,
    student,
    *,
    skill_ids: list[int],
    due_date: date | None,
    force_priority: bool,
) -> list[dict]:
    """Confirm : une mission `manual` mono-skill par notion cochée (fan-out atomique, ADR-0018)."""
    max_skills = settings.mission_command_max_skills
    unique_ids = list(dict.fromkeys(skill_ids))  # dédoublonne en préservant l'ordre
    if not unique_ids:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Aucune notion cochée.")
    if len(unique_ids) > max_skills:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Au plus {max_skills} notions par commande.",
        )

    created: list[Mission] = []
    for skill_id in unique_ids:
        skill = db.get(Skill, skill_id)
        if skill is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, detail=f"Notion {skill_id} introuvable."
            )
        skill_name = skill.name
        mission = Mission(
            student_id=student.id,
            subject_id=skill.subject_id,
            skill_id=skill_id,
            title=f"Travailler : {skill_name}",
            description=f"Mission commandée par Papa sur « {skill_name} ».",
            mission_type="manual",
            status="planned",
            # Validée PAR CONSTRUCTION (5ter) : le preview/confirm avec notions décochables EST
            # l'approbation humaine — la mission ne transite pas par la file « À valider ».
            validation_status="validated",
            priority=2 if force_priority else 1,
            created_by="parent",
            force_priority=force_priority,
            due_date=due_date,
        )
        db.add(mission)
        db.flush()
        for index, (step_type, instruction, resource_id) in enumerate(
            msvc._build_steps(db, skill_id, skill_name)
        ):
            db.add(
                MissionStep(
                    mission_id=mission.id,
                    step_type=step_type,
                    instruction=instruction,
                    resource_id=resource_id,
                    sort_order=index,
                    status="pending",
                )
            )
        created.append(mission)

    db.commit()
    return [pilot._to_pilot_out(db, m) for m in created]
