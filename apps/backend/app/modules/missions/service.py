"""Service missions (ADR-0017 lot 1) : parcours de remédiation à PREUVES serveur.

L'étape 15 complétait une mission de façon *déclarative* (« J'ai terminé » → lacune résolue).
Ce lot la remplace :
- chaque étape a une **preuve d'exécution** vérifiée serveur (score reverse, QuizAttempt) —
  jamais la parole du client ; la preuve doit être **postérieure au `start`** et les étapes se
  complètent **dans l'ordre** (`sort_order`) ;
- **compléter ≠ acquérir** : l'XP récompense l'effort (crédité dans tous les cas), le **verdict**
  d'acquisition (mastery/gap/SRS) est calculé à part depuis les scores mesurés (§5bis) ;
- toute mission générée naît `validation_status="pending"` : le gate `validated` vit dans la
  requête des routes student (§5ter) — une mission non validée n'atteint jamais Massimo.

Vocabulaire bienveillant (CLAUDE.md) : « renforcer », « consolidation », jamais d'échec — les
deux issues du verdict sont positives (la machine change, pas le discours)."""

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import (
    Gap,
    LearningEvent,
    LessonSkill,
    Mission,
    MissionStep,
    Quiz,
    QuizAttempt,
    Skill,
    SkillMastery,
    StudentProfile,
    Subject,
)
from app.modules.gamification.service import award_xp
from app.modules.memory.service import interval_from_score, schedule_review

XP_REASON = "mission_remediation"
_PRIORITY_BY_SEVERITY = {"high": 2, "medium": 1, "low": 0}
_ACTIVE_STATUSES = ("planned", "active")
_OPEN_GAP_STATUSES = ("open", "in_progress")

# Étapes déterministes du parcours remediation (ADR-0017 §5). `step_type` aligné sur l'ADR /
# DATA_MODEL (eli5/vocal_explain/quiz) ; chaque étape porte sa cible dans `resource_id`.
STEP_ELI5 = "eli5"
STEP_VOCAL = "vocal_explain"
STEP_QUIZ = "quiz"
STEP_LESSON = "lesson"
_CONSULT_STEPS = (STEP_ELI5, STEP_LESSON)


# --- Cibles réelles des étapes ------------------------------------------------------------


def _resolve_mission_quiz_id(db: Session, skill_id: int | None) -> int | None:
    """Un quiz de mission déjà PRÊT couvrant la notion (via la leçon qui la porte), sinon None.

    Lot 1 « réutiliser sinon dégrader » (décision de session) : on ne génère PAS de quiz ici
    (le moteur ADR-0014 est verrouillé à une leçon validée + LLM). Sans quiz réutilisable,
    l'étape quiz est omise → la mission a 2 étapes et son verdict est `review_later` par défaut
    (la notion revient via SRS). L'auto-génération relève du Lot 2."""
    if skill_id is None:
        return None
    return db.scalar(
        select(Quiz.id)
        .join(LessonSkill, LessonSkill.lesson_id == Quiz.lesson_id)
        .where(
            Quiz.quiz_type == "mission",
            Quiz.status == "ready",
            LessonSkill.skill_id == skill_id,
        )
        .order_by(Quiz.id.desc())
        .limit(1)
    )


def _build_steps(db: Session, skill_id: int | None, skill_name: str) -> list[tuple[str, str, int | None]]:
    """(step_type, instruction, resource_id) — parcours expliquer → réexpliquer → vérifier."""
    steps: list[tuple[str, str, int | None]] = [
        (STEP_ELI5, f"Demande à ZETIS de t'expliquer « {skill_name} » (ELI5).", skill_id),
        (STEP_VOCAL, f"Réexplique « {skill_name} » avec tes mots à ZETIS.", skill_id),
    ]
    quiz_id = _resolve_mission_quiz_id(db, skill_id)
    if quiz_id is not None:
        steps.append(
            (STEP_QUIZ, f"Refais un petit quiz sur « {skill_name} » pour vérifier.", quiz_id)
        )
    return steps


def _skill_name(db: Session, skill_id: int | None) -> str:
    if skill_id is None:
        return "Notion"
    skill = db.get(Skill, skill_id)
    return skill.name if skill is not None else "Notion"


# --- Sérialisation (schéma student ; aucun champ analytique) -------------------------------


def _to_out(db: Session, mission: Mission) -> dict:
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
                "resource_id": s.resource_id,
                "sort_order": s.sort_order,
                "status": s.status,
            }
            for s in steps
        ],
    }


# --- Génération (idempotente, pure DB) -----------------------------------------------------


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

    Idempotent (une lacune déjà couverte n'en recrée pas). Les missions naissent
    `validation_status="pending"` : Papa les valide avant qu'elles atteignent Massimo (§5ter)."""
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
            validation_status="pending",
            priority=_PRIORITY_BY_SEVERITY.get(gap.severity, 1),
            created_by="ai",
        )
        db.add(mission)
        db.flush()
        for index, (step_type, instruction, resource_id) in enumerate(
            _build_steps(db, gap.skill_id, skill_name)
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
    return [_to_out(db, m) for m in created]


# --- Lecture student (gate `validated` DANS la requête, §5ter) -----------------------------


def list_missions(db: Session, student: StudentProfile) -> list[dict]:
    missions = list(
        db.scalars(
            select(Mission)
            .where(
                Mission.student_id == student.id,
                Mission.validation_status == "validated",
            )
            .order_by(Mission.status, Mission.priority.desc(), Mission.id.desc())
        )
    )
    return [_to_out(db, m) for m in missions]


def today_missions(db: Session, student: StudentProfile, limit: int = 5) -> list[dict]:
    """Missions à faire (planned/active) validées, les plus prioritaires d'abord."""
    missions = list(
        db.scalars(
            select(Mission)
            .where(
                Mission.student_id == student.id,
                Mission.validation_status == "validated",
                Mission.status.in_(_ACTIVE_STATUSES),
            )
            .order_by(Mission.priority.desc(), Mission.id)
            .limit(limit)
        )
    )
    return [_to_out(db, m) for m in missions]


# --- Exécution : start + complete-step -----------------------------------------------------


def _servable_mission_or_404(db: Session, student: StudentProfile, mission_id: int) -> Mission:
    """La mission de l'élève, validée. Une mission `pending` est invisible même par id (§5ter)."""
    mission = db.get(Mission, mission_id)
    if (
        mission is None
        or mission.student_id != student.id
        or mission.validation_status != "validated"
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Mission introuvable.")
    return mission


def start_mission(db: Session, student: StudentProfile, mission_id: int) -> dict:
    """planned → active + horodatage `started_at`. Idempotent (rejouer ne réinitialise rien)."""
    mission = _servable_mission_or_404(db, student, mission_id)
    if mission.status == "planned":
        mission.status = "active"
        mission.started_at = datetime.now(timezone.utc)
        db.commit()
    return _to_out(db, mission)


def _reverse_score_after(
    db: Session, *, student_id: int, skill_id: int | None, after: datetime
) -> int | None:
    """Score du dernier reverse ELI5 de la notion POSTÉRIEUR à `after` (trace LearningEvent)."""
    if skill_id is None:
        return None
    event = db.scalar(
        select(LearningEvent)
        .where(
            LearningEvent.student_id == student_id,
            LearningEvent.skill_id == skill_id,
            LearningEvent.event_type == "reverse_eli5",
            LearningEvent.created_at > after,
        )
        .order_by(LearningEvent.created_at.desc())
        .limit(1)
    )
    if event is None or not event.payload_json:
        return None
    value = event.payload_json.get("score")
    return int(value) if value is not None else None


def _quiz_score_after(
    db: Session, *, student_id: int, quiz_id: int | None, after: datetime
) -> float | None:
    """Score de la dernière QuizAttempt `context=mission` terminée pour ce quiz, après `after`."""
    if quiz_id is None:
        return None
    attempt = db.scalar(
        select(QuizAttempt)
        .where(
            QuizAttempt.student_id == student_id,
            QuizAttempt.quiz_id == quiz_id,
            QuizAttempt.context == "mission",
            QuizAttempt.completed_at.is_not(None),
            QuizAttempt.started_at > after,
        )
        .order_by(QuizAttempt.completed_at.desc())
        .limit(1)
    )
    return attempt.score_percent if attempt is not None else None


def _verify_proof(
    db: Session, student: StudentProfile, mission: Mission, step: MissionStep, started: datetime
) -> None:
    """Refuse 409 si la preuve d'exécution de l'étape est absente (le serveur ne croit pas le client)."""
    if step.step_type in _CONSULT_STEPS:
        # Consultation : acceptée, mais tracée (auditabilité de la complétion).
        db.add(
            LearningEvent(
                student_id=student.id,
                subject_id=mission.subject_id,
                skill_id=mission.skill_id,
                event_type="mission_step_view",
                payload_json={"step_id": step.id, "step_type": step.step_type},
                created_at=datetime.now(timezone.utc),
            )
        )
        return
    if step.step_type == STEP_VOCAL:
        skill_id = step.resource_id if step.resource_id is not None else mission.skill_id
        if _reverse_score_after(db, student_id=student.id, skill_id=skill_id, after=started) is None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="Réexplique d'abord la notion à ZETIS pour valider cette étape.",
            )
        return
    if step.step_type == STEP_QUIZ:
        if (
            _quiz_score_after(db, student_id=student.id, quiz_id=step.resource_id, after=started)
            is None
        ):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="Fais d'abord le quiz de la mission pour valider cette étape.",
            )
        return
    raise HTTPException(
        status.HTTP_409_CONFLICT, detail="Type d'étape non pris en charge."
    )


def complete_step(db: Session, student: StudentProfile, mission_id: int, step_id: int) -> dict:
    """Valide une étape si sa preuve existe (postérieure au start) et dans l'ordre. La dernière
    étape déclenche la complétion de la mission (verdict + XP)."""
    mission = _servable_mission_or_404(db, student, mission_id)
    if mission.status != "active":
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Démarre la mission avant de valider une étape."
        )
    step = db.get(MissionStep, step_id)
    if step is None or step.mission_id != mission.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Étape introuvable.")

    # Ordre : aucune étape précédente ne peut rester non terminée.
    earlier_open = db.scalar(
        select(MissionStep.id).where(
            MissionStep.mission_id == mission.id,
            MissionStep.sort_order < step.sort_order,
            MissionStep.status != "done",
        )
    )
    if earlier_open is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Termine d'abord les étapes précédentes."
        )

    if step.status == "done":  # idempotent : pas de double crédit
        return {"mission_status": mission.status, "verdict": None, "xp_awarded": 0}

    started = mission.started_at or mission.created_at or datetime.now(timezone.utc)
    _verify_proof(db, student, mission, step, started)
    step.status = "done"
    db.flush()  # rendre le « done » visible à la requête `remaining` (autoflush non garanti)

    remaining = db.scalar(
        select(MissionStep.id).where(
            MissionStep.mission_id == mission.id, MissionStep.status != "done"
        )
    )
    if remaining is not None:
        db.commit()
        return {"mission_status": mission.status, "verdict": None, "xp_awarded": 0}

    return _complete_mission(db, student, mission, started)


# --- Complétion + verdict d'acquisition (§5bis) --------------------------------------------


def _apply_verdict(
    db: Session,
    student: StudentProfile,
    mission: Mission,
    verdict: str,
    reverse_score: int | None,
) -> None:
    """Met à jour mastery / lacune / SRS selon le verdict. `acquired` ne baisse jamais la mastery."""
    now = datetime.now(timezone.utc)
    measured = float(reverse_score) if reverse_score is not None else 0.0
    mastery = db.scalar(
        select(SkillMastery).where(
            SkillMastery.student_id == student.id, SkillMastery.skill_id == mission.skill_id
        )
    )
    if mastery is None:
        mastery = SkillMastery(student_id=student.id, skill_id=mission.skill_id)
        db.add(mastery)
    gap = db.scalar(
        select(Gap).where(
            Gap.student_id == student.id,
            Gap.skill_id == mission.skill_id,
            Gap.status.in_(_OPEN_GAP_STATUSES),
        )
    )
    mastery.last_seen_at = now
    if verdict == "acquired":
        mastery.mastery_score = max(mastery.mastery_score or 0.0, measured)
        mastery.confidence_score = max(mastery.confidence_score or 0.0, measured)
        mastery.status = "mastered"
        if gap is not None:
            gap.status = "resolved"
    else:
        # review_later : mastery mise à jour honnêtement, lacune rouverte en cours, et la notion
        # revient d'elle-même via une carte SRS (la boucle qui vérifie l'acquisition dans le temps).
        mastery.mastery_score = measured
        mastery.confidence_score = measured
        mastery.status = "in_progress"
        if gap is not None:
            gap.status = "in_progress"
        skill_name = _skill_name(db, mission.skill_id)
        schedule_review(
            db,
            student_id=student.id,
            skill_id=mission.skill_id,
            interval=interval_from_score(int(measured)),
            front=f"Réexplique : {skill_name}",
            back="Reprends cette notion tranquillement — tu y reviens bientôt.",
        )


def _complete_mission(
    db: Session, student: StudentProfile, mission: Mission, started: datetime
) -> dict:
    """Termine la mission : XP inconditionnel + verdict d'acquisition depuis les scores mesurés."""
    mission.status = "completed"
    for step in db.scalars(select(MissionStep).where(MissionStep.mission_id == mission.id)):
        step.status = "done"

    reverse_score = _reverse_score_after(
        db, student_id=student.id, skill_id=mission.skill_id, after=started
    )
    quiz_step = db.scalar(
        select(MissionStep).where(
            MissionStep.mission_id == mission.id, MissionStep.step_type == STEP_QUIZ
        )
    )
    quiz_score = (
        _quiz_score_after(db, student_id=student.id, quiz_id=quiz_step.resource_id, after=started)
        if quiz_step is not None
        else None
    )
    acquired = (
        reverse_score is not None
        and reverse_score >= settings.mission_reverse_threshold
        and quiz_score is not None
        and quiz_score >= settings.mission_quiz_threshold
    )
    verdict = "acquired" if acquired else "review_later"

    if mission.skill_id is not None:
        _apply_verdict(db, student, mission, verdict, reverse_score)

    # XP = effort (inconditionnel, quel que soit le verdict — règle XP de DATA_MODEL.md).
    award_xp(
        db,
        student_id=student.id,
        subject_id=mission.subject_id,
        amount=settings.mission_xp_reward,
        reason=XP_REASON,
    )
    db.commit()
    return {
        "mission_status": mission.status,
        "verdict": verdict,
        "xp_awarded": settings.mission_xp_reward,
    }


# --- Validation Papa minimale (§5ter ; pilotage complet = Lot 2) ---------------------------


def validate_missions(db: Session, mission_ids: list[int]) -> dict:
    """Passe les missions `pending` en `validated` (validation en lot Papa). Idempotent."""
    updated = 0
    for mission_id in mission_ids:
        mission = db.get(Mission, mission_id)
        if mission is not None and mission.validation_status == "pending":
            mission.validation_status = "validated"
            updated += 1
    db.commit()
    return {"validated": updated}
