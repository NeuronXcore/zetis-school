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

from collections.abc import Sequence
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import (
    Chapter,
    Gap,
    LearningEvent,
    Lesson,
    LessonSkill,
    Mindmap,
    MindmapAttempt,
    Mission,
    MissionStep,
    Quiz,
    QuizAttempt,
    SchoolYear,
    SchoolYearSubject,
    Skill,
    SkillMastery,
    SpacedReviewCard,
    StudentProfile,
    Subject,
)
from app.modules.gamification.service import award_xp
from app.modules.memory.service import interval_from_score, schedule_review
from app.modules.progress.mastery import record_mastery_transition
from app.modules.progress.service import OPEN_GAP_STATUSES

# Notions considérées « en place » (ne relancent pas de progression). Aligné sur les paliers
# de mastery (`_status_from_score` d'ADR-0014 : mastered ≥ 90, solid ≥ 70).
_MASTERED_STATUSES = ("mastered", "solid")

XP_REASON = "mission_remediation"
XP_REASON_CHAMPION = "mission_champion"  # XP majoré d'un défi croisé (ADR-0022) + badge Champion
_PRIORITY_BY_SEVERITY = {"high": 2, "medium": 1, "low": 0}
_ACTIVE_STATUSES = ("planned", "active")
# Importée de `progress` : source UNIQUE de « lacune ouverte » (elle vivait ici en double).
_OPEN_GAP_STATUSES = OPEN_GAP_STATUSES

# Étapes déterministes du parcours remediation (ADR-0017 §5). `step_type` aligné sur l'ADR /
# DATA_MODEL (eli5/vocal_explain/quiz) ; chaque étape porte sa cible dans `resource_id`.
STEP_ELI5 = "eli5"
STEP_VOCAL = "vocal_explain"
STEP_QUIZ = "quiz"
STEP_LESSON = "lesson"
STEP_MINDMAP = "mindmap"  # reconstruction de carte mentale (ADR-0019) — step scoré, pas consultation
_CONSULT_STEPS = (STEP_ELI5, STEP_LESSON)

# Durée estimée par type d'étape (minutes) — déterministe, purement indicative (affichage enfant).
# Pas une donnée pédagogique : une addition d'ordres de grandeur pour situer l'effort.
_STEP_MINUTES = {STEP_LESSON: 5, STEP_ELI5: 5, STEP_VOCAL: 5, STEP_MINDMAP: 6, STEP_QUIZ: 4}


# --- Cibles réelles des étapes ------------------------------------------------------------


# ⚠️ Les versions ENSEMBLISTES sont les seules à porter la requête ; les versions mono en sont
# des enveloppes. C'est l'inverse de l'écriture naturelle, et c'est délibéré : la page matière
# (addendum ADR-0024) résout la panoplie de N notions d'un coup, et deux requêtes rédigées
# séparément divergeraient au premier correctif — le mal exact que le prédicat partagé existe
# pour empêcher. Une règle, une requête, deux granularités d'appel.


def _resolve_mission_quiz_ids(db: Session, skill_ids: Sequence[int]) -> dict[int, int]:
    """`skill_id` → id du quiz de mission PRÊT le plus récent, pour un lot de notions.

    Une seule requête quel que soit le nombre de notions. `MAX(Quiz.id)` groupé par notion
    reproduit exactement l'`ORDER BY id DESC LIMIT 1` de la version mono (l'id le plus grand
    est le plus récent), y compris quand la jointure duplique les lignes."""
    ids = [s for s in skill_ids if s is not None]
    if not ids:
        return {}
    rows = db.execute(
        select(LessonSkill.skill_id, func.max(Quiz.id))
        .join(Quiz, Quiz.lesson_id == LessonSkill.lesson_id)
        .where(
            Quiz.quiz_type == "mission",
            Quiz.status == "ready",
            LessonSkill.skill_id.in_(ids),
        )
        .group_by(LessonSkill.skill_id)
    ).all()
    return {skill_id: quiz_id for skill_id, quiz_id in rows if quiz_id is not None}


def _resolve_mission_quiz_id(db: Session, skill_id: int | None) -> int | None:
    """Un quiz de mission déjà PRÊT couvrant la notion (via la leçon qui la porte), sinon None.

    Lot 1 « réutiliser sinon dégrader » (décision de session) : on ne génère PAS de quiz ici
    (le moteur ADR-0014 est verrouillé à une leçon validée + LLM). Sans quiz réutilisable,
    l'étape quiz est omise → la mission a 2 étapes et son verdict est `review_later` par défaut
    (la notion revient via SRS). L'auto-génération relève du Lot 2."""
    if skill_id is None:
        return None
    return _resolve_mission_quiz_ids(db, [skill_id]).get(skill_id)


def _resolve_mission_mindmap_ids(db: Session, skill_ids: Sequence[int]) -> dict[int, int]:
    """`skill_id` → id de la mindmap VALIDÉE la plus récente, pour un lot de notions.

    Même construction (et même justification) que `_resolve_mission_quiz_ids`."""
    ids = [s for s in skill_ids if s is not None]
    if not ids:
        return {}
    rows = db.execute(
        select(LessonSkill.skill_id, func.max(Mindmap.id))
        .join(Mindmap, Mindmap.lesson_id == LessonSkill.lesson_id)
        .join(Lesson, Lesson.id == Mindmap.lesson_id)
        .where(
            Mindmap.validation_status == "validated",
            Lesson.status == "validated",
            LessonSkill.skill_id.in_(ids),
        )
        .group_by(LessonSkill.skill_id)
    ).all()
    return {skill_id: mindmap_id for skill_id, mindmap_id in rows if mindmap_id is not None}


def _resolve_mission_mindmap_id(db: Session, skill_id: int | None) -> int | None:
    """Une mindmap VALIDÉE couvrant la notion (via sa leçon validée), sinon None.

    Même esprit que `_resolve_mission_quiz_id` (« réutiliser sinon dégrader ») : sans mindmap
    réutilisable, l'étape mindmap est simplement omise du parcours — elle est OPTIONNELLE."""
    if skill_id is None:
        return None
    return _resolve_mission_mindmap_ids(db, [skill_id]).get(skill_id)


def _recall_steps(
    db: Session, skill_id: int | None, skill_name: str
) -> list[tuple[str, str, int | None]]:
    """Étapes de RAPPEL (récupération active), optionnelles : reconstruction de carte (ADR-0019)
    puis mini-quiz — présentes ssi une ressource validée existe pour la notion."""
    steps: list[tuple[str, str, int | None]] = []
    mindmap_id = _resolve_mission_mindmap_id(db, skill_id)
    if mindmap_id is not None:
        steps.append(
            (STEP_MINDMAP, f"Reconstruis la carte mentale de « {skill_name} ».", mindmap_id)
        )
    quiz_id = _resolve_mission_quiz_id(db, skill_id)
    if quiz_id is not None:
        steps.append(
            (STEP_QUIZ, f"Refais un petit quiz sur « {skill_name} » pour vérifier.", quiz_id)
        )
    return steps


def _build_steps(
    db: Session, skill_id: int | None, skill_name: str, mission_type: str = "progression"
) -> list[tuple[str, str, int | None]]:
    """Composition d'un parcours (ADR-0017 §5). L'ORDRE dépend du type — ELI5 n'est PAS toujours en
    tête, c'est la même timeline réordonnée selon l'intention pédagogique :
    - `progression` (notion NOUVELLE) → DÉCOUVERTE d'abord : expliquer → réexpliquer → [reconstruire] → [vérifier] ;
    - `remediation` (notion DÉJÀ VUE) → RAPPEL d'abord (récupération active avant re-explication) :
      [reconstruire] → [vérifier] → expliquer → réexpliquer.
    Sans ressource de rappel (ni carte ni quiz), les deux ordres coïncident (expliquer → réexpliquer)."""
    discover: list[tuple[str, str, int | None]] = [
        (STEP_ELI5, f"Demande à ZETIS de t'expliquer « {skill_name} » (ELI5).", skill_id),
        (STEP_VOCAL, f"Réexplique « {skill_name} » avec tes mots à ZETIS.", skill_id),
    ]
    recall = _recall_steps(db, skill_id, skill_name)
    return recall + discover if mission_type == "remediation" else discover + recall


def _skill_name(db: Session, skill_id: int | None) -> str:
    if skill_id is None:
        return "Notion"
    skill = db.get(Skill, skill_id)
    return skill.name if skill is not None else "Notion"


# --- Sérialisation (schéma student ; aucun champ analytique) -------------------------------


def _skill_subject(db: Session, skill_id: int | None) -> tuple[str | None, str]:
    """(nom de notion, nom de matière) d'un skill_id — ('', '') si None/introuvable. Sert à étiqueter
    chaque étape d'une champion croisée par sa matière (ADR-0022) sans exposer de score (frontière §3)."""
    if skill_id is None:
        return None, ""
    skill = db.get(Skill, skill_id)
    if skill is None:
        return None, ""
    subject = db.get(Subject, skill.subject_id) if skill.subject_id is not None else None
    return skill.name, (subject.name if subject is not None else "")


def _to_out(db: Session, mission: Mission) -> dict:
    subject = db.get(Subject, mission.subject_id) if mission.subject_id is not None else None
    subject_name = subject.name if subject is not None else ""
    steps = list(
        db.scalars(
            select(MissionStep)
            .where(MissionStep.mission_id == mission.id)
            .order_by(MissionStep.sort_order)
        )
    )
    # XP affiché : majoré pour une champion (autant que le crédit réel à la complétion).
    xp_reward = (
        champion_xp(len({s.skill_id for s in steps if s.skill_id is not None}))
        if mission.mission_type == "champion"
        else settings.mission_xp_reward
    )

    def _step_out(s: MissionStep) -> dict:
        # ADR-0022 : chaque étape porte sa notion (`skill_id`) ; pour une croisée, on résout SA
        # matière (fallback = la notion/matière de la mission pour les missions mono-notion).
        sid = s.skill_id if s.skill_id is not None else mission.skill_id
        step_skill_name, step_subject = _skill_subject(db, sid)
        return {
            "id": s.id,
            "step_type": s.step_type,
            "instruction": s.instruction,
            "resource_id": s.resource_id,
            "skill_id": s.skill_id,
            "skill_name": step_skill_name or _skill_name(db, mission.skill_id),
            "subject": step_subject or subject_name,
            "sort_order": s.sort_order,
            "status": s.status,
        }

    return {
        "id": mission.id,
        "subject": subject_name,
        "skill_id": mission.skill_id,
        "skill_name": _skill_name(db, mission.skill_id),
        "title": mission.title,
        "description": mission.description,
        "mission_type": mission.mission_type,
        "status": mission.status,
        # PAS de champ d'auteur ici, et c'est une règle : ce que Massimo voit ne doit JAMAIS
        # désigner un auteur. Le contenu scolaire l'atteint dans la voix de ZETIS, quel que soit
        # son producteur réel — Papa, ZETIS validé, ou ZETIS autonome demain. Signer « par Papa »
        # obligerait à changer l'auteur du monde de Massimo le jour où ZETIS produira seul.
        # `created_by` reste en base et sur `MissionPilotOut` : c'est une information de PILOTAGE.
        "priority": mission.priority,
        "estimated_minutes": max(5, sum(_STEP_MINUTES.get(s.step_type, 4) for s in steps)),
        "xp_reward": xp_reward,
        "steps": [_step_out(s) for s in steps],
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
            _build_steps(db, gap.skill_id, skill_name, mission_type="remediation")
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


def preview_remediation(db: Session, student: StudentProfile) -> dict | None:
    """Compose la PROCHAINE mission de remédiation **sans rien écrire** (patron ADR-0010).

    C'est le pendant lecture de `generate_remediation` : mêmes lacunes, même moteur d'étapes,
    même ordre — mais aucune ligne créée. Le dashboard Papa l'affiche comme proposition, et la
    mission n'existe qu'après confirmation explicite, via la route de création déjà en place
    (`POST /api/missions/pilot/generate-remediation`). Aucune surface d'écriture n'est ajoutée.

    **Les deux fonctions doivent voir exactement les mêmes lacunes**, sinon la carte proposerait
    une notion que le bouton ne créerait pas : d'où le même filtre `status == "open"` (et non
    `OPEN_GAP_STATUSES` — une lacune déjà `in_progress` est prise en charge) et la même exclusion
    des notions déjà couvertes par une remédiation active.

    Renvoie la plus SÉVÈRE des lacunes non couvertes, ou `None` s'il n'y en a aucune — auquel cas
    la carte ne propose rien plutôt que d'inventer un travail à faire.
    """
    candidates = [
        gap
        for gap in db.scalars(
            select(Gap)
            .where(Gap.student_id == student.id, Gap.status == "open")
            .order_by(Gap.id)
        )
        if not _has_active_remediation(db, student_id=student.id, skill_id=gap.skill_id)
    ]
    if not candidates:
        return None

    # Même hiérarchie de sévérité que la priorité posée à la création : la proposition porte sur
    # ce qui sortirait en tête, pas sur la première ligne venue.
    gap = max(candidates, key=lambda g: (_PRIORITY_BY_SEVERITY.get(g.severity, 1), -g.id))
    skill_name = _skill_name(db, gap.skill_id)
    steps = _build_steps(db, gap.skill_id, skill_name, mission_type="remediation")

    return {
        "skill_id": gap.skill_id,
        "skill_name": skill_name,
        "title": f"Renforcer : {skill_name}",
        "steps": [
            {"step_type": step_type, "instruction": instruction}
            for step_type, instruction, _resource_id in steps
        ],
        "estimated_minutes": max(
            5, sum(_STEP_MINUTES.get(step_type, 4) for step_type, _i, _r in steps)
        ),
        # `remediation` place le RAPPEL avant la ré-explication (récupération active) : la carte
        # peut le dire sans reformuler la doctrine, elle lit l'ordre réellement composé.
        "mission_type": "remediation",
    }


# --- Générateurs par source (idempotents, tous → pending ; templates purs versionnés) ------
#
# Le vocabulaire de scoring/templates est versionné par `MISSION_SCORING_VERSION` : un
# changement de parcours change ce que « mission » veut dire, il se trace comme une pondération.


def _build_revision_steps(
    db: Session, skill_id: int | None, skill_name: str
) -> list[tuple[str, str, int | None]]:
    """Template `revision` (ADR-0017 §5) : RAPPEL d'abord (récupération active — [reconstruire] →
    [mini-quiz]), relecture de consolidation, puis RÉEXPLICATION. Notion déjà vue → on teste le
    rappel avant de relire (effet de test). La reconstruction (ADR-0019) est une récupération plus
    forte que la relecture passive ; via le verdict option B elle peut tenir lieu de signal de
    rappel sans quiz.

    **L'étape de réexplication est ce qui permet à la boucle de se FERMER.** Elle manquait, et son
    absence rendait le relais du §5bis inopérant : le verdict exige un `reverse_score` (voir
    `_complete_mission`), or `STEP_ELI5` est une étape de CONSULTATION qui n'émet aucun
    `reverse_eli5`. Une mission `revision` rendait donc toujours `review_later` — la notion que
    l'ADR-0017 promet de « vérifier dans le temps » ne pouvait jamais être déclarée acquise, et sa
    lacune restait `in_progress` à vie.

    Conséquence assumée : les TYPES d'étape coïncident désormais avec ceux de `remediation`. Les
    deux templates restent distincts par ce qui compte — la source (carte SRS due vs lacune), la
    formulation des consignes, le plafond `mission_revision_top_n` et la priorité."""
    recall = _recall_steps(db, skill_id, skill_name)
    consolider: list[tuple[str, str, int | None]] = [
        (STEP_ELI5, f"Relis et rappelle-toi « {skill_name} ».", skill_id),
        (STEP_VOCAL, f"Réexplique « {skill_name} » avec tes mots à ZETIS.", skill_id),
    ]
    return recall + consolider


def _skill_has_active_mission(db: Session, *, student_id: int, skill_id: int) -> bool:
    """Toute mission planned/active (quel que soit le type) couvrant déjà cette notion."""
    return bool(
        db.scalar(
            select(Mission.id).where(
                Mission.student_id == student_id,
                Mission.skill_id == skill_id,
                Mission.status.in_(_ACTIVE_STATUSES),
            )
        )
    )


def _create_mission(
    db: Session,
    *,
    student: StudentProfile,
    subject_id: int | None,
    skill_id: int | None,
    title: str,
    description: str,
    mission_type: str,
    steps: list[tuple[str, str, int | None]],
) -> Mission:
    mission = Mission(
        student_id=student.id,
        subject_id=subject_id,
        skill_id=skill_id,
        title=title,
        description=description,
        mission_type=mission_type,
        status="planned",
        validation_status="pending",
        priority=1,
        created_by="ai",
    )
    db.add(mission)
    db.flush()
    for index, (step_type, instruction, resource_id) in enumerate(steps):
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
    return mission


def generate_revision(db: Session, student: StudentProfile) -> list[dict]:
    """Cartes SRS dues → UNE mission `revision` par notion due (ADR-0017 §5, amendé 2026-07-06).

    **Mono-notion, jamais groupée par matière** : le verdict d'acquisition (§5bis) est mono-notion
    (mastery / lacune / carte SRS d'UN skill) — une mission multi-notions n'aurait pas de verdict
    défini. Bornée aux top-N notions les plus en retard (`MISSION_REVISION_TOP_N`), N comptant les
    missions `revision` déjà actives : on ne crée que le complément, pour ne pas inonder la file de
    validation Papa. Idempotente par notion (une notion déjà couverte par une mission active est
    ignorée). Cartes non alimentées → source vide (dégradation gracieuse — ADR-0017 §Conséquences)."""
    active_revision = (
        db.scalar(
            select(func.count(Mission.id)).where(
                Mission.student_id == student.id,
                Mission.mission_type == "revision",
                Mission.status.in_(_ACTIVE_STATUSES),
            )
        )
        or 0
    )
    budget = settings.mission_revision_top_n - active_revision
    if budget <= 0:
        return []

    now = datetime.now(timezone.utc)
    due_cards = db.scalars(
        select(SpacedReviewCard)
        .where(
            SpacedReviewCard.student_id == student.id,
            SpacedReviewCard.due_at.is_not(None),
            SpacedReviewCard.due_at <= now,
        )
        .order_by(SpacedReviewCard.due_at)  # plus en retard d'abord
    )
    created: list[Mission] = []
    seen: set[int] = set()  # une carte par notion suffit (la plus en retard, prise en premier)
    for card in due_cards:
        if len(created) >= budget:
            break
        if card.skill_id in seen:
            continue
        seen.add(card.skill_id)
        skill = db.get(Skill, card.skill_id)
        if skill is None:
            continue
        if _skill_has_active_mission(db, student_id=student.id, skill_id=card.skill_id):
            continue
        skill_name = _skill_name(db, card.skill_id)
        created.append(
            _create_mission(
                db,
                student=student,
                subject_id=skill.subject_id,
                skill_id=card.skill_id,
                title=f"Révision : {skill_name}",
                description=f"Notion à revoir : « {skill_name} ».",
                mission_type="revision",
                steps=_build_revision_steps(db, card.skill_id, skill_name),
            )
        )
    db.commit()
    return [_to_out(db, m) for m in created]


def _active_year(db: Session, student_id: int) -> SchoolYear | None:
    return db.scalar(
        select(SchoolYear)
        .where(SchoolYear.student_id == student_id, SchoolYear.status == "active")
        .order_by(SchoolYear.id.desc())
    )


def _year_subject_ids(db: Session, year_id: int) -> list[int]:
    return list(
        db.scalars(
            select(SchoolYearSubject.subject_id).where(
                SchoolYearSubject.school_year_id == year_id,
                SchoolYearSubject.status == "active",
            )
        )
    )


def _next_progression_skill(
    db: Session, *, student: StudentProfile, year: SchoolYear, subject_id: int
) -> tuple[int | None, str | None]:
    """(skill_id, continuité) de la prochaine notion à travailler d'une matière, ou (None, None).

    Priorité : notion non maîtrisée d'un chapitre actif du programme validé (`active_chapter`),
    sinon notion de rattrapage (niveau ≠ année) jamais travaillée (`rattrapage`, ADR-0010)."""
    mastered = {
        skill_id
        for skill_id, info in mastery_by_skill_local(db, student.id).items()
        if info in _MASTERED_STATUSES
    }

    # a) Notions des leçons validées de chapitres validés (actifs/planifiés), en ordre curriculum.
    sys_ids = list(
        db.scalars(
            select(SchoolYearSubject.id).where(
                SchoolYearSubject.school_year_id == year.id,
                SchoolYearSubject.subject_id == subject_id,
            )
        )
    )
    if sys_ids:
        skill_ids_in_order = db.scalars(
            select(LessonSkill.skill_id)
            .join(Lesson, Lesson.id == LessonSkill.lesson_id)
            .join(Chapter, Chapter.id == Lesson.chapter_id)
            .where(
                Chapter.school_year_subject_id.in_(sys_ids),
                Chapter.validation_status == "validated",
                Chapter.status.in_(("active", "planned")),
                Lesson.status == "validated",
            )
            .order_by(Chapter.sort_order, Lesson.sort_order, LessonSkill.skill_id)
        )
        for skill_id in skill_ids_in_order:
            if skill_id not in mastered and not _skill_has_active_mission(
                db, student_id=student.id, skill_id=skill_id
            ):
                return skill_id, "active_chapter"

    # b) Rattrapage : notion de la matière au niveau ≠ année, jamais travaillée (aucune mastery).
    worked = set(mastery_by_skill_local(db, student.id).keys())
    rattrapage = db.scalars(
        select(Skill.id)
        .where(Skill.subject_id == subject_id, Skill.level.is_not(None), Skill.level != year.level)
        .order_by(Skill.id)
    )
    for skill_id in rattrapage:
        if skill_id not in worked and not _skill_has_active_mission(
            db, student_id=student.id, skill_id=skill_id
        ):
            return skill_id, "rattrapage"
    return None, None


def generate_progression(db: Session, student: StudentProfile) -> list[dict]:
    """Prochaine notion non maîtrisée par matière de l'année active → mission `progression`.

    Template complet `eli5 → vocal_explain → quiz`. Idempotente (une notion déjà couverte par une
    mission active est ignorée). Année/programme absents → vide (dégradation gracieuse)."""
    year = _active_year(db, student.id)
    if year is None:
        return []
    created: list[Mission] = []
    for subject_id in _year_subject_ids(db, year.id):
        skill_id, _continuity = _next_progression_skill(
            db, student=student, year=year, subject_id=subject_id
        )
        if skill_id is None:
            continue
        skill_name = _skill_name(db, skill_id)
        created.append(
            _create_mission(
                db,
                student=student,
                subject_id=subject_id,
                skill_id=skill_id,
                title=f"Progresser : {skill_name}",
                description=f"Nouvelle notion à découvrir : « {skill_name} ».",
                mission_type="progression",
                steps=_build_steps(db, skill_id, skill_name),
            )
        )
    db.commit()
    return [_to_out(db, m) for m in created]


def mastery_by_skill_local(db: Session, student_id: int) -> dict[int, str]:
    """{skill_id: status} — lecture directe (évite un import du service evidence dans les
    générateurs ; l'évidence reste le point d'entrée des CONSOMMATEURS analytiques)."""
    return {
        row.skill_id: row.status
        for row in db.scalars(
            select(SkillMastery).where(SkillMastery.student_id == student_id)
        )
    }


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


def new_missions_count(db: Session, student_id: int) -> int:
    """Missions validées JAMAIS DÉMARRÉES — témoin de nouveauté de navigation (adr-0030 §3).

    Deux conditions plutôt qu'une, et c'est délibéré : `started_at IS NULL` est la définition
    doctrinale (cet horodatage fait foi pour la preuve des étapes, ADR-0017), et `planned`
    écarte une mission qui aurait quitté cet état autrement. `start_mission` pose les deux
    atomiquement — l'écart est vide aujourd'hui, la conjonction reste juste si l'un dérive.

    `Mission.due_date` n'apparaît PAS : une mission dont l'échéance est passée n'est pas plus
    « nouvelle » qu'une autre. Ce compteur naît de la validation et meurt du démarrage — il ne
    compte jamais les missions EN COURS ni les missions en retard, qui seraient un arriéré.

    Le gate `validated` est dans la requête, comme partout ailleurs dans ce module (§5ter).
    """
    return (
        db.scalar(
            select(func.count(Mission.id)).where(
                Mission.student_id == student_id,
                Mission.validation_status == "validated",
                Mission.started_at.is_(None),
                Mission.status == "planned",
            )
        )
        or 0
    )


def today_election(db: Session, student: StudentProfile) -> dict:
    """Mission du jour ÉLUE + raison (contrat cassant ADR-0017 §3). Vue student (sans scores).

    `elected: None` = état serein « rien d'obligatoire » (servi tel quel, jamais de remplissage)."""
    from app.modules.missions import selector

    result = selector.elect(db, student)
    elected = result["elected"]
    reason, reason_code = selector.reason_for(elected)
    return {
        "elected": _to_out(db, elected.mission) if elected is not None else None,
        "reason": reason,
        "reason_code": reason_code,
        "scoring_version": result["scoring_version"],
        "alternatives": [_to_out(db, alt.mission) for alt in result["alternatives"]],
    }


def completed_today(db: Session, student: StudentProfile) -> list[dict]:
    """« Terminées aujourd'hui » (vue student) : les verdicts du jour, relus depuis les
    `LearningEvent(mission_verdict)` horodatés (le verdict n'est pas un état de mission, §5bis).

    Frontière §3 : on ne renvoie QUE `{title, subject, verdict, xp}` — jamais les scores bruts
    présents dans le `payload_json` (reverse/quiz/mindmap restent analytiques Papa)."""
    day_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    events = db.scalars(
        select(LearningEvent)
        .where(
            LearningEvent.student_id == student.id,
            LearningEvent.event_type == "mission_verdict",
            LearningEvent.created_at >= day_start,
        )
        .order_by(LearningEvent.created_at.desc())
    )
    out: list[dict] = []
    for event in events:
        payload = event.payload_json or {}
        mission = db.get(Mission, payload.get("mission_id"))
        if mission is None:
            continue
        subject = (
            db.get(Subject, mission.subject_id) if mission.subject_id is not None else None
        )
        out.append(
            {
                "mission_id": mission.id,
                "title": mission.title,
                "subject": subject.name if subject is not None else "",
                "verdict": payload.get("verdict") or "review_later",
                "xp": int(payload.get("xp") or 0),
            }
        )
    return out


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


def _mindmap_score_after(
    db: Session, *, student_id: int, mindmap_id: int | None, after: datetime
) -> int | None:
    """Score de la dernière MindmapAttempt pour cette carte, POSTÉRIEURE à `after` (ADR-0019).

    Miroir de `_quiz_score_after` sur `MindmapAttempt`. Ce modèle n'a ni `context` ni
    `completed_at` : une tentative n'existe qu'une fois son score calculé serveur
    (`mindmaps.service.record_attempt`) — l'existence vaut complétion. Le gate de postériorité
    se fait sur `created_at`."""
    if mindmap_id is None:
        return None
    attempt = db.scalar(
        select(MindmapAttempt)
        .where(
            MindmapAttempt.student_id == student_id,
            MindmapAttempt.mindmap_id == mindmap_id,
            MindmapAttempt.created_at > after,
        )
        .order_by(MindmapAttempt.created_at.desc())
        .limit(1)
    )
    return attempt.score if attempt is not None else None


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
    if step.step_type == STEP_MINDMAP:
        # Preuve = une reconstruction postérieure au start avec au moins un nœud correct
        # (score > 0). `score > 0` = effort (compléter ≠ acquérir) : pas un seuil qualité, qui
        # relève du verdict (§option B). `score == 0` (rien placé) ne vaut pas complétion.
        score = _mindmap_score_after(
            db, student_id=student.id, mindmap_id=step.resource_id, after=started
        )
        if score is None or score <= 0:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="Reconstruis d'abord la carte mentale de la mission pour valider cette étape.",
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
    verdict: str,
    reverse_score: int | None,
    *,
    skill_id: int | None,
) -> None:
    """Met à jour mastery / lacune / SRS d'UNE notion selon le verdict. `acquired` ne baisse jamais
    la mastery. Prend le `skill_id` en paramètre (et non `mission.skill_id`) : une mission `champion`
    croisée applique CE verdict à chacune de ses notions (ADR-0022, verdict par notion)."""
    if skill_id is None:
        return
    now = datetime.now(timezone.utc)
    # `None` = AUCUNE réexplication mesurée, ce qui n'est pas la même chose qu'un score de 0.
    # Le distinguer est indispensable : un parcours sans étape vocale (éditeur de steps de Papa,
    # notion d'une champion croisée) écrasait sinon la maîtrise avec un zéro fabriqué.
    measured = float(reverse_score) if reverse_score is not None else None
    mastery = db.scalar(
        select(SkillMastery).where(
            SkillMastery.student_id == student.id, SkillMastery.skill_id == skill_id
        )
    )
    if mastery is None:
        mastery = SkillMastery(student_id=student.id, skill_id=skill_id)
        db.add(mastery)
    gap = db.scalar(
        select(Gap).where(
            Gap.student_id == student.id,
            Gap.skill_id == skill_id,
            Gap.status.in_(_OPEN_GAP_STATUSES),
        )
    )
    mastery.last_seen_at = now
    if verdict == "acquired":
        # `acquired` exige un `reverse_score` non nul par construction (cf. `_complete_mission`) :
        # `measured` ne peut pas être `None` dans cette branche.
        gained = measured or 0.0
        mastery.mastery_score = max(mastery.mastery_score or 0.0, gained)
        mastery.confidence_score = max(mastery.confidence_score or 0.0, gained)
        record_mastery_transition(db, mastery, "mastered", now)
        if gap is not None:
            gap.status = "resolved"
            # Seule transition qui horodate : la requête ci-dessus filtre `open|in_progress`,
            # donc une lacune déjà `resolved` n'est jamais sélectionnée — `resolved_at` est
            # écrit une fois et une seule.
            gap.resolved_at = now
    else:
        # review_later : mastery mise à jour honnêtement, lacune rouverte en cours, et la notion
        # revient d'elle-même via une carte SRS (la boucle qui vérifie l'acquisition dans le temps).
        #
        # « Honnêtement » veut dire : on n'écrit QUE ce qu'on a mesuré. Sans réexplication, on ne
        # sait pas où en est la notion — écrire 0 ferait s'effondrer la maîtrise de Massimo au
        # moment précis où il vient de travailler, et replanifierait la carte au plus court
        # intervalle (score 0 → 1 jour) en punissant l'effort d'une révision.
        if measured is not None:
            mastery.mastery_score = measured
            mastery.confidence_score = measured
        record_mastery_transition(db, mastery, "in_progress", now)
        if gap is not None:
            # Volontairement SANS horodatage : cette branche peut réécrire `in_progress` sur une
            # lacune qui l'est déjà (le filtre accepte les deux statuts). Toute date posée ici
            # serait re-tamponnée à chaque verdict `review_later` et ne voudrait plus rien dire.
            gap.status = "in_progress"
        skill_name = _skill_name(db, skill_id)
        # Faute de mesure fraîche, l'intervalle se calcule sur la maîtrise CONNUE plutôt que sur un
        # zéro fabriqué : une notion déjà solide ne revient pas dès demain parce que le parcours
        # n'avait pas d'étape vocale.
        basis = measured if measured is not None else (mastery.mastery_score or 0.0)
        schedule_review(
            db,
            student_id=student.id,
            skill_id=skill_id,
            interval=interval_from_score(int(basis)),
            front=f"Réexplique : {skill_name}",
            back="Reprends cette notion tranquillement — tu y reviens bientôt.",
        )


def _recall_ok(quiz_score: float | None, mindmap_score: int | None) -> bool:
    """Signal de RAPPEL (ADR-0019, option B) : quiz OU reconstruction de carte au seuil suffit."""
    return (quiz_score is not None and quiz_score >= settings.mission_quiz_threshold) or (
        mindmap_score is not None and mindmap_score >= settings.mission_mindmap_threshold
    )


def champion_xp(n_notions: int) -> int:
    """XP majoré d'un défi croisé (ADR-0022) : forfait de base + bonus par notion. Déterministe."""
    return settings.mission_champion_xp_base + settings.mission_champion_xp_per_notion * max(
        0, n_notions
    )


def _notion_verdict(
    db: Session, student: StudentProfile, mission: Mission, skill_id: int, started: datetime
) -> dict:
    """Verdict d'acquisition d'UNE notion d'une champion, depuis les preuves de SES étapes
    (ADR-0022). Miroir du calcul mono (§5bis) restreint aux étapes taggées `skill_id`."""
    reverse_score = _reverse_score_after(
        db, student_id=student.id, skill_id=skill_id, after=started
    )
    quiz_step = db.scalar(
        select(MissionStep).where(
            MissionStep.mission_id == mission.id,
            MissionStep.step_type == STEP_QUIZ,
            MissionStep.skill_id == skill_id,
        )
    )
    quiz_score = (
        _quiz_score_after(db, student_id=student.id, quiz_id=quiz_step.resource_id, after=started)
        if quiz_step is not None
        else None
    )
    mindmap_step = db.scalar(
        select(MissionStep).where(
            MissionStep.mission_id == mission.id,
            MissionStep.step_type == STEP_MINDMAP,
            MissionStep.skill_id == skill_id,
        )
    )
    mindmap_score = (
        _mindmap_score_after(
            db, student_id=student.id, mindmap_id=mindmap_step.resource_id, after=started
        )
        if mindmap_step is not None
        else None
    )
    acquired = (
        reverse_score is not None
        and reverse_score >= settings.mission_reverse_threshold
        and _recall_ok(quiz_score, mindmap_score)
    )
    return {
        "skill_id": skill_id,
        "verdict": "acquired" if acquired else "review_later",
        "reverse_score": reverse_score,
        "quiz_score": quiz_score,
        "mindmap_score": mindmap_score,
    }


def _ordered_step_skill_ids(db: Session, mission: Mission) -> list[int]:
    """Notions distinctes des étapes d'une champion, dans l'ordre d'apparition (`sort_order`)."""
    ordered: list[int] = []
    for step in db.scalars(
        select(MissionStep)
        .where(MissionStep.mission_id == mission.id)
        .order_by(MissionStep.sort_order)
    ):
        if step.skill_id is not None and step.skill_id not in ordered:
            ordered.append(step.skill_id)
    return ordered


def _complete_champion(
    db: Session, student: StudentProfile, mission: Mission, started: datetime
) -> dict:
    """Termine une champion croisée : verdict PAR NOTION (ADR-0022) + XP majoré + badge Champion.

    Itère le verdict §5bis sur les notions distinctes des étapes ; chaque notion voit sa mastery /
    lacune / carte SRS mise à jour comme une mission mono-notion. Le verdict SERVI (completed-today,
    célébration) est agrégé : « acquise » ssi TOUTES les notions le sont, sinon « à revoir » (une
    seule trace de verdict par mission — completed-today reste 1 ligne = 1 mission)."""
    mission.status = "completed"
    for step in db.scalars(select(MissionStep).where(MissionStep.mission_id == mission.id)):
        step.status = "done"

    skill_ids = _ordered_step_skill_ids(db, mission)
    per_notion = [_notion_verdict(db, student, mission, sid, started) for sid in skill_ids]
    for v in per_notion:
        _apply_verdict(db, student, v["verdict"], v["reverse_score"], skill_id=v["skill_id"])
    aggregate = (
        "acquired"
        if skill_ids and all(v["verdict"] == "acquired" for v in per_notion)
        else "review_later"
    )
    xp = champion_xp(len(skill_ids))
    award_xp(
        db,
        student_id=student.id,
        subject_id=None,  # croisée : plusieurs matières, XP non imputé à une seule
        amount=xp,
        reason=XP_REASON_CHAMPION,
    )
    db.add(
        LearningEvent(
            student_id=student.id,
            subject_id=None,
            skill_id=None,
            event_type="mission_verdict",
            payload_json={
                "mission_id": mission.id,
                "mission_type": "champion",
                "verdict": aggregate,
                "per_notion": per_notion,
                "xp": xp,
                "effect": "gap_resolved" if aggregate == "acquired" else "srs_rescheduled",
            },
            created_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    return {"mission_status": mission.status, "verdict": aggregate, "xp_awarded": xp}


def _complete_mission(
    db: Session, student: StudentProfile, mission: Mission, started: datetime
) -> dict:
    """Termine la mission : XP inconditionnel + verdict d'acquisition depuis les scores mesurés."""
    if mission.mission_type == "champion":
        return _complete_champion(db, student, mission, started)
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
    mindmap_step = db.scalar(
        select(MissionStep).where(
            MissionStep.mission_id == mission.id, MissionStep.step_type == STEP_MINDMAP
        )
    )
    mindmap_score = (
        _mindmap_score_after(
            db, student_id=student.id, mindmap_id=mindmap_step.resource_id, after=started
        )
        if mindmap_step is not None
        else None
    )
    # Verdict (ADR-0019, option B) : le RAPPEL peut être prouvé par le quiz OU par la
    # reconstruction de carte (récupération active de la structure) — l'un OU l'autre au seuil
    # suffit. La réexplication (reverse) reste toujours requise. Résout le « à revoir par défaut »
    # des notions sans quiz mais avec mindmap.
    acquired = (
        reverse_score is not None
        and reverse_score >= settings.mission_reverse_threshold
        and _recall_ok(quiz_score, mindmap_score)
    )
    verdict = "acquired" if acquired else "review_later"

    if mission.skill_id is not None:
        _apply_verdict(db, student, verdict, reverse_score, skill_id=mission.skill_id)

    # XP = effort (inconditionnel, quel que soit le verdict — règle XP de DATA_MODEL.md).
    award_xp(
        db,
        student_id=student.id,
        subject_id=mission.subject_id,
        amount=settings.mission_xp_reward,
        reason=XP_REASON,
    )
    # Trace du verdict (source de `evidence.recent_verdicts` / pilotage Papa — ADR-0017 §5bis).
    # Le verdict n'est pas un état persistant sur la mission : c'est un événement horodaté.
    db.add(
        LearningEvent(
            student_id=student.id,
            subject_id=mission.subject_id,
            skill_id=mission.skill_id,
            event_type="mission_verdict",
            payload_json={
                "mission_id": mission.id,
                "mission_type": mission.mission_type,
                "verdict": verdict,
                "reverse_score": reverse_score,
                "quiz_score": quiz_score,
                "mindmap_score": mindmap_score,
                "xp": settings.mission_xp_reward,
                "effect": "gap_resolved" if verdict == "acquired" else "srs_rescheduled",
            },
            created_at=datetime.now(timezone.utc),
        )
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


# --- Pilotage cycle de vie (Papa) : delete / regenerate / patch / éditeur de parcours -------

# Palette de types éditables (l'arc pédagogique), dans l'ordre canonique. `lesson` reste hors
# palette (jamais composé par les générateurs). Champs immuables au PATCH côté service.
_STEP_PALETTE = (STEP_ELI5, STEP_VOCAL, STEP_MINDMAP, STEP_QUIZ)
_PATCHABLE_FIELDS = ("title", "description", "priority", "force_priority", "due_date")


def _owned_mission_or_404(db: Session, student: StudentProfile, mission_id: int) -> Mission:
    mission = db.get(Mission, mission_id)
    if mission is None or mission.student_id != student.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Mission introuvable.")
    return mission


def _step_instruction(step_type: str, skill_name: str) -> str:
    return {
        STEP_ELI5: f"Demande à ZETIS de t'expliquer « {skill_name} » (ELI5).",
        STEP_VOCAL: f"Réexplique « {skill_name} » avec tes mots à ZETIS.",
        STEP_MINDMAP: f"Reconstruis la carte mentale de « {skill_name} ».",
        STEP_QUIZ: f"Refais un petit quiz sur « {skill_name} » pour vérifier.",
    }.get(step_type, skill_name)


def _resolve_step_resource(db: Session, step_type: str, skill_id: int | None) -> int | None:
    """resource_id d'un type d'étape pour une notion, ou None si non résoluble (mindmap/quiz)."""
    if step_type in (STEP_ELI5, STEP_VOCAL):
        return skill_id
    if step_type == STEP_MINDMAP:
        return _resolve_mission_mindmap_id(db, skill_id)
    if step_type == STEP_QUIZ:
        return _resolve_mission_quiz_id(db, skill_id)
    return None


def _write_steps(db: Session, mission: Mission, specs: list[tuple[str, str, int | None]]) -> None:
    """Remplace toutes les étapes d'une mission par `specs` (step_type, instruction, resource_id)."""
    for old in db.scalars(select(MissionStep).where(MissionStep.mission_id == mission.id)):
        db.delete(old)
    db.flush()
    for index, (step_type, instruction, resource_id) in enumerate(specs):
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


def delete_mission(db: Session, student: StudentProfile, mission_id: int) -> dict:
    """Suppression dure (mission + étapes). Les traces (verdicts, XP) restent — audit préservé.
    Distinct de `reject` (qui conserve un enregistrement `rejected`)."""
    mission = _owned_mission_or_404(db, student, mission_id)
    for step in db.scalars(select(MissionStep).where(MissionStep.mission_id == mission.id)):
        db.delete(step)
    db.delete(mission)
    db.commit()
    return {"deleted": True, "id": mission_id}


def regenerate_mission(db: Session, student: StudentProfile, mission_id: int) -> Mission:
    """Reconstruit le parcours d'une mission `planned` (déterministe). `validation_status`
    inchangé (action Papa directe : l'invariant « un humain a approuvé » tient)."""
    mission = _owned_mission_or_404(db, student, mission_id)
    if mission.status != "planned":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Seule une mission non démarrée peut être régénérée.",
        )
    skill_name = _skill_name(db, mission.skill_id)
    specs = (
        _build_revision_steps(db, mission.skill_id, skill_name)
        if mission.mission_type == "revision"
        else _build_steps(db, mission.skill_id, skill_name, mission_type=mission.mission_type)
    )
    _write_steps(db, mission, specs)
    db.commit()
    return mission


def patch_mission(db: Session, student: StudentProfile, mission_id: int, data: dict) -> Mission:
    """Édite les champs sûrs (`title`/`description`/`priority`/`force_priority`/`due_date`).
    Les champs immuables (skill, type, status, validation…) ne sont jamais touchés."""
    mission = _owned_mission_or_404(db, student, mission_id)
    for field in _PATCHABLE_FIELDS:
        if field in data:
            setattr(mission, field, data[field])
    db.commit()
    return mission


def mission_step_options(db: Session, student: StudentProfile, mission_id: int) -> dict:
    """Palette d'étapes disponibles pour la notion de la mission + parcours courant (éditeur)."""
    mission = _owned_mission_or_404(db, student, mission_id)
    current = list(
        db.scalars(
            select(MissionStep)
            .where(MissionStep.mission_id == mission.id)
            .order_by(MissionStep.sort_order)
        )
    )
    current_types = [s.step_type for s in current]
    options = []
    for step_type in _STEP_PALETTE:
        resource_id = _resolve_step_resource(db, step_type, mission.skill_id)
        # eli5/vocal toujours dispo (resource = skill_id) ; mindmap/quiz ssi résolus.
        available = (step_type in (STEP_ELI5, STEP_VOCAL) and mission.skill_id is not None) or (
            step_type in (STEP_MINDMAP, STEP_QUIZ) and resource_id is not None
        )
        options.append(
            {
                "step_type": step_type,
                "available": available,
                "resource_id": resource_id,
                "selected": step_type in current_types,
            }
        )
    return {"options": options, "current_types": current_types, "editable": mission.status == "planned"}


def set_mission_steps(
    db: Session, student: StudentProfile, mission_id: int, step_types: list[str]
) -> Mission:
    """Éditeur de parcours : impose la liste ordonnée de types (planned only). Chaque type doit
    être disponible pour la notion ; ≥ 1 étape. `validation_status` inchangé."""
    mission = _owned_mission_or_404(db, student, mission_id)
    if mission.status != "planned":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Le parcours ne peut être modifié qu'avant le démarrage de la mission.",
        )
    ordered = list(dict.fromkeys(step_types))  # dédoublonne en préservant l'ordre (1 type = 1 étape)
    if not ordered:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Au moins une étape.")
    skill_name = _skill_name(db, mission.skill_id)
    specs: list[tuple[str, str, int | None]] = []
    for step_type in ordered:
        if step_type not in _STEP_PALETTE:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Type d'étape inconnu : {step_type}."
            )
        resource_id = _resolve_step_resource(db, step_type, mission.skill_id)
        if step_type in (STEP_MINDMAP, STEP_QUIZ) and resource_id is None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail=f"Aucune ressource « {step_type} » disponible pour cette notion.",
            )
        specs.append((step_type, _step_instruction(step_type, skill_name), resource_id))
    _write_steps(db, mission, specs)
    db.commit()
    return mission
