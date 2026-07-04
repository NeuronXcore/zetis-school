"""Génération et cycle de vie des cartes de révision (SRS) — ADR-0013.

Surface = **page Papa « Cartes SRS »** (pas d'effet de bord de la validation de leçon).
Le contenu dérive du COURS VALIDÉ de la notion (substrat canonique ADR-0011), 100 % local
(ADR-0008). Invariant central (§3) : rafraîchir le CONTENU d'une carte ne touche JAMAIS sa
PLANIFICATION. Clé métier `(student_id, skill_id, card_type)`. Trois branches à l'upsert :

  A · notion toujours couverte  → update recto/verso seuls ; due_at/interval/ease INTACTS.
  B · notion nouvellement couverte → création (interval 0, due maintenant, active).
  C · notion quittée par TOUT cours validé → carte SUSPENDUE (hors session) mais ligne
      conservée avec sa planification ; RÉACTIVÉE en place si un cours revient la couvrir.

On ne supprime JAMAIS une ligne dans le flux génération/réconciliation. La SEULE suppression
est l'action Papa explicite `delete_skill_cards` (§5). Cas dégradé (sans cours validé) →
`pending`, filtrée serveur (`build_session`).
"""

import json
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    AIJob,
    Chapter,
    Lesson,
    LessonSkill,
    SchoolYear,
    SchoolYearSubject,
    Skill,
    SpacedReviewAttempt,
    SpacedReviewCard,
    StudentProfile,
    Subject,
)
from app.modules.ai.canonical_context import (
    build_canonical_sections,
    resolve_canonical_context,
)
from app.modules.ai.provider import EmbeddingProvider, LLMProvider, LLMRequest
from app.modules.eli5.service import get_default_student
from app.prompts.srs_cards import (
    SRS_CARDS_PROMPT_VERSION,
    SRS_CARDS_SCHEMA,
    build_cards_prompt,
)

MAX_CARDS_PER_SKILL = 3
ALLOWED_CARD_TYPES = ("definition", "method", "example", "error_correction")

# Cycle de vie du `status` (ADR-0013). `scheduled` = active (révisable) ; `pending` = cas
# dégradé (généré sans cours validé) ; `suspended` = orpheline (planification conservée).
STATUS_ACTIVE = "scheduled"
STATUS_PENDING = "pending"
STATUS_SUSPENDED = "suspended"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _active_students(db: Session) -> list[StudentProfile]:
    """Tous les profils élèves (le mécanisme ne présume pas le mono-élève, ADR-0013 §1)."""
    return list(db.scalars(select(StudentProfile).order_by(StudentProfile.id)))


def _has_validated_course(db: Session, skill_id: int) -> bool:
    """Une leçon validée AVEC cours couvre-t-elle cette notion ? Miroir du gate du résolveur
    (ADR-0011), pur DB : la réconciliation d'orphelins n'a besoin que de cette réponse."""
    return (
        db.scalar(
            select(Lesson.id)
            .join(LessonSkill, LessonSkill.lesson_id == Lesson.id)
            .where(
                LessonSkill.skill_id == skill_id,
                Lesson.status == "validated",
                Lesson.content_markdown.isnot(None),
            )
            .limit(1)
        )
        is not None
    )


# ── Génération LLM d'une notion ──────────────────────────────────────────────


def _run_traced(
    db: Session,
    *,
    input_payload: dict,
    provider: LLMProvider,
    request: LLMRequest,
) -> dict:
    """Appel IA synchrone, toujours tracé dans `ai_jobs` (`srs_cards_generate`)."""
    now = _now()
    job = AIJob(
        job_type="srs_cards_generate",
        status="running",
        input_json=input_payload,
        created_by="parent",
        created_at=now,
        started_at=now,
    )
    db.add(job)
    db.flush()
    try:
        response = provider.generate(request)
        parsed = json.loads(response.text)
        if not isinstance(parsed, dict):
            raise ValueError("La réponse IA n'est pas un objet JSON.")
    except Exception as exc:  # noqa: BLE001
        job.status = "failed"
        job.error_message = str(exc)[:1000]
        job.finished_at = _now()
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Génération IA échouée : {exc}"
        ) from exc
    job.status = "succeeded"
    job.output_json = parsed
    job.duration_ms = response.duration_ms
    job.finished_at = _now()
    return parsed


def _parse_specs(parsed: dict) -> list[dict]:
    """Extrait 1-3 cartes valides (champs non vides, `card_type` connu, dédupliqué par type)."""
    raw = parsed.get("cards")
    specs: list[dict] = []
    seen: set[str] = set()
    if isinstance(raw, list):
        for item in raw:
            if len(specs) >= MAX_CARDS_PER_SKILL or not isinstance(item, dict):
                continue
            front = str(item.get("front_markdown") or "").strip()
            back = str(item.get("back_markdown") or "").strip()
            if not front or not back:
                continue
            card_type = item.get("card_type")
            if card_type not in ALLOWED_CARD_TYPES:
                card_type = "definition"
            if card_type in seen:  # clé (student, skill, card_type) unique
                continue
            seen.add(card_type)
            specs.append({"card_type": card_type, "front": front, "back": back})
    return specs


def _generate_specs(
    db: Session,
    provider: LLMProvider,
    embedder: EmbeddingProvider,
    *,
    skill: Skill,
) -> tuple[list[dict], bool]:
    """1-3 cartes ancrées sur le cours canonique. Pipeline `fmt` + **1 réparation** + erreur
    propre (comme capsule/curriculum) : rien d'invalide n'est jamais persisté."""
    subject = db.get(Subject, skill.subject_id)
    ctx = resolve_canonical_context(db, embedder, skill_id=skill.id)
    system, prompt = build_cards_prompt(
        skill.name,
        build_canonical_sections(ctx),
        level=skill.level or "4e",
        subject=subject.name if subject else "cette matière",
    )
    base_payload = {
        "skill_id": skill.id,
        "lesson_id": ctx.lesson.id if ctx.lesson else None,
        "lesson_title": ctx.lesson.title if ctx.lesson else None,
        "prompt_version": SRS_CARDS_PROMPT_VERSION,
        "has_course": ctx.has_course,
    }
    for attempt in range(2):  # 1 génération + 1 réparation
        user_prompt = prompt
        if attempt == 1:
            user_prompt += (
                "\n\n(Ta réponse précédente était invalide ou vide. Renvoie STRICTEMENT "
                '1 à 3 cartes {card_type, front_markdown, back_markdown} non vides.)'
            )
        try:
            parsed = _run_traced(
                db,
                input_payload={**base_payload, "attempt": attempt},
                provider=provider,
                request=LLMRequest(system=system, prompt=user_prompt, fmt=SRS_CARDS_SCHEMA),
            )
            specs = _parse_specs(parsed)
        except HTTPException:
            specs = []  # JSON malformé → on tente la réparation, sinon erreur propre ci-dessous
        if specs:
            return specs, ctx.has_course
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Aucune carte valide générée pour la notion {skill.id}.",
    )


def generate_cards_for_skill(
    db: Session,
    provider: LLMProvider,
    embedder: EmbeddingProvider,
    *,
    skill_id: int,
    commit: bool = True,
) -> dict:
    """Upsert des cartes d'une notion pour CHAQUE élève actif (branches A/B, ADR-0013 §3).

    Absente → création (active si cours validé, sinon `pending`) ; présente → update
    recto/verso SEULS (planification intacte) ; suspendue/pending + cours validé → réactivée.
    """
    skill = db.get(Skill, skill_id)
    if skill is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notion introuvable.")
    specs, has_course = _generate_specs(db, provider, embedder, skill=skill)
    result = {"created": 0, "updated": 0, "reactivated": 0, "pending": 0}
    now = _now()
    target = STATUS_ACTIVE if has_course else STATUS_PENDING
    for student in _active_students(db):
        for spec in specs:
            existing = db.scalar(
                select(SpacedReviewCard).where(
                    SpacedReviewCard.student_id == student.id,
                    SpacedReviewCard.skill_id == skill_id,
                    SpacedReviewCard.card_type == spec["card_type"],
                )
            )
            if existing is None:
                db.add(
                    SpacedReviewCard(
                        student_id=student.id,
                        skill_id=skill_id,
                        front_markdown=spec["front"],
                        back_markdown=spec["back"],
                        card_type=spec["card_type"],
                        interval_days=0,
                        ease_factor=2.5,
                        due_at=now if target == STATUS_ACTIVE else None,
                        status=target,
                    )
                )
                result["created" if target == STATUS_ACTIVE else "pending"] += 1
                continue
            existing.front_markdown = spec["front"]  # branche A : contenu seul
            existing.back_markdown = spec["back"]
            if has_course and existing.status in (STATUS_PENDING, STATUS_SUSPENDED):
                existing.status = STATUS_ACTIVE  # réactivation en place
                if existing.due_at is None:
                    existing.due_at = now
                    existing.interval_days = 0
                result["reactivated"] += 1
            else:
                result["updated"] += 1
    if commit:
        db.commit()
    return result


# ── Réconciliation par matière (cœur de l'ADR) ───────────────────────────────


def _subject_or_404(db: Session, subject_id: int) -> Subject:
    subject = db.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Matière introuvable.")
    return subject


def _target_skill_ids_for_subject(db: Session, subject_id: int) -> set[int]:
    """Notions de la matière couvertes par au moins une leçon validée (ensemble cible)."""
    return set(
        db.scalars(
            select(Skill.id)
            .join(LessonSkill, LessonSkill.skill_id == Skill.id)
            .join(Lesson, Lesson.id == LessonSkill.lesson_id)
            .where(
                Skill.subject_id == subject_id,
                Lesson.status == "validated",
                Lesson.content_markdown.isnot(None),
            )
            .distinct()
        )
    )


def reconcile_cards_for_subject(
    db: Session,
    provider: LLMProvider,
    embedder: EmbeddingProvider,
    *,
    subject_id: int,
) -> dict:
    """En une passe : génère/rafraîchit les notions cibles (A/B + réactivation) et suspend les
    orphelines (C). Un échec sur une notion n'avorte pas les autres (`failed_skills`)."""
    _subject_or_404(db, subject_id)
    targets = _target_skill_ids_for_subject(db, subject_id)
    totals = {"created": 0, "updated": 0, "reactivated": 0, "pending": 0}
    failed_skills: list[int] = []

    for skill_id in sorted(targets):
        # Chaque notion se committe indépendamment : un échec plus loin ne défait pas les
        # notions déjà générées (§1 « un échec sur une skill n'avorte pas les autres »).
        try:
            r = generate_cards_for_skill(db, provider, embedder, skill_id=skill_id, commit=True)
            for k in totals:
                totals[k] += r[k]
        except HTTPException:
            failed_skills.append(skill_id)

    # Branche C : cartes actives de la matière dont la notion n'est plus couverte → suspendues.
    suspended = 0
    orphans = db.scalars(
        select(SpacedReviewCard)
        .join(Skill, Skill.id == SpacedReviewCard.skill_id)
        .where(
            Skill.subject_id == subject_id,
            SpacedReviewCard.status == STATUS_ACTIVE,
            SpacedReviewCard.skill_id.not_in(targets or {-1}),
        )
    ).all()
    for card in orphans:
        card.status = STATUS_SUSPENDED  # planification conservée
        suspended += 1

    db.commit()
    return {
        "subject_id": subject_id,
        "created": totals["created"],
        "updated": totals["updated"],
        "reactivated": totals["reactivated"],
        "pending": totals["pending"],
        "suspended": suspended,
        "failed_skills": failed_skills,
    }


# ── Lecture d'état pour la page (payload léger) ──────────────────────────────


def _card_counts(db: Session, student_id: int, skill_ids: list[int]) -> dict[int, dict]:
    """Par notion : nb de cartes actives / suspendues / pending (pour l'élève)."""
    rows = db.execute(
        select(SpacedReviewCard.skill_id, SpacedReviewCard.status, func.count())
        .where(
            SpacedReviewCard.student_id == student_id,
            SpacedReviewCard.skill_id.in_(skill_ids or [-1]),
        )
        .group_by(SpacedReviewCard.skill_id, SpacedReviewCard.status)
    ).all()
    out: dict[int, dict] = {}
    for skill_id, st, n in rows:
        d = out.setdefault(skill_id, {"active": 0, "suspended": 0, "pending": 0})
        if st == STATUS_ACTIVE:
            d["active"] += n
        elif st == STATUS_SUSPENDED:
            d["suspended"] += n
        elif st == STATUS_PENDING:
            d["pending"] += n
    return out


def _skill_state(counts: dict, in_target: bool) -> str:
    """`ok | to_generate | suspended` (le cas `failed` est remonté par la génération)."""
    if counts.get("active"):
        return "ok"
    if counts.get("suspended"):
        return "suspended"
    return "to_generate" if in_target else "suspended"


def overview(db: Session) -> dict:
    """KPI globaux + résumé par matière (payload léger — jamais le contenu des cartes)."""
    student = get_default_student(db)
    subjects = list(db.scalars(select(Subject).order_by(Subject.sort_order, Subject.name)))
    out_subjects = []
    tot = {"covered": 0, "active": 0, "to_generate": 0, "suspended": 0}
    for subject in subjects:
        targets = _target_skill_ids_for_subject(db, subject.id)
        # notions de la matière ayant des cartes (pour compter actives/suspendues même hors cible)
        card_skill_ids = list(
            db.scalars(
                select(SpacedReviewCard.skill_id)
                .join(Skill, Skill.id == SpacedReviewCard.skill_id)
                .where(Skill.subject_id == subject.id, SpacedReviewCard.student_id == student.id)
                .distinct()
            )
        )
        counts = _card_counts(db, student.id, list(targets | set(card_skill_ids)))
        active = sum(c["active"] for c in counts.values())
        suspended = sum(c["suspended"] for c in counts.values())
        to_generate = sum(1 for s in targets if not counts.get(s, {}).get("active"))
        if not targets and active == 0 and suspended == 0:
            continue  # matière sans référentiel validé ni carte : hors page
        out_subjects.append(
            {
                "subject_id": subject.id,
                "name": subject.name,
                "active_cards": active,
                "to_generate": to_generate,
                "suspended": suspended,
            }
        )
        tot["covered"] += len(targets)
        tot["active"] += active
        tot["to_generate"] += to_generate
        tot["suspended"] += suspended
    return {"subjects": out_subjects, "totals": tot}


def _subject_chapters(db: Session, subject_id: int) -> list[Chapter]:
    """Chapitres validés de la matière dans l'année active (même résolution que la page Cours)."""
    year = db.scalar(
        select(SchoolYear).where(SchoolYear.status == "active").order_by(SchoolYear.id.desc())
    )
    if year is None:
        return []
    sys_row = db.scalar(
        select(SchoolYearSubject).where(
            SchoolYearSubject.school_year_id == year.id,
            SchoolYearSubject.subject_id == subject_id,
        )
    )
    if sys_row is None:
        return []
    return list(
        db.scalars(
            select(Chapter)
            .where(
                Chapter.school_year_subject_id == sys_row.id,
                Chapter.validation_status == "validated",
            )
            .order_by(Chapter.sort_order, Chapter.id)
        )
    )


def subject_tree(db: Session, subject_id: int) -> dict:
    """Arbre chapitre → leçon → notion (état + nb de cartes) + notions suspendues. Léger."""
    subject = _subject_or_404(db, subject_id)
    student = get_default_student(db)
    targets = _target_skill_ids_for_subject(db, subject_id)
    chapters = _subject_chapters(db, subject_id)

    all_skill_ids = set(targets)
    # notions suspendues de la matière (même hors cible) pour la section dédiée
    suspended_skill_ids = list(
        db.scalars(
            select(SpacedReviewCard.skill_id)
            .join(Skill, Skill.id == SpacedReviewCard.skill_id)
            .where(
                Skill.subject_id == subject_id,
                SpacedReviewCard.student_id == student.id,
                SpacedReviewCard.status == STATUS_SUSPENDED,
            )
            .distinct()
        )
    )
    all_skill_ids.update(suspended_skill_ids)
    counts = _card_counts(db, student.id, list(all_skill_ids))

    def notion(skill: Skill) -> dict:
        c = counts.get(skill.id, {})
        return {
            "skill_id": skill.id,
            "name": skill.name,
            "state": _skill_state(c, skill.id in targets),
            "card_count": c.get("active", 0),
        }

    tree_chapters = []
    for chapter in chapters:
        lessons = db.scalars(
            select(Lesson)
            .where(
                Lesson.chapter_id == chapter.id,
                Lesson.status == "validated",
                Lesson.content_markdown.isnot(None),
            )
            .order_by(Lesson.sort_order, Lesson.id)
        ).all()
        tree_lessons = []
        for lesson in lessons:
            skills = db.scalars(
                select(Skill)
                .join(LessonSkill, LessonSkill.skill_id == Skill.id)
                .where(LessonSkill.lesson_id == lesson.id)
                .order_by(Skill.id)
            ).all()
            if not skills:
                continue
            tree_lessons.append(
                {"lesson_id": lesson.id, "title": lesson.title, "notions": [notion(s) for s in skills]}
            )
        if tree_lessons:
            tree_chapters.append({"chapter_id": chapter.id, "name": chapter.name, "lessons": tree_lessons})

    suspended_notions = [
        notion(s) for s in db.scalars(select(Skill).where(Skill.id.in_(suspended_skill_ids or [-1])))
    ]
    return {
        "subject_id": subject.id,
        "name": subject.name,
        "chapters": tree_chapters,
        "suspended": suspended_notions,
    }


def skill_cards(db: Session, skill_id: int) -> list[dict]:
    """Recto/verso des cartes d'une notion (chargé à la demande par l'aperçu Papa)."""
    student = get_default_student(db)
    cards = db.scalars(
        select(SpacedReviewCard)
        .where(SpacedReviewCard.student_id == student.id, SpacedReviewCard.skill_id == skill_id)
        .order_by(SpacedReviewCard.id)
    ).all()
    return [
        {
            "id": c.id,
            "card_type": c.card_type,
            "front_markdown": c.front_markdown,
            "back_markdown": c.back_markdown,
            "status": c.status,
        }
        for c in cards
    ]


# ── Actions de réconciliation explicites (§5) ────────────────────────────────


def reactivate_skill(db: Session, skill_id: int) -> dict:
    """Réactive les cartes suspendues d'une notion (planification intacte)."""
    cards = db.scalars(
        select(SpacedReviewCard).where(
            SpacedReviewCard.skill_id == skill_id,
            SpacedReviewCard.status == STATUS_SUSPENDED,
        )
    ).all()
    now = _now()
    for card in cards:
        card.status = STATUS_ACTIVE
        if card.due_at is None:
            card.due_at = now
            card.interval_days = 0
    db.commit()
    return {"skill_id": skill_id, "reactivated": len(cards)}


def delete_skill_cards(db: Session, skill_id: int) -> dict:
    """Retire les cartes d'une notion ET leur historique (§5)."""
    card_ids = list(
        db.scalars(select(SpacedReviewCard.id).where(SpacedReviewCard.skill_id == skill_id))
    )
    if card_ids:
        db.execute(
            SpacedReviewAttempt.__table__.delete().where(
                SpacedReviewAttempt.card_id.in_(card_ids)
            )
        )
        db.execute(SpacedReviewCard.__table__.delete().where(SpacedReviewCard.id.in_(card_ids)))
    db.commit()
    return {"skill_id": skill_id, "deleted": len(card_ids)}


# ── Édition / suppression à la carte (correction manuelle Papa) ──────────────


def update_card(db: Session, card_id: int, *, front_markdown: str, back_markdown: str) -> dict:
    """Édite le recto/verso d'UNE carte. Invariant §3 : rafraîchir le CONTENU ne touche
    JAMAIS la planification (due_at/interval/ease) ni l'historique de révision."""
    card = db.get(SpacedReviewCard, card_id)
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Carte introuvable.")
    card.front_markdown = front_markdown
    card.back_markdown = back_markdown
    db.commit()
    return {
        "id": card.id,
        "card_type": card.card_type,
        "front_markdown": card.front_markdown,
        "back_markdown": card.back_markdown,
        "status": card.status,
    }


def delete_card(db: Session, card_id: int) -> dict:
    """Supprime UNE carte et son historique d'attempts (action Papa explicite, confirmée UI)."""
    card = db.get(SpacedReviewCard, card_id)
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Carte introuvable.")
    db.execute(
        SpacedReviewAttempt.__table__.delete().where(SpacedReviewAttempt.card_id == card_id)
    )
    db.delete(card)
    db.commit()
    return {"id": card_id, "deleted": 1}
