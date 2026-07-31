"""Service ZETIS Galaxy (ADR-0024) — dérivation du graphe de connaissances, read-only.

Trois lectures, aucune écriture, aucune table nouvelle :
- la vue d'ensemble (une constellation par matière) ;
- une constellation (amas = chapitre, étoile = notion) ;
- le panneau d'actions d'une notion.

Chaîne de visibilité IDENTIQUE aux autres routes élève (`student_subject_notions`) :
année active → `Chapter.validation_status == "validated"` → `Lesson.status == "validated"`
→ `LessonSkill` → `Skill`. Une notion non validée n'apparaît pas — pas même comme
« à découvrir ».

La maîtrise vient du service d'évidence (`evidence.mastery_by_skill`), jamais recalculée
ici : un substrat, plusieurs consommateurs (ADR-0011 §1).
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    Capsule,
    Chapter,
    Fiche,
    LearningEvent,
    Lesson,
    LessonSkill,
    SchoolYearSubject,
    Skill,
    SpacedReviewCard,
    Subject,
)
from app.modules.curriculum.service import _active_year_or_404
from app.modules.eli5.service import get_default_student
from app.modules.evidence import service as evidence
from app.modules.memory.service import INACTIVE_CARD_STATUSES

# Les résolveurs de ressources par notion vivent dans `missions` et sont réutilisés tels
# quels — les réécrire ici les ferait diverger au premier correctif (le mal que l'ADR-0011 §1
# existe pour empêcher). ⚠️ Dette connue : ce sont des fonctions privées d'un autre module ;
# leur extraction vers un module neutre est le bon geste, mais elle modifierait `missions`,
# hors périmètre de cette slice.
from app.modules.missions.service import (
    _resolve_mission_mindmap_id,
    _resolve_mission_quiz_id,
)

# Les cinq états rendus par la Galaxy (ADR-0024 §5).
GALAXY_STATUSES = ("unknown", "weak", "learning", "solid", "mastered")

# ⚠️ `SkillMastery.status` a SIX valeurs en base, pas cinq. `in_progress` est écrit par
# le verdict de mission `review_later` et ne sort d'AUCUN `_status_from_score()` : un
# mapping à cinq branches le manquerait en silence. Il se rend comme « en construction ».
_STATUS_ALIASES = {"in_progress": "learning"}


def normalize_status(raw: str | None) -> str:
    """Statut brut de `skill_mastery` → l'un des cinq états lumineux. Jamais d'exception :
    une valeur inconnue retombe sur `unknown` (une étoile pas encore née, pas une erreur)."""
    if not raw:
        return "unknown"
    mapped = _STATUS_ALIASES.get(raw, raw)
    return mapped if mapped in GALAXY_STATUSES else "unknown"


def _intensity(mastery: float | None) -> int:
    """`mastery_score` est sur 0–100 (valeur BRUTE côté évidence), pas 0–1.

    Sert uniquement à moduler la luminosité à l'intérieur d'un état. N'est jamais affiché
    à Massimo, et n'est surtout pas un pourcentage de réussite.
    """
    return max(0, min(100, int(round(mastery or 0.0))))


def _visible_notions(db: Session, *, subject_id: int | None = None) -> list[dict]:
    """Notions visibles de l'année active, dédupliquées par `skill_id`.

    Chaque entrée porte sa leçon validée la plus récente (`updated_at desc`, `id` en
    départage) et donc son chapitre — même règle de départage que `student_subject_notions`,
    pour que la Galaxy et la page Cours racontent la même chose.
    """
    year = _active_year_or_404(db)

    stmt = (
        select(
            Skill.id,
            Skill.name,
            Subject.id,
            Subject.name,
            Subject.slug,
            Chapter.id,
            Chapter.name,
            Chapter.sort_order,
            Lesson.id,
            Lesson.updated_at,
        )
        .join(LessonSkill, LessonSkill.skill_id == Skill.id)
        .join(Lesson, Lesson.id == LessonSkill.lesson_id)
        .join(Chapter, Chapter.id == Lesson.chapter_id)
        .join(SchoolYearSubject, SchoolYearSubject.id == Chapter.school_year_subject_id)
        .join(Subject, Subject.id == SchoolYearSubject.subject_id)
        .where(
            SchoolYearSubject.school_year_id == year.id,
            Chapter.validation_status == "validated",
            Lesson.status == "validated",
        )
    )
    if subject_id is not None:
        stmt = stmt.where(Subject.id == subject_id)

    best: dict[int, dict] = {}
    for (
        skill_id,
        skill_name,
        subj_id,
        subj_name,
        subj_slug,
        chapter_id,
        chapter_name,
        chapter_rank,
        lesson_id,
        updated_at,
    ) in db.execute(stmt).all():
        recency = (updated_at, lesson_id)
        current = best.get(skill_id)
        if current is not None and recency <= current["_recency"]:
            continue
        best[skill_id] = {
            "skill_id": skill_id,
            "name": skill_name,
            "subject_id": subj_id,
            "subject_name": subj_name,
            "subject_slug": subj_slug,
            "chapter_id": chapter_id,
            "chapter_title": chapter_name,
            "chapter_rank": chapter_rank if chapter_rank is not None else 0,
            "lesson_id": lesson_id,
            "_recency": recency,
        }
    return list(best.values())


def overview(db: Session) -> dict:
    """Vue d'ensemble : une constellation par matière de l'année active.

    Une matière sans rien de validé apparaît à 0/0 — jamais filtrée : l'absence de contenu
    n'est pas un manque de l'enfant. Ordre = celui du référentiel, jamais un classement.
    """
    year = _active_year_or_404(db)
    subjects = db.execute(
        select(Subject.id, Subject.name, Subject.slug)
        .join(SchoolYearSubject, SchoolYearSubject.subject_id == Subject.id)
        .where(SchoolYearSubject.school_year_id == year.id)
        .order_by(Subject.sort_order, Subject.id)
    ).all()

    mastery = evidence.mastery_by_skill(db, student_id=get_default_student(db).id)
    per_subject: dict[int, list[int]] = {}
    for notion in _visible_notions(db):
        per_subject.setdefault(notion["subject_id"], []).append(notion["skill_id"])

    out = []
    for subject_id, name, slug in subjects:
        skill_ids = per_subject.get(subject_id, [])
        lit = sum(
            1
            for skill_id in skill_ids
            if normalize_status((mastery.get(skill_id) or {}).get("status")) != "unknown"
        )
        out.append(
            {
                "subject_id": subject_id,
                "name": name,
                "slug": slug,
                "lit": lit,
                "total": len(skill_ids),
            }
        )
    return {"subjects": out}


ROOT_ID = "root"


def full_graph(db: Session) -> dict:
    """Toutes les matières dans UN seul graphe (Accueil).

    Structure : `root` → matières → chapitres → notions. Le `root` n'est pas décoratif —
    sans lui, chaque matière serait une composante isolée que le moteur de forces
    éloignerait, et la galaxie se disloquerait à l'écran.

    Les matières sans rien de validé ne sont pas rendues : un soleil sans planète n'apprend
    rien à Massimo et encombre la vue. Leur absence n'est pas un manque — elles réapparaissent
    dès qu'un contenu est validé.
    """
    notions = _visible_notions(db)
    if not notions:
        return {"nodes": [], "edges": []}

    mastery = evidence.mastery_by_skill(db, student_id=get_default_student(db).id)
    notions.sort(
        key=lambda n: (n["subject_id"], n["chapter_rank"], n["chapter_id"], n["name"].casefold())
    )

    nodes: list[dict] = [{"id": ROOT_ID, "kind": "root", "label": "Ma galaxie"}]
    edges: list[dict] = []
    seen_subjects: set[int] = set()
    seen_chapters: set[int] = set()

    for notion in notions:
        subject_id = notion["subject_id"]
        chapter_id = notion["chapter_id"]
        subject_node = f"subject-{subject_id}"
        chapter_node = f"chapter-{chapter_id}"

        # Chaque nœud porte sa matière : c'est ce qui permet à un clic (ou à une recherche)
        # d'ouvrir directement la bonne constellation, sans second aller-retour serveur.
        slug = notion["subject_slug"]

        if subject_id not in seen_subjects:
            seen_subjects.add(subject_id)
            nodes.append(
                {
                    "id": subject_node,
                    "kind": "subject",
                    "label": notion["subject_name"],
                    "subject_slug": slug,
                }
            )
            edges.append({"source": ROOT_ID, "target": subject_node, "type": "structure"})

        if chapter_id not in seen_chapters:
            seen_chapters.add(chapter_id)
            nodes.append(
                {
                    "id": chapter_node,
                    "kind": "chapter",
                    "label": notion["chapter_title"],
                    "chapter_id": chapter_id,
                    "subject_slug": slug,
                }
            )
            edges.append({"source": subject_node, "target": chapter_node, "type": "structure"})

        entry = mastery.get(notion["skill_id"]) or {}
        nodes.append(
            {
                "id": f"skill-{notion['skill_id']}",
                "kind": "skill",
                "label": notion["name"],
                "skill_id": notion["skill_id"],
                "chapter_id": chapter_id,
                "status": normalize_status(entry.get("status")),
                "intensity": _intensity(entry.get("mastery")),
                "subject_slug": slug,
            }
        )
        edges.append(
            {
                "source": chapter_node,
                "target": f"skill-{notion['skill_id']}",
                "type": "structure",
            }
        )

    return {"nodes": nodes, "edges": edges}


def constellation(db: Session, subject_slug: str) -> dict:
    """Une matière : amas (chapitres) + étoiles (notions) + arêtes de structure.

    404 si la matière est inconnue ou hors année active. `nodes`/`edges` vides (pas une
    erreur) si elle existe mais n'a encore rien de validé — le front a un état positif.
    Un chapitre sans notion visible n'est pas rendu : un amas vide serait du bruit.
    """
    from fastapi import HTTPException, status as http_status

    subject = db.scalars(select(Subject).where(Subject.slug == subject_slug)).first()
    if subject is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Matière « {subject_slug} » inconnue.",
        )
    year = _active_year_or_404(db)
    in_year = db.scalar(
        select(SchoolYearSubject.id).where(
            SchoolYearSubject.school_year_id == year.id,
            SchoolYearSubject.subject_id == subject.id,
        )
    )
    if in_year is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Matière « {subject.name} » absente de l'année active.",
        )

    subject_ref = {
        "subject_id": subject.id,
        "name": subject.name,
        "slug": subject.slug,
    }
    notions = _visible_notions(db, subject_id=subject.id)
    if not notions:
        return {"subject": subject_ref, "nodes": [], "edges": []}

    mastery = evidence.mastery_by_skill(db, student_id=get_default_student(db).id)
    notions.sort(key=lambda n: (n["chapter_rank"], n["chapter_id"], n["name"].casefold()))

    # Cœur de la constellation. Sans lui, chaque chapitre serait une composante isolée du
    # graphe et le moteur de forces les enverrait chacun de son côté : la matière
    # n'apparaîtrait plus comme un tout.
    root_id = f"subject-{subject.id}"
    nodes: list[dict] = [{"id": root_id, "kind": "subject", "label": subject.name}]
    edges: list[dict] = []
    seen_chapters: set[int] = set()
    for notion in notions:
        chapter_id = notion["chapter_id"]
        if chapter_id not in seen_chapters:
            seen_chapters.add(chapter_id)
            nodes.append(
                {
                    "id": f"chapter-{chapter_id}",
                    "kind": "chapter",
                    "label": notion["chapter_title"],
                    "chapter_id": chapter_id,
                }
            )
            edges.append(
                {"source": root_id, "target": f"chapter-{chapter_id}", "type": "structure"}
            )
        entry = mastery.get(notion["skill_id"]) or {}
        nodes.append(
            {
                "id": f"skill-{notion['skill_id']}",
                "kind": "skill",
                "label": notion["name"],
                "skill_id": notion["skill_id"],
                "chapter_id": chapter_id,
                "status": normalize_status(entry.get("status")),
                "intensity": _intensity(entry.get("mastery")),
            }
        )
        edges.append(
            {
                "source": f"chapter-{chapter_id}",
                "target": f"skill-{notion['skill_id']}",
                "type": "structure",
            }
        )

    return {"subject": subject_ref, "nodes": nodes, "edges": edges}


def _has_review_cards(db: Session, *, student_id: int, skill_id: int) -> bool:
    """Au moins une carte SRS ACTIVE pour ce couple élève/notion."""
    return (
        db.scalar(
            select(SpacedReviewCard.id)
            .where(
                SpacedReviewCard.student_id == student_id,
                SpacedReviewCard.skill_id == skill_id,
                SpacedReviewCard.status.not_in(INACTIVE_CARD_STATUSES),
            )
            .limit(1)
        )
        is not None
    )


def timeline(db: Session, *, days: int = 60, with_skills: bool = False) -> dict:
    """Frise de progression : combien d'étoiles Massimo a allumées, jour après jour.

    ⚠️ **Monotone par construction, et c'est le cœur de la décision.** `SkillMastery` peut
    RÉGRESSER (`mastery_score` est une moyenne glissante : un quiz raté la fait baisser, et
    `set_mastery_status` gère explicitement la sortie de « maîtrisé »). Une frise construite
    sur l'état courant montrerait donc la galaxie **s'assombrir** — exactement le cadrage de
    perte que ZETIS bannit.

    On compte donc chaque notion le jour où Massimo l'a travaillée pour la PREMIÈRE fois, en
    lisant `learning_events`, qui est **append-only** et n'est jamais réécrit. La courbe ne
    peut donc que monter : elle raconte le chemin parcouru, jamais un recul.

    Aucune table nouvelle, aucun ordonnanceur : l'historique existe déjà, il suffit de le lire.
    """
    student_id = get_default_student(db).id
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Première trace datée par notion, toutes activités confondues.
    rows = db.execute(
        select(LearningEvent.skill_id, func.min(LearningEvent.created_at))
        .where(
            LearningEvent.student_id == student_id,
            LearningEvent.skill_id.is_not(None),
        )
        .group_by(LearningEvent.skill_id)
    ).all()

    # `with_skills` (ADR-0029) : on cesse simplement de JETER le `skill_id` que la requête
    # ci-dessus calcule déjà. Le rejeu animé a besoin de savoir quelle étoile s'allume quand ;
    # la frise, elle, n'a jamais eu besoin que du compte. Aucune requête supplémentaire.
    skills = (
        sorted(
            (
                {"skill_id": skill_id, "date": created_at.date().isoformat()}
                for skill_id, created_at in rows
                if created_at is not None
            ),
            key=lambda item: (item["date"], item["skill_id"]),
        )
        if with_skills
        else None
    )

    first_seen = sorted(created_at.date() for _, created_at in rows if created_at is not None)
    if not first_seen:
        return {"points": [], "total": 0, "skills": [] if with_skills else None}

    # Les notions travaillées AVANT la fenêtre ne sont pas perdues : elles forment le socle
    # de départ, sinon la courbe repartirait de zéro et nierait le travail déjà fait.
    start = since.date()
    baseline = sum(1 for day in first_seen if day < start)

    points: list[dict] = []
    running = baseline
    for day in first_seen:
        if day < start:
            continue
        running += 1
        if points and points[-1]["date"] == day.isoformat():
            points[-1]["lit"] = running
        else:
            points.append({"date": day.isoformat(), "lit": running})

    return {"points": points, "total": running, "skills": skills}


def _validated_fiche_id(db: Session, lesson_id: int) -> int | None:
    """Fiche de révision VALIDÉE de la leçon qui porte la notion (ADR-0015), sinon None."""
    return db.scalar(
        select(Fiche.id)
        .where(Fiche.lesson_id == lesson_id, Fiche.validation_status == "validated")
        .order_by(Fiche.id.desc())
        .limit(1)
    )


def _validated_capsule_id(db: Session, skill_id: int) -> int | None:
    """Capsule IA VALIDÉE portant la notion (ADR-0005/0007), sinon None.

    Contrairement à la fiche, la capsule est notion-centrée : elle porte `skill_id`.
    """
    return db.scalar(
        select(Capsule.id)
        .where(Capsule.skill_id == skill_id, Capsule.validation_status == "validated")
        .order_by(Capsule.id.desc())
        .limit(1)
    )


def notion_panel(db: Session, skill_id: int) -> dict:
    """Panneau d'actions d'une notion : ce que Massimo peut RÉELLEMENT faire, ici et maintenant.

    404 si la notion n'est pas visible dans l'année active — un id inconnu ne révèle rien.

    Renvoie la panoplie COMPLÈTE de ZETIS, chaque activité portant sa disponibilité
    (révision de l'ADR-0024 §4, décidée le 2026-07-28) : Massimo voit tout ce qu'on sait
    faire d'une notion, et ce qui n'existe pas encore est grisé côté client.
    """
    from fastapi import HTTPException, status as http_status

    notion = next(
        (n for n in _visible_notions(db) if n["skill_id"] == skill_id),
        None,
    )
    if notion is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Notion introuvable.",
        )

    student = get_default_student(db)
    mastery = evidence.mastery_by_skill(db, student_id=student.id)
    entry = mastery.get(skill_id) or {}

    # La panoplie COMPLÈTE, dans un ordre pédagogique stable : comprendre, puis mémoriser,
    # puis se tester. Chaque entrée porte sa disponibilité — le client grise le reste.
    lesson_id = notion["lesson_id"]
    # « Cours disponible » = un cours RÉELLEMENT RÉDIGÉ, pas seulement une leçon validée : une
    # leçon peut être validée sans `content_markdown` (le cours reste à écrire). Sans ce contrôle,
    # `notion_panel` prétendait qu'un cours existe dès que la notion est visible — un mensonge qui
    # ouvrait une porte vide ET empêchait le chat d'enregistrer la demande à Papa (addendum ADR-0027).
    has_course = lesson_id is not None and bool(
        db.scalar(select(Lesson.content_markdown.is_not(None)).where(Lesson.id == lesson_id))
    )
    fiche_id = _validated_fiche_id(db, lesson_id) if lesson_id is not None else None
    quiz_id = _resolve_mission_quiz_id(db, skill_id)
    mindmap_id = _resolve_mission_mindmap_id(db, skill_id)
    capsule_id = _validated_capsule_id(db, skill_id)
    has_cards = _has_review_cards(db, student_id=student.id, skill_id=skill_id)

    actions: list[dict] = [
        {"kind": "cours", "available": has_course, "lesson_id": lesson_id},
        # ELI5 ne dépend d'aucun contenu préexistant : c'est la seule action toujours offerte.
        {"kind": "eli5", "available": True},
        {"kind": "fiche", "available": fiche_id is not None, "fiche_id": fiche_id},
        {"kind": "capsule", "available": capsule_id is not None, "capsule_id": capsule_id},
        {"kind": "mindmap", "available": mindmap_id is not None, "mindmap_id": mindmap_id},
        {"kind": "revision", "available": has_cards},
        {"kind": "quiz", "available": quiz_id is not None, "quiz_id": quiz_id},
    ]

    return {
        "skill_id": skill_id,
        "name": notion["name"],
        "status": normalize_status(entry.get("status")),
        "chapter_title": notion["chapter_title"],
        "subject_slug": notion["subject_slug"],
        "subject_name": notion["subject_name"],
        "actions": actions,
    }
