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

from collections.abc import Sequence
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
from app.modules.gamification import service as gamification
from app.modules.lesson_resolution import lessons_by_skill
from app.modules.evidence import service as evidence
from app.modules.memory.service import INACTIVE_CARD_STATUSES

# Les résolveurs de ressources par notion vivent dans `missions` et sont réutilisés tels
# quels — les réécrire ici les ferait diverger au premier correctif (le mal que l'ADR-0011 §1
# existe pour empêcher). ⚠️ Dette connue : ce sont des fonctions privées d'un autre module ;
# leur extraction vers un module neutre est le bon geste, mais elle modifierait `missions`,
# hors périmètre de cette slice.
# On importe les variantes ENSEMBLISTES : les versions mono de `missions` en sont désormais des
# enveloppes, donc la requête reste unique et partagée (aucune divergence possible).
from app.modules.missions.service import (
    _resolve_mission_mindmap_ids,
    _resolve_mission_quiz_ids,
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

    student = get_default_student(db)
    mastery = evidence.mastery_by_skill(db, student_id=student.id)
    per_subject: dict[int, list[int]] = {}
    for notion in _visible_notions(db):
        per_subject.setdefault(notion["subject_id"], []).append(notion["skill_id"])

    # ⚠️ UN SEUL agrégat pour toutes les matières, lu AVANT la boucle. Appeler
    # `subject_xp_summary` par matière rejouerait le `group_by` à chaque tour — un N+1 sur la
    # page qui liste justement toutes les matières.
    xp_par_matiere = gamification.xp_by_subject(db, student).by_subject

    out = []
    for subject_id, name, slug in subjects:
        skill_ids = per_subject.get(subject_id, [])
        statuts = [normalize_status((mastery.get(skill_id) or {}).get("status")) for skill_id in skill_ids]
        out.append(
            {
                "subject_id": subject_id,
                "name": name,
                "slug": slug,
                "lit": sum(1 for statut in statuts if statut != "unknown"),
                "total": len(skill_ids),
                "xp": gamification.xp_block(xp_par_matiere.get(subject_id, 0)),
                # Ce que Massimo TIENT. Aucun pendant « à renforcer » n'est calculé ici : le §5
                # interdit de classer les matières, et désigner les faibles en est la forme la
                # plus directe.
                "mastered": sum(1 for statut in statuts if statut == "mastered"),
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


def _validated_fiche_ids(db: Session, lesson_ids: Sequence[int]) -> dict[int, int]:
    """`lesson_id` → id de la fiche VALIDÉE la plus récente (ADR-0015), pour un lot de leçons.

    `MAX(Fiche.id)` groupé reproduit exactement l'`ORDER BY id DESC LIMIT 1` de la version
    mono d'origine. Une requête, quel que soit le nombre de leçons.
    """
    ids = [lesson_id for lesson_id in lesson_ids if lesson_id is not None]
    if not ids:
        return {}
    rows = db.execute(
        select(Fiche.lesson_id, func.max(Fiche.id))
        .where(Fiche.lesson_id.in_(ids), Fiche.validation_status == "validated")
        .group_by(Fiche.lesson_id)
    ).all()
    return {lesson_id: fiche_id for lesson_id, fiche_id in rows if fiche_id is not None}


def _validated_capsule_ids(db: Session, skill_ids: Sequence[int]) -> dict[int, int]:
    """`skill_id` → id de la capsule IA VALIDÉE la plus récente (ADR-0005/0007).

    Contrairement à la fiche, la capsule est notion-centrée : elle porte `skill_id`.
    """
    ids = [skill_id for skill_id in skill_ids if skill_id is not None]
    if not ids:
        return {}
    rows = db.execute(
        select(Capsule.skill_id, func.max(Capsule.id))
        .where(Capsule.skill_id.in_(ids), Capsule.validation_status == "validated")
        .group_by(Capsule.skill_id)
    ).all()
    return {skill_id: capsule_id for skill_id, capsule_id in rows if capsule_id is not None}


def _skills_with_review_cards(
    db: Session, *, student_id: int, skill_ids: Sequence[int]
) -> set[int]:
    """Les notions du lot qui ont au moins une carte SRS ACTIVE pour cet élève."""
    ids = [skill_id for skill_id in skill_ids if skill_id is not None]
    if not ids:
        return set()
    return set(
        db.scalars(
            select(SpacedReviewCard.skill_id)
            .where(
                SpacedReviewCard.student_id == student_id,
                SpacedReviewCard.skill_id.in_(ids),
                SpacedReviewCard.status.not_in(INACTIVE_CARD_STATUSES),
            )
            .distinct()
        ).all()
    )


def _course_lessons_by_skill(db: Session, skill_ids: Sequence[int]) -> dict[int, tuple[int, bool]]:
    """`skill_id` → (`lesson_id` retenue, un cours y est-il RÉDIGÉ ?), pour un lot de notions.

    La leçon retenue est la MÊME que celle de `_visible_notions` : la plus récente des leçons
    validées d'un chapitre validé de l'année active (`updated_at desc`, `id` en départage). Elle
    est résolue **ici**, et non déduite du contexte de l'appelant, pour que `notion_panel` et la
    page matière désignent toujours la même leçon — une notion enseignée dans deux matières
    donnerait sinon deux réponses selon le chemin d'appel.

    « Cours disponible » = un cours RÉELLEMENT RÉDIGÉ, pas seulement une leçon validée : une leçon
    peut être validée sans `content_markdown` (le cours reste à écrire). Sans ce contrôle,
    `notion_panel` prétendait qu'un cours existe dès que la notion est visible — un mensonge qui
    ouvrait une porte vide ET empêchait le chat d'enregistrer la demande à Papa (addendum ADR-0027).
    """
    # ⚠️ L'ordre et le périmètre ne sont plus écrits ici (ADR-0037) : ils vivent dans
    # `lesson_resolution`, que la production et `canonical_context` interrogent aussi. Ce module
    # n'était pas fautif — c'est LUI qui avait raison — mais trois copies de la même question
    # donnaient trois réponses, dont une qui faisait produire du contenu invisible.
    #
    # Ce qui RESTE ici est le gate propre à la galaxie : seules les leçons `validated` sont
    # atteignables par Massimo. Le résolveur partagé rend aussi les brouillons, parce que la
    # production en a besoin au palier 3 — le filtrer là-bas supprimerait ce palier.
    par_notion = lessons_by_skill(db, skill_ids)
    best: dict[int, tuple[int, bool]] = {}
    for skill_id, lecons in par_notion.items():
        validee = next((l for l in lecons if l.status == "validated"), None)
        if validee is not None:
            best[skill_id] = (validee.id, validee.content_markdown is not None)
    return best


def resolve_panoply(
    db: Session, *, student_id: int, skill_ids: Sequence[int]
) -> dict[int, list[dict]]:
    """LE prédicat de disponibilité de ZETIS : pour chaque notion, la panoplie complète.

    **Un seul prédicat dans le dépôt** (addendum ADR-0024). `notion_panel` en est le consommateur
    mono-notion, la page matière le consommateur en lot. Le correctif du 2026-07-30 a déjà prouvé
    ce qu'un second coûte : le cours était annoncé disponible sur `lesson_id is not None` d'un
    côté et sur `content_markdown IS NOT NULL` de l'autre — une porte ouverte sur du vide.

    Le **nombre de requêtes est constant**, indépendant du nombre de notions : chaque résolveur
    travaille en `IN (:skill_ids)` puis regroupe en mémoire. C'est ce qui rend la page matière
    tenable sur une matière entière (référence `production/coverage.py` : 69 leçons, 18 requêtes).

    L'ordre des activités est **pédagogique et stable** — comprendre, puis mémoriser, puis se
    tester — et il est porté ici, pas par le client : les deux surfaces le rendent identique.
    """
    ids = [skill_id for skill_id in skill_ids if skill_id is not None]
    if not ids:
        return {}

    lessons = _course_lessons_by_skill(db, ids)
    fiches = _validated_fiche_ids(db, [lesson_id for lesson_id, _ in lessons.values()])
    capsules = _validated_capsule_ids(db, ids)
    mindmaps = _resolve_mission_mindmap_ids(db, ids)
    quizzes = _resolve_mission_quiz_ids(db, ids)
    with_cards = _skills_with_review_cards(db, student_id=student_id, skill_ids=ids)

    out: dict[int, list[dict]] = {}
    for skill_id in ids:
        lesson_id, has_course = lessons.get(skill_id, (None, False))
        fiche_id = fiches.get(lesson_id) if lesson_id is not None else None
        capsule_id = capsules.get(skill_id)
        mindmap_id = mindmaps.get(skill_id)
        quiz_id = quizzes.get(skill_id)
        out[skill_id] = [
            {"kind": "cours", "available": has_course, "lesson_id": lesson_id},
            # ELI5 se génère à la volée, mais il n'invente pas : il s'ancre sur le cours canonique
            # (ADR-0011) et DÉGRADE vers le modèle quand il n'y en a pas. L'offrir sans cours
            # validé, c'est router Massimo vers du non-validé — ce que l'orchestrateur refusait
            # déjà de son côté (2026-07-30). La règle vit désormais ICI, pour les deux surfaces :
            # portée par la page, elle se serait redédoublée un cran plus haut.
            {"kind": "eli5", "available": has_course},
            {"kind": "fiche", "available": fiche_id is not None, "fiche_id": fiche_id},
            {"kind": "capsule", "available": capsule_id is not None, "capsule_id": capsule_id},
            {"kind": "mindmap", "available": mindmap_id is not None, "mindmap_id": mindmap_id},
            {"kind": "revision", "available": skill_id in with_cards},
            {"kind": "quiz", "available": quiz_id is not None, "quiz_id": quiz_id},
        ]
    return out


def is_notion_visible(db: Session, skill_id: int) -> bool:
    """Cette notion est-elle visible de Massimo (année active, chapitre ET leçon validés) ?

    Même chaîne que `_visible_notions` — c'est le point d'entrée public pour les modules qui
    doivent la vérifier sans construire de panneau (addendum ADR-0027 : sans ce contrôle, la
    route de demande devient un oracle d'existence sur les brouillons de Papa).
    """
    return any(n["skill_id"] == skill_id for n in _visible_notions(db))


def notion_panel(db: Session, skill_id: int) -> dict:
    """Panneau d'actions d'une notion : ce que Massimo peut RÉELLEMENT faire, ici et maintenant.

    404 si la notion n'est pas visible dans l'année active — un id inconnu ne révèle rien.

    Renvoie la panoplie COMPLÈTE de ZETIS, chaque activité portant sa disponibilité
    (révision de l'ADR-0024 §4, décidée le 2026-07-28) : Massimo voit tout ce qu'on sait
    faire d'une notion, et ce qui n'existe pas encore est grisé côté client.

    Consommateur **mono-notion** de `resolve_panoply` : il ne calcule aucune disponibilité
    lui-même. Toute règle ajoutée ici et non là-bas rouvrirait la divergence.
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
    actions = resolve_panoply(db, student_id=student.id, skill_ids=[skill_id])[skill_id]

    return {
        "skill_id": skill_id,
        "name": notion["name"],
        "status": normalize_status(entry.get("status")),
        "chapter_title": notion["chapter_title"],
        "subject_slug": notion["subject_slug"],
        "subject_name": notion["subject_name"],
        "actions": actions,
    }


def subject_panoply(db: Session, subject_slug: str) -> dict:
    """Index des notions d'une matière : chapitres → notions, chacune avec sa panoplie.

    Le **second rendu du modèle galaxie** (addendum ADR-0024) : mêmes données que la
    constellation, en liste — c'est le repli sans WebGL promis par `zetis-galaxy.md §11`.

    404 si la matière est inconnue ou hors année active. `chapters: []` (pas une erreur) si elle
    existe mais n'a encore rien de validé — le front a un état positif.

    ⚠️ **`mastery_score` n'entre pas dans cette charge utile.** `status` seul (ADR-0024 §5) : un
    pourcentage par matière est précisément ce que cette page n'affiche pas, et une valeur servie
    finit toujours par être affichée.
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

    subject_ref = {"subject_id": subject.id, "name": subject.name, "slug": subject.slug}
    student = get_default_student(db)

    # L'effort de Massimo dans cette matière (addendum ADR-0024 « page matière onglets »).
    #
    # ⚠️ Calculé AVANT le repli `chapters: []`, et servi dans les deux cas : le XP appartient à
    # l'élève, pas au catalogue. Une matière dont Papa a dévalidé les chapitres ne doit pas
    # effacer le travail déjà fait.
    #
    # Le calcul vit dans `gamification`, qui est le grand livre de l'économie XP : ni le cumul par
    # matière (`xp_by_subject`, ADR-0038 §3) ni le barème de niveau ne sont réécrits ici. Une
    # seconde façon de compter l'XP est exactement la dette que `SubjectXP` prévient d'éviter.
    xp_ref = gamification.subject_xp_summary(db, student, subject_id=subject.id)

    notions = _visible_notions(db, subject_id=subject.id)
    if not notions:
        return {"subject": subject_ref, "subject_xp": xp_ref, "chapters": []}

    mastery = evidence.mastery_by_skill(db, student_id=student.id)
    panoply = resolve_panoply(
        db, student_id=student.id, skill_ids=[n["skill_id"] for n in notions]
    )

    # Ordre du référentiel pour les chapitres, alphabétique pour les notions — jamais un
    # classement par maîtrise : l'index décrit le catalogue, il ne trie pas Massimo.
    notions.sort(key=lambda n: (n["chapter_rank"], n["chapter_id"], n["name"].casefold()))

    chapters: list[dict] = []
    by_chapter: dict[int, dict] = {}
    for notion in notions:
        chapter = by_chapter.get(notion["chapter_id"])
        if chapter is None:
            chapter = {
                "chapter_id": notion["chapter_id"],
                "title": notion["chapter_title"],
                "notions": [],
            }
            by_chapter[notion["chapter_id"]] = chapter
            chapters.append(chapter)
        entry = mastery.get(notion["skill_id"]) or {}
        chapter["notions"].append(
            {
                "skill_id": notion["skill_id"],
                "name": notion["name"],
                "status": normalize_status(entry.get("status")),
                "actions": panoply.get(notion["skill_id"], []),
            }
        )

    return {"subject": subject_ref, "subject_xp": xp_ref, "chapters": chapters}


# --- « Reprendre » : le dernier contenu RÉOUVRABLE d'une matière -------------------------------
#
# Le doc de page refusait cette carte depuis le 2026-08-01 (« aucune route ne sert cette donnée,
# et l'inventer aurait menti »). Le read-before-code du 2026-08-11 a levé la réserve : les
# payloads de `learning_events` portent bien de quoi rouvrir — mais **pas pour tous les types**.
#
# 🔴 **Ne sont servis QUE les types qui se rouvrent EXACTEMENT**, et c'est tout l'intérêt de la
# carte :
#   • `cours` → `/subjects/:slug/cours?lesson=<id>`, qui met la leçon en avant (le lien profond
#     existe depuis l'addendum ADR-0025 §15, ajouté pour l'agenda) ;
#   • `quiz`  → la session du quiz, par son `quiz_id`.
#
# **Écartés, et ce n'est pas un oubli** : `fiche` (aucun lien profond — `/fiches/:slug` ouvre le
# deck) et `revision` (`/revision?subject=` LANCE une nouvelle session, il ne reprend rien).
# Nommer un contenu précis pour atterrir sur une liste, c'est la dette `capsule_id` déjà
# consignée (« le libellé sur-promet ») et le bouton mort de l'ADR-0050. Mieux vaut trois cartes
# que deux mensonges.
#
# ⚠️ **Frontière avec `activity`, dont la doctrine est inverse** (« un enfant chronométré
# travaille pour le chronomètre ») : aucune minute, aucune session, aucun compte, aucun score ne
# sort d'ici. Un signet, pas une mesure.

# ⚠️ **Table EXPLICITE `event_type → (kind, clé de payload)`**, et surtout pas une liste de types
# avec un `else` implicite. Écrit ainsi après un sabotage du 2026-08-11 : une première version
# faisait `kind = "cours" if ... else "quiz"`, si bien qu'ajouter `fiche_viewed` à la liste
# l'étiquetait en QUIZ — filtré seulement par accident, parce que son payload n'a pas de
# `quiz_id`. Le test-verrou restait vert sur du code faux. Ici, un type absent de la table
# n'entre pas, et il n'existe aucune branche par défaut pour le rattraper.
RESUME_KINDS: dict[str, tuple[str, str]] = {
    "lesson_viewed": ("cours", "lesson_id"),
    "quiz_attempted": ("quiz", "quiz_id"),
}
RESUME_EVENTS = tuple(RESUME_KINDS)
RESUME_LIMIT = 3
# Fenêtre de balayage du journal, bornée serveur. Large devant `RESUME_LIMIT` pour absorber les
# répétitions (rouvrir dix fois la même leçon ne doit pas vider la carte de ses autres entrées).
RESUME_SCAN = 80


def subject_resume(db: Session, subject_slug: str) -> dict:
    """Les derniers contenus de cette matière que Massimo peut ROUVRIR tels quels.

    404 si la matière est inconnue ou hors année active — comme la panoplie. `items: []` si rien
    n'est réouvrable : un état normal, pas une erreur.

    🔴 **Le contenu doit être ENCORE VISIBLE**, pas seulement avoir été vu : une leçon que Papa a
    dévalidée depuis, ou un quiz archivé, sont retirés. Sans ce filtre, la carte ouvrirait une
    porte sur du vide — le défaut que l'addendum du 2026-07-30 a déjà coûté une fois. Le gate de
    visibilité n'est pas réécrit ici : il vient de `_visible_notions`, le prédicat unique.
    """
    from fastapi import HTTPException, status as http_status

    subject = db.scalars(select(Subject).where(Subject.slug == subject_slug)).first()
    if subject is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Matière « {subject_slug} » inconnue.",
        )
    year = _active_year_or_404(db)
    if db.scalar(
        select(SchoolYearSubject.id).where(
            SchoolYearSubject.school_year_id == year.id,
            SchoolYearSubject.subject_id == subject.id,
        )
    ) is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Matière « {subject.name} » absente de l'année active.",
        )

    student = get_default_student(db)
    rows = db.execute(
        select(LearningEvent.event_type, LearningEvent.payload_json, LearningEvent.created_at)
        .where(
            LearningEvent.student_id == student.id,
            LearningEvent.subject_id == subject.id,
            LearningEvent.event_type.in_(RESUME_EVENTS),
        )
        .order_by(LearningEvent.created_at.desc())
        .limit(RESUME_SCAN)
    ).all()

    # Dédupe : une leçon rouverte dix fois ne compte qu'une, à sa date la plus récente. Sans
    # cela, la carte afficherait trois fois le même contenu.
    seen: set[tuple[str, int]] = set()
    candidats: list[dict] = []
    for event_type, payload, created_at in rows:
        mapping = RESUME_KINDS.get(event_type)
        if mapping is None:
            continue  # aucune branche par défaut : un type non déclaré n'est pas deviné
        kind, cle = mapping
        target = (payload or {}).get(cle)
        if not isinstance(target, int):
            continue  # payload incomplet : on ne devine pas
        if (kind, target) in seen:
            continue
        seen.add((kind, target))
        candidats.append({"kind": kind, "target_id": target, "at": created_at})

    lesson_ids = [c["target_id"] for c in candidats if c["kind"] == "cours"]
    quiz_ids = [c["target_id"] for c in candidats if c["kind"] == "quiz"]

    # Titres résolus SERVEUR, et jamais lus depuis le payload : `lesson_title` y est figé à
    # l'instant du clic, donc périmé si la leçon a été renommée depuis.
    lessons: dict[int, str] = {}
    if lesson_ids:
        # Encore visibles = encore dans la chaîne année active → chapitre validé → leçon validée.
        visibles = {n["lesson_id"] for n in _visible_notions(db, subject_id=subject.id)}
        lessons = {
            row_id: title
            for row_id, title in db.execute(
                select(Lesson.id, Lesson.title).where(Lesson.id.in_(lesson_ids))
            ).all()
            if row_id in visibles
        }

    quizzes: dict[int, str] = {}
    if quiz_ids:
        from app.db.models import Quiz

        quizzes = dict(
            db.execute(
                select(Quiz.id, Quiz.title).where(
                    Quiz.id.in_(quiz_ids),
                    Quiz.subject_id == subject.id,
                    # `archived` = retiré par Papa, mais conservé pour ses tentatives
                    # (ADR-0014 Décision 3). Rouvrable : non.
                    Quiz.status != "archived",
                    Quiz.validation_status == "validated",
                )
            ).all()
        )

    items = []
    for candidat in candidats:
        titre = (lessons if candidat["kind"] == "cours" else quizzes).get(candidat["target_id"])
        if titre is None:
            continue  # disparu ou dévalidé depuis : on ne propose pas une porte fermée
        items.append(
            {
                "kind": candidat["kind"],
                "title": titre,
                "target_id": candidat["target_id"],
                "at": candidat["at"].isoformat() if candidat["at"] else None,
            }
        )
        if len(items) >= RESUME_LIMIT:
            break

    return {"subject": {"subject_id": subject.id, "name": subject.name, "slug": subject.slug},
            "items": items}
