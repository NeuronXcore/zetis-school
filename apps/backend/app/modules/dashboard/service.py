"""Assemblage de l'agrégat unique du dashboard Papa (ADR-0028 §1, §2).

**Une seule requête HTTP au premier rendu**, quatre fenêtres (7 / 30 / 90 / 365) dans la même réponse,
séries livrées PAR MATIÈRE et jamais pré-agrégées : « toutes matières » est une somme que le
client calcule. C'est la condition technique pour que changer de période, de matière ou de focus
ne déclenche aucun aller-retour réseau.

Ce module ne décide d'aucun statut pédagogique : il lit `progress` pour « consolidée » et
« fragile » (§3 bis), `missions` pour « lacune sans mission », `memory` pour les cartes dues. La
frontière du §3 tient tant qu'aucun seuil n'est recalculé ici.
"""

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import (
    Chapter,
    ContentRequest,
    Fiche,
    Gap,
    LearningEvent,
    Lesson,
    LessonSkill,
    Mission,
    NotionRequest,
    Quiz,
    RagDocument,
    SchoolYear,
    SchoolYearSubject,
    Skill,
    SkillMastery,
    SkillMasteryHistory,
    SpacedReviewAttempt,
    SpacedReviewCard,
    StudentProfile,
    Subject,
)
from app.modules.activity import service as activity_service
from app.modules.missions import service as missions_service
from app.modules.activity.timeutils import (
    local_day,
    range_bounds_utc,
    to_utc,
    today_local,
    week_start,
)
from app.modules.dashboard import projections as p
from app.modules.production.coverage import actionable_gaps
from app.modules.review_queue import service as review_queue
from app.modules.progress.service import OPEN_GAP_STATUSES, skills_with_active_mission

# Fenêtre de la heatmap calendrier — indépendante du sélecteur de période, qui ne pilote que les
# KPI et les séries. La grille est là pour la tendance longue (adr-0028 §6).
CALENDAR_WEEKS = 26
REVIEW_LOAD_DAYS = 14

# Les quatre notes de `SpacedReviewAttempt`, de la plus mauvaise à la meilleure. L'ORDRE compte :
# c'est celui de l'empilement de la carte, et il doit aller du raté (en bas) au su (en haut) pour
# qu'une pile qui s'éclaircit se lise comme un progrès.
REVIEW_RATINGS = ("again", "hard", "good", "easy")

_ACTIVE_MISSION_STATUSES = ("planned", "active")


# ==================================================================================================
# Chargements
# ==================================================================================================


def _active_year(db: Session, student_id: int) -> SchoolYear | None:
    return db.scalars(
        select(SchoolYear)
        .where(SchoolYear.student_id == student_id, SchoolYear.status == "active")
        .order_by(SchoolYear.id.desc())
        .limit(1)
    ).first()


def _events(db: Session, *, student_id: int, first_day: date, last_day: date) -> list[LearningEvent]:
    """Journal d'activité de la fenêtre la plus large, chargé UNE fois puis projeté.

    Passe par `activity.service._load_events` ? Non : celui-ci filtre par matière et on a besoin
    de TOUT pour ventiler ensuite en mémoire. On reprend en revanche son exclusion — les
    événements d'agenda sont déclaratifs et ne comptent dans aucune projection d'activité
    (ADR-0025 §3, piège déjà tombé trois fois).
    """
    from app.modules.activity.events import NON_ACTIVITY_EVENTS

    start, end = range_bounds_utc(first_day, last_day)
    return list(
        db.scalars(
            select(LearningEvent)
            .where(
                LearningEvent.student_id == student_id,
                LearningEvent.created_at >= start,
                LearningEvent.created_at < end,
                LearningEvent.event_type.not_in(NON_ACTIVITY_EVENTS),
            )
            .order_by(LearningEvent.created_at, LearningEvent.id)
        ).all()
    )


def _skills_by_subject(db: Session) -> dict[int, list[int]]:
    rows = db.execute(select(Skill.subject_id, Skill.id)).all()
    grouped: dict[int, list[int]] = {}
    for subject_id, skill_id in rows:
        grouped.setdefault(subject_id, []).append(skill_id)
    return grouped


def _mastery_rows(db: Session, student_id: int) -> list[tuple[int, int, str]]:
    """`(subject_id, skill_id, status)` des notions ayant une ligne de maîtrise."""
    return [
        (subject_id, skill_id, status)
        for subject_id, skill_id, status in db.execute(
            select(Skill.subject_id, SkillMastery.skill_id, SkillMastery.status)
            .join(Skill, Skill.id == SkillMastery.skill_id)
            .where(SkillMastery.student_id == student_id)
        ).all()
    ]


def _entered_fragile_at(db: Session, student_id: int) -> dict[int, date]:
    """Date de la DERNIÈRE entrée en statut fragile, par notion (`skill_mastery_history`).

    Alimente la reconstruction de la courbe ambre (`projections.reconstruct_series`). Une notion
    absente de ce dictionnaire est réputée fragile depuis avant la mise en service de
    l'historique : elle compte sur toute la fenêtre plutôt que d'apparaître d'un coup.
    """
    rows = db.execute(
        select(SkillMasteryHistory.skill_id, func.max(SkillMasteryHistory.changed_at))
        .where(
            SkillMasteryHistory.student_id == student_id,
            SkillMasteryHistory.status.in_(tuple(p.FRAGILE_STATUSES)),
        )
        .group_by(SkillMasteryHistory.skill_id)
    ).all()
    return {skill_id: local_day(changed_at) for skill_id, changed_at in rows if changed_at}


def _entered_in_progress_at(db: Session, student_id: int) -> dict[int, date]:
    """Symétrique de `_entered_fragile_at` pour les statuts « en cours » (`solid`, `in_progress`).

    Même convention, mêmes limites : une notion absente est réputée « en cours » depuis avant la
    mise en service de l'historique. Sert la QUATRIÈME série, sans laquelle ni le taux de rétention
    (dénominateur) ni l'aire empilée ne peuvent être tracés dans le temps.
    """
    rows = db.execute(
        select(SkillMasteryHistory.skill_id, func.max(SkillMasteryHistory.changed_at))
        .where(
            SkillMasteryHistory.student_id == student_id,
            SkillMasteryHistory.status.in_(tuple(p.IN_PROGRESS_STATUSES)),
        )
        .group_by(SkillMasteryHistory.skill_id)
    ).all()
    return {skill_id: local_day(changed_at) for skill_id, changed_at in rows if changed_at}


def _history_since(db: Session, student_id: int) -> date | None:
    """Délègue à `evidence.history_since` — voir là-bas pour la doctrine.

    Sert ici à faire EXPIRER l'avertissement sur la jeunesse de la courbe ambre : le client ne
    l'affiche que si la fenêtre regardée commence AVANT cette date (addendum ADR-0028 §5 octies).

    ⚠️ La fonction a été remontée dans `evidence` par l'adr-0040 §10 : elle a désormais trois
    consommateurs (ici, Progression, le Conseil au Lot 3). En garder une copie locale ferait deux
    bornes de trace sous un même nom — exactement ce que le §9 interdit.
    """
    from app.modules.evidence import service as evidence

    return evidence.history_since(db, student_id=student_id)


def _mastered_at(db: Session, student_id: int) -> dict[int, date]:
    rows = db.execute(
        select(SkillMastery.skill_id, SkillMastery.mastered_at).where(
            SkillMastery.student_id == student_id,
            SkillMastery.status == "mastered",
            SkillMastery.mastered_at.is_not(None),
        )
    ).all()
    return {skill_id: local_day(when) for skill_id, when in rows if when}


def _review_attempts(
    db: Session, student_id: int, first_day: date
) -> dict[int, list[tuple[str, date]]]:
    """Passages SRS notés, par matière : `(note, jour)`.

    C'est la seule donnée du dépôt qui mesure la mémoire elle-même plutôt qu'un palier de maîtrise :
    une carte revue, une note, une date. `SpacedReviewAttempt` la porte depuis la slice SRS.

    ⚠️ Les attempts `is_consolidation` sont **exclus**, et depuis l'ADR-0049 ils recouvrent **deux**
    situations, pas une — d'où la règle, réécrite pour couvrir les deux :

    **`is_consolidation` veut dire « cet attempt n'a pas mesuré l'oubli ».** Cette vue-là ne compte
    que ce qui le mesure.

    - **Re-tour** (même carte, même jour) : la révision n'a eu lieu qu'une fois, la compter deux
      fois la doublerait.
    - **Session chapitre** (ADR-0049) : la carte **n'était pas due**. Massimo a révisé avant un
      contrôle, ce qui est du vrai travail — mais ce n'est pas une mesure d'oubli, et l'y faire
      entrer ferait passer pour de la mémoire ce qui n'est que de la préparation.

    ⚠️ Le travail lui-même n'est pas perdu pour autant : il reste dans le journal d'activité
    (`review_attempted`), dans l'XP (`reason = "review_chapter"`) et dans la régularité douce.
    """
    rows = db.execute(
        select(Skill.subject_id, SpacedReviewAttempt.rating, SpacedReviewAttempt.reviewed_at)
        .join(SpacedReviewCard, SpacedReviewCard.id == SpacedReviewAttempt.card_id)
        .join(Skill, Skill.id == SpacedReviewCard.skill_id)
        .where(
            SpacedReviewAttempt.student_id == student_id,
            SpacedReviewAttempt.reviewed_at >= range_bounds_utc(first_day, first_day)[0],
            SpacedReviewAttempt.is_consolidation.is_(False),
        )
    ).all()

    grouped: dict[int, list[tuple[str, date]]] = {}
    for subject_id, rating, reviewed_at in rows:
        if subject_id is None or not reviewed_at:
            continue
        grouped.setdefault(subject_id, []).append((rating, local_day(reviewed_at)))
    return grouped


def _mastery_transitions(db: Session, student_id: int) -> dict[int, list[tuple[int, str, date]]]:
    """Bascules de maîtrise par matière : `(skill_id, statut APRÈS, jour)`.

    Alimente `projections.consolidation_flux`. Contrairement à `_entered_fragile_at`, qui ne garde
    que la DERNIÈRE entrée par notion, on rend ici **toutes** les lignes : un flux se perd dès qu'on
    dédoublonne, puisque c'est précisément l'aller-retour qu'il doit montrer.
    """
    rows = db.execute(
        select(
            Skill.subject_id,
            SkillMasteryHistory.skill_id,
            SkillMasteryHistory.status,
            SkillMasteryHistory.changed_at,
        )
        .join(Skill, Skill.id == SkillMasteryHistory.skill_id)
        .where(SkillMasteryHistory.student_id == student_id)
    ).all()

    grouped: dict[int, list[tuple[int, str, date]]] = {}
    for subject_id, skill_id, status, changed_at in rows:
        if subject_id is None or not changed_at:
            continue
        grouped.setdefault(subject_id, []).append((skill_id, status, local_day(changed_at)))
    return grouped


def _covered_at(db: Session) -> dict[int, date]:
    """Date à laquelle une notion a été couverte par un cours validé (`Lesson.validated_at`).

    `lessons` utilise `status`, pas `validation_status` : deux conventions coexistent dans le
    dépôt et interroger la mauvaise colonne rendrait un ensemble vide sans lever d'erreur.
    """
    rows = db.execute(
        select(LessonSkill.skill_id, func.min(Lesson.validated_at))
        .join(Lesson, Lesson.id == LessonSkill.lesson_id)
        .where(Lesson.status == "validated")
        .group_by(LessonSkill.skill_id)
    ).all()
    return {skill_id: local_day(when) for skill_id, when in rows if when}


def _covered_skill_ids(db: Session) -> set[int]:
    return {
        skill_id
        for (skill_id,) in db.execute(
            select(LessonSkill.skill_id)
            .join(Lesson, Lesson.id == LessonSkill.lesson_id)
            .where(Lesson.status == "validated")
            .distinct()
        ).all()
    }


def _review_load(db: Session, student_id: int, today: date) -> dict[int, list[int]]:
    """Cartes SRS dues par matière sur les 14 jours à venir, J+0 → J+13.

    Reprend les filtres de `memory/service` (`due_at` non nul, statuts inactifs exclus) : une
    carte suspendue ou archivée n'est pas une charge de travail.
    """
    from app.modules.memory.service import INACTIVE_CARD_STATUSES

    start, end = range_bounds_utc(today, today + timedelta(days=REVIEW_LOAD_DAYS - 1))
    rows = db.execute(
        select(Skill.subject_id, SpacedReviewCard.due_at)
        .join(Skill, Skill.id == SpacedReviewCard.skill_id)
        .where(
            SpacedReviewCard.student_id == student_id,
            SpacedReviewCard.due_at.is_not(None),
            SpacedReviewCard.due_at >= start,
            SpacedReviewCard.due_at < end,
            SpacedReviewCard.status.not_in(tuple(INACTIVE_CARD_STATUSES)),
        )
    ).all()

    load: dict[int, list[int]] = {}
    for subject_id, due_at in rows:
        offset = (local_day(due_at) - today).days
        if 0 <= offset < REVIEW_LOAD_DAYS:
            load.setdefault(subject_id, [0] * REVIEW_LOAD_DAYS)[offset] += 1
    return load


def _referentiel_subjects(db: Session, year_id: int | None) -> set[int]:
    """Matières de l'année active qui ont au moins un chapitre — le reste est un trou à nommer."""
    if year_id is None:
        return set()
    return {
        subject_id
        for (subject_id,) in db.execute(
            select(SchoolYearSubject.subject_id)
            .join(Chapter, Chapter.school_year_subject_id == SchoolYearSubject.id)
            .where(SchoolYearSubject.school_year_id == year_id)
            .distinct()
        ).all()
    }


# ==================================================================================================
# File « À décider »
# ==================================================================================================

# Où mène chaque part du détail « 26 cours · 1 fiche · 5 capsules » (ADR-0039 §5).
#
# **Les cinq familles vont à la file**, sans exception. Les cours avaient d'abord été routés vers
# `/couverture?filter=no_lesson` — la Couverture porte la validation en lot par chapitre, donc le
# geste qui traite 26 cours sans les ouvrir un à un. Décision REVUE par Papa après l'avoir vue à
# l'écran (2026-08-05, ADR-0039 §5) : relire un cours se fait un par un, avec « Voir → » pour lire
# avant de trancher, et une file où quatre familles sur cinq atterrissent laisse la cinquième
# ailleurs sans raison lisible.
#
# ⚠️ La pilule « 🔒 Non validées » de la Couverture n'est PAS retirée : la validation en lot reste
# le bon geste quand Papa a relu un chapitre entier. Ce sont deux gestes différents, pas deux
# chemins vers le même.
_VALIDATION_HREFS: dict[str, str] = {
    "lesson": "/relecture?kind=lesson",
    "fiche": "/relecture?kind=fiche",
    "mindmap": "/relecture?kind=mindmap",
    "capsule": "/relecture?kind=capsule",
    "chapter": "/relecture?kind=chapter",
    "diagnostic": "/relecture?kind=diagnostic",
}


def _inbox(db: Session, student_id: int, year_id: int | None) -> list[dict]:
    """Cinq familles d'items en attente d'une décision de Papa, dans un ordre FIXE.

    L'ordre encode la priorité pédagogique, pas la chronologie : ce qui bloque la diffusion d'un
    contenu passe avant ce qui n'attend qu'un rangement.

    ⚠️ **Les quiz de mission et de fin de cours n'y figurent pas** : servis sans gate par doctrine
    (ADR-0014 §2). Le **diagnostic**, lui, y figure depuis l'ADR-0043 — il ne dérive d'aucun
    substrat validé, l'exemption ne s'y appliquait pas. Aucun compte n'est écrit ici : tout vient
    de `review_queue.KINDS`, donc la 6ᵉ famille est arrivée sans qu'on touche à cette fonction.
    """
    items: list[dict] = []

    # Les comptes ne sont plus calculés ici : ils viennent de `review_queue`, qui sert AUSSI la page
    # `/relecture` (ADR-0039 §2). Une seconde façon de compter les objets en attente ferait diverger
    # deux surfaces sur la même population — le défaut exact que l'addendum ADR-0028 a corrigé.
    pending = review_queue.pending_counts(db, year_id)
    total_pending = sum(pending.values())
    if total_pending:
        segments = [
            {
                "kind": kind,
                "count": pending[kind],
                "label": review_queue.kind_label(kind, pending[kind]),
                "href": _VALIDATION_HREFS[kind],
            }
            for kind in review_queue.KINDS
            if pending[kind]
        ]
        items.append(
            {
                "kind": "validation",
                "count": total_pending,
                "label": f"{total_pending} contenu{'s' if total_pending > 1 else ''} en attente de relecture",
                # `detail` reste servi : il est le repli du front quand `breakdown` est vide, et il
                # garde la ligne lisible pour tout consommateur qui ignorerait le nouveau champ.
                "detail": " · ".join(segment["label"] for segment in segments),
                "href": "/relecture",
                "breakdown": segments,
            }
        )

    orphan_gaps = _gaps_without_mission(db, student_id)
    if orphan_gaps:
        items.append(
            {
                "kind": "gap",
                "count": len(orphan_gaps),
                "label": (
                    f"{len(orphan_gaps)} notion{'s' if len(orphan_gaps) > 1 else ''} à renforcer "
                    "sans mission active"
                ),
                "detail": " · ".join(orphan_gaps[:3]),
                "href": "/lacunes",
            }
        )

    demandes = (
        db.scalar(
            select(func.count())
            .select_from(NotionRequest)
            .where(NotionRequest.status == "pending")
        )
        or 0
    ) + (
        db.scalar(
            select(func.count())
            .select_from(ContentRequest)
            .where(ContentRequest.status == "pending")
        )
        or 0
    )
    if demandes:
        items.append(
            {
                "kind": "demande",
                "count": demandes,
                "label": f"{demandes} demande{'s' if demandes > 1 else ''} de Massimo",
                "detail": "Notions hors programme et contenus réclamés",
                "href": "/demandes",
            }
        )

    if year_id is not None:
        with_referentiel = _referentiel_subjects(db, year_id)
        missing = [
            name
            for subject_id, name in db.execute(
                select(SchoolYearSubject.subject_id, Subject.name)
                .join(Subject, Subject.id == SchoolYearSubject.subject_id)
                .where(SchoolYearSubject.school_year_id == year_id)
            ).all()
            if subject_id not in with_referentiel
        ]
        if missing:
            items.append(
                {
                    "kind": "referentiel",
                    "count": len(missing),
                    "label": (
                        f"{len(missing)} matière{'s' if len(missing) > 1 else ''} sans programme généré"
                    ),
                    "detail": " · ".join(missing),
                    "href": "/programme",
                }
            )

    clips = (
        db.scalar(
            select(func.count())
            .select_from(RagDocument)
            .where(RagDocument.source_type == "web_clip", RagDocument.subject_id.is_(None))
        )
        or 0
    )
    if clips:
        items.append(
            {
                "kind": "source",
                "count": clips,
                "label": f"{clips} capture{'s' if clips > 1 else ''} à rattacher",
                "detail": "Captures zetis-clip sans matière",
                "href": "/sources",
            }
        )

    return items


def _gaps_without_mission(db: Session, student_id: int) -> list[str]:
    """Notions à renforcer qu'aucune mission active ne prend en charge.

    Délégué à `progress.service._skills_with_active_mission` — SOURCE UNIQUE, partagée avec la page
    Lacunes. Ce comptage regardait auparavant les seules missions de **remédiation** : une notion
    déjà couverte par une mission `manual` (Papa l'a commandée) ou `revision` était donc annoncée
    « sans mission active » sur le dashboard, alors que la page Lacunes la disait prise en charge.
    Constaté en base : deux surfaces qui se contredisaient sur la même notion.

    La question posée par le KPI est « reste-t-il un geste à faire ? » — et n'importe quelle
    mission active y répond, quel que soit son type.
    """
    rows = db.execute(
        select(Gap.skill_id, Skill.name)
        .outerjoin(Skill, Skill.id == Gap.skill_id)
        .where(Gap.student_id == student_id, Gap.status.in_(OPEN_GAP_STATUSES))
    ).all()
    covered = skills_with_active_mission(db, student_id=student_id)
    return [name or "Notion" for skill_id, name in rows if skill_id not in covered]


# ==================================================================================================
# Chaîne de contenus
# ==================================================================================================


def _content_chain(db: Session, year_id: int | None) -> list[dict]:
    """Entonnoir de production : chaque marche a pour cible la marche précédente.

    Lecture visée : la marche la plus haute est celle à produire en premier. Les quiz sont comptés
    sur `status='ready'` faute de `validation_status` (ADR-0014 §2).

    ⚠️ **Les barres et le delta ne comptent pas la même chose, et c'est voulu** (ADR-0039 §9). Les
    barres décrivent le STOCK, global et brut — c'est leur rôle depuis l'ADR-0028. Le delta décrit
    ce qui est PRODUISIBLE maintenant, par les prédicats exacts de la page qu'il ouvre
    (`actionable_gaps`). Les confondre revenait à annoncer 49 fiches à produire pour une page qui
    en ouvrait 17 : une leçon validée sans cours rédigé entrait dans la soustraction alors
    qu'aucun dérivé n'y est générable.
    """
    chapters = db.scalar(select(func.count()).select_from(Chapter)) or 0
    chapters_ok = (
        db.scalar(
            select(func.count()).select_from(Chapter).where(Chapter.validation_status == "validated")
        )
        or 0
    )
    lessons_ok = (
        db.scalar(select(func.count()).select_from(Lesson).where(Lesson.status == "validated")) or 0
    )
    fiches_ok = (
        db.scalar(
            select(func.count()).select_from(Fiche).where(Fiche.validation_status == "validated")
        )
        or 0
    )
    quizzes_ok = (
        db.scalar(
            select(func.count())
            .select_from(Quiz)
            .where(Quiz.lesson_id.is_not(None), Quiz.status == "ready")
        )
        or 0
    )
    gaps = actionable_gaps(db, year_id)
    return [
        {
            "stage": "chapitres_valides",
            "label": "Chapitres validés",
            "value": chapters_ok,
            "target": chapters,
            # `None` volontairement : un delta se lit TOUJOURS entre deux marches, et rien ne se
            # trouve au-dessus de la première. Y poser un lien ferait une donnée que rien ne rend.
            # Les chapitres en attente restent atteignables par le segment « chapitres » de la file
            # « À décider ».
            "missing_href": None,
            "missing_count": None,
        },
        {
            "stage": "cours_valides",
            "label": "Cours validés",
            "value": lessons_ok,
            "target": chapters_ok,
            # Ce qui manque ici, ce sont des leçons validées SANS cours rédigé : la Couverture est
            # l'endroit où on l'écrit, et sa pilule existe déjà.
            "missing_href": "/couverture?filter=no_course",
            "missing_count": gaps["no_course"],
        },
        {
            "stage": "fiches",
            "label": "Fiches",
            "value": fiches_ok,
            "target": lessons_ok,
            # `manque=` restreint la matrice aux leçons dont CETTE colonne est vide (ADR-0039 §9).
            # Sans lui, « 19 à produire » ouvrirait toutes les leçons incomplètes, quel que soit le
            # dérivé manquant — un nombre annoncé que la page ne sert pas.
            "missing_href": "/couverture?filter=ready&manque=fiche",
            "missing_count": gaps["fiche"],
        },
        {
            "stage": "quiz",
            "label": "Quiz de fin de cours",
            "value": quizzes_ok,
            "target": lessons_ok,
            "missing_href": "/couverture?filter=ready&manque=quiz",
            "missing_count": gaps["quiz"],
        },
    ]


# ==================================================================================================
# Lecture ZETIS
# ==================================================================================================


def _reading(
    db: Session,
    student_id: int,
    subjects: list[dict],
    events: list[LearningEvent],
    today: date,
) -> list[dict]:
    """Constats adossés à des traces comptées. **Un constat sans preuve n'est pas émis.**

    Version délibérément sobre : aucun appel LLM, aucune interprétation — on énonce ce que les
    compteurs disent déjà, avec le nombre d'éléments qui le fonde. La narration écrite reste le
    travail du Conseil de classe (ADR-0020) ; le dashboard mesure, il n'explique pas.
    """
    reading: list[dict] = []

    for subject in sorted(subjects, key=lambda s: -s["notions"]["fragile"])[:2]:
        fragile = subject["notions"]["fragile"]
        if fragile:
            plural = "s" if fragile > 1 else ""
            reading.append(
                {
                    "trend": "watch",
                    # « à renforcer », pas « en cours de construction » : ce dernier est le
                    # vocabulaire du statut `in_progress` (CLAUDE.md §pédagogie). Employer les
                    # deux pour la même chose brouillerait le seul mot que Papa doit reconnaître.
                    "text": f"{subject['name']} : {fragile} notion{plural} à renforcer",
                    "evidence": {
                        "count": fragile,
                        "kind": "notion",
                        # 🔴 Pointait vers `/lacunes`, et c'était FAUX : ce compte est celui des
                        # notions FRAGILES (`SkillMastery ∈ {weak, learning}`), tandis que
                        # `/lacunes` liste des lignes `Gap` — deux populations disjointes sous le
                        # même mot. Constaté à l'écran le 2026-08-05 : « Français : 8 notions à
                        # renforcer » menait à une page qui en montrait UNE.
                        #
                        # Le comptage reste celui des fragiles — il est juste, et c'est la mesure
                        # la plus fournie. C'est la CIBLE qui change : le panneau d'analyse est le
                        # seul endroit qui les nomme (`adr-0028-dashboard-papa-agregat-unique` (Amendement 1) §6).
                        "href": f"/?subject={subject['slug']}&panel=ou-agir",
                    },
                }
            )

    best = max(subjects, key=lambda s: s["notions"]["consolidated"], default=None)
    if best is not None and best["notions"]["consolidated"]:
        count = best["notions"]["consolidated"]
        reading.append(
            {
                "trend": "up",
                "text": (
                    f"{best['name']} : {count} notion{'s' if count > 1 else ''} "
                    f"consolidée{'s' if count > 1 else ''}"
                ),
                "evidence": {
                    "count": count,
                    "kind": "notion",
                    "href": f"/progression?subject={best['slug']}",
                },
            }
        )

    # Non-conclusion explicite : le silence laisserait croire qu'il n'y a rien à dire, alors que
    # c'est le VOLUME qui manque. Sa preuve est précisément le compte d'événements.
    # 🔴 **La fenêtre du constat est celle de sa PREUVE, pas celle du chargement** (adr-0038 §5).
    #
    # `events` porte tout l'historique chargé (`p.HISTORY_DAYS`, deux ans), mais `/cahier` est borné
    # SERVEUR à `activity_max_range_days` (366 j) — le client y choisit une fenêtre, jamais
    # l'ampleur du scan (`activity/router.py`). Compter sur deux ans ce qu'une page en sert un an
    # rendait le constat littéralement invérifiable : une trace de plus de 366 jours était
    # **comptée et invisible sur sa propre preuve**. Mesuré, pas supposé, et tenu en `xfail`
    # strict depuis l'ADR-0038 le temps que ce chantier existe.
    #
    # ⚠️ On lit `settings.activity_max_range_days` — la MÊME source que le routeur qui borne, et
    # non un 366 recopié : deux constantes finiraient par diverger, et personne ne le verrait.
    cahier_first = today - timedelta(days=settings.activity_max_range_days)
    for subject in subjects:
        traces = sum(
            1
            for e in events
            if e.subject_id == subject["id"] and local_day(e.created_at) >= cahier_first
        )
        # `notions.total > 0` et non `has_referentiel` : une matière peut avoir des chapitres sans
        # aucune notion (chapitres générés, notions pas encore rattachées). Dire d'elle « trop peu
        # d'activité pour conclure » remplirait la carte de constats sur des matières qui n'ont
        # rien à conclure — constaté sur la base de dev, invisible sur un jeu de test.
        if subject["notions"]["total"] > 0 and traces < 3:
            reading.append(
                {
                    "trend": "flat",
                    # ⚠️ PAS « sur la période » : le compte n'est PAS celui de la fenêtre que Papa
                    # a sélectionnée (7 / 30 / 90 / 365 j), mais celui que sa preuve sait servir
                    # (366 j). Nommer une fenêtre ici obligerait à en nommer deux — celle du
                    # sélecteur et celle du Cahier — pour un constat dont l'intérêt est justement
                    # de dire qu'il n'y a pas de quoi conclure. Le constat ne promet donc AUCUNE
                    # fenêtre, et son nombre est exactement ce que le clic ouvre.
                    "text": f"{subject['name']} : trop peu d'activité mesurée pour conclure",
                    "evidence": {
                        "count": traces,
                        "kind": "trace",
                        "href": f"/cahier?subject={subject['slug']}",
                    },
                }
            )

    return [r for r in reading if r.get("evidence")]


# ==================================================================================================
# Assemblage
# ==================================================================================================


def build_dashboard(db: Session, *, student_id: int) -> dict:
    """Agrégat complet, non filtré, pour les quatre fenêtres."""
    today = today_local()
    year = _active_year(db, student_id)

    calendar_first = week_start(today) - timedelta(weeks=CALENDAR_WEEKS - 1)
    # La profondeur du chargement est celle de la PLUS LONGUE fenêtre et de sa précédente
    # (`p.HISTORY_DAYS`), et non celle du calendrier. Les deux ont longtemps coïncidé — 26 semaines
    # couvraient tout juste 90 jours + 90 — et le calendrier bornait le chargement sans le dire.
    # Depuis la fenêtre 365, il faut charger deux ans : `calendar_first` ne borne plus que la
    # grille, explicitement, plus bas.
    history_first = today - timedelta(days=p.HISTORY_DAYS - 1)
    events = _events(db, student_id=student_id, first_day=history_first, last_day=today)
    # SOURCE UNIQUE des minutes de tout l'agrégat : totaux, créneaux, sparklines et calendrier en
    # dérivent tous. Une seconde façon de compter le temps actif ferait diverger deux chiffres de
    # la même page.
    pairs = p.minutes_per_event(events)
    ordered = [event for event, _minutes in pairs]

    subject_rows = list(db.scalars(select(Subject).order_by(Subject.sort_order, Subject.name)))
    skills_by_subject = _skills_by_subject(db)
    mastery_rows = _mastery_rows(db, student_id)
    review_load = _review_load(db, student_id, today)
    referentiel = _referentiel_subjects(db, year.id if year else None)
    covered_ids = _covered_skill_ids(db)
    covered_at = _covered_at(db)
    mastered_at = _mastered_at(db, student_id)
    fragile_at = _entered_fragile_at(db, student_id)
    in_progress_at = _entered_in_progress_at(db, student_id)
    history_since = _history_since(db, student_id)
    # Bornés à la même profondeur que le reste de l'agrégat : la fenêtre la plus longue et sa
    # précédente. Charger tout l'historique de révision rendrait des lignes qu'aucune fenêtre ne
    # dessine.
    attempts_by_subject = _review_attempts(db, student_id, history_first)
    transitions_by_subject = _mastery_transitions(db, student_id)

    gaps_by_subject: dict[int, int] = {}
    for (subject_id,) in db.execute(
        select(Gap.subject_id).where(
            Gap.student_id == student_id, Gap.status.in_(OPEN_GAP_STATUSES)
        )
    ).all():
        gaps_by_subject[subject_id] = gaps_by_subject.get(subject_id, 0) + 1

    subjects: list[dict] = []
    for subject in subject_rows:
        skill_ids = set(skills_by_subject.get(subject.id, []))
        statuses = [status for sid, _skill, status in mastery_rows if sid == subject.id]
        # Minutes appariées à leur événement : `event_minutes` a été calculé sur la suite
        # COMPLÈTE, ce qui est voulu — l'écart jusqu'à l'événement suivant ne dépend pas de la
        # matière. Refaire le calcul par matière inventerait du temps sur chaque bascule.
        subject_pairs = [(e, m) for e, m in pairs if e.subject_id == subject.id]

        # Calendrier dérivé des MÊMES minutes que les totaux (et non d'un `active_minutes`
        # recalculé) : la somme d'une colonne de la grille égale exactement le KPI.
        by_day: dict[date, int] = {}
        for event, gained in subject_pairs:
            day = local_day(event.created_at)
            # Borne explicite : la grille porte 26 semaines quelle que soit la période (adr-0028
            # §6). Sans ce filtre elle hériterait de la profondeur du chargement, désormais de deux
            # ans, et rendrait quatre fois plus de jours que la carte n'en dessine.
            if day < calendar_first:
                continue
            by_day[day] = by_day.get(day, 0) + gained
        calendar = [
            {"date": day.isoformat(), "active_minutes": total}
            for day, total in sorted(by_day.items())
            if total > 0  # jours vides omis, reconstruits côté client
        ]

        subject_covered = skill_ids & covered_ids
        consolidated_now = sum(1 for s in statuses if s in p.CONSOLIDATED_STATUSES)
        fragile_now = sum(1 for s in statuses if s in p.FRAGILE_STATUSES)
        in_progress_now = sum(1 for s in statuses if s in p.IN_PROGRESS_STATUSES)
        subject_attempts = attempts_by_subject.get(subject.id, [])
        subject_transitions = transitions_by_subject.get(subject.id, [])

        minutes: dict[str, int] = {}
        slots: dict[str, list[list[int]]] = {}
        outside: dict[str, int] = {}
        series: dict[str, dict] = {}
        for period in p.PERIODS:
            first, last = p.period_window(period, today)
            in_window = [
                (e, m) for e, m in subject_pairs if first <= local_day(e.created_at) <= last
            ]
            minutes[str(period)] = sum(m for _e, m in in_window)
            matrix, out = p.bucket_slots(in_window, first_day=first, last_day=last)
            slots[str(period)] = matrix
            outside[str(period)] = out

            marks = p.series_marks(period, today)
            gained, lost = p.consolidation_flux(subject_transitions, marks)
            series[str(period)] = {
                "covered": p.reconstruct_series(
                    len(subject_covered),
                    [covered_at[s] for s in subject_covered if s in covered_at],
                    marks,
                ),
                "consolidated": p.reconstruct_series(
                    consolidated_now,
                    [mastered_at[s] for s in skill_ids if s in mastered_at],
                    marks,
                ),
                "fragile": p.reconstruct_series(
                    fragile_now,
                    [fragile_at[s] for s in skill_ids if s in fragile_at],
                    marks,
                ),
                # Quatrième STOCK, même règle que les trois autres — dénominateur du taux de
                # rétention et quatrième bande de l'aire empilée.
                "in_progress": p.reconstruct_series(
                    in_progress_now,
                    [in_progress_at[s] for s in skill_ids if s in in_progress_at],
                    marks,
                ),
                # Deux FLUX, qui ne se réconcilient avec aucun des stocks ci-dessus (cf. l'entête
                # de `consolidation_flux`). Ils peuvent redescendre — c'est ce qu'on leur demande.
                "gained": gained,
                "lost": lost,
                # Passages SRS notés par intervalle. `window_days` d'abord : sans lui, un passage
                # antérieur à la fenêtre atterrirait dans le premier point.
                "reviews": {
                    rating: p.bucket_counts(
                        p.window_days(
                            [day for note, day in subject_attempts if note == rating], marks
                        ),
                        marks,
                    )
                    for rating in REVIEW_RATINGS
                },
            }

        subjects.append(
            {
                "id": subject.id,
                "slug": subject.slug,
                "name": subject.name,
                "color": subject.color,
                "minutes": minutes,
                "calendar": calendar,
                "slots": slots,
                "slots_outside_minutes": outside,
                "notions": p.notions_breakdown(statuses, len(skill_ids)),
                "series": series,
                "review_load": review_load.get(subject.id, [0] * REVIEW_LOAD_DAYS),
                "gaps_open": gaps_by_subject.get(subject.id, 0),
                "has_referentiel": subject.id in referentiel,
            }
        )

    periods = _periods(
        db,
        student_id=student_id,
        today=today,
        pairs=pairs,
        mastered_at=mastered_at,
        fragile_at=fragile_at,
        subjects=subjects,
    )

    # Temps actif SANS matière : connexion, navigation, chat, étapes de mission non imputées.
    # Sans ce champ, le donut « Répartition du temps » totalisait 42 min à côté d'un KPI affichant
    # 7 h 05 — deux chiffres du même écran qui se contredisent (constaté au premier rendu réel).
    # On le nomme plutôt que de le taire : c'est du temps de présence mesuré, il n'appartient
    # simplement à aucune matière.
    unattributed = {
        str(period): sum(
            minutes
            for event, minutes in pairs
            if event.subject_id is None
            and p.period_window(period, today)[0] <= local_day(event.created_at) <= today
        )
        for period in p.PERIODS
    }

    last_event = ordered[-1] if ordered else None
    return {
        "unattributed_minutes": unattributed,
        "school_year": (
            {"level": year.level, "label": year.label, "program_version": None} if year else None
        ),
        "generated_at": _now_iso(),
        "last_activity_at": to_utc(last_event.created_at).isoformat() if last_event else None,
        # Délégué à `activity`, et NON déduit de `ordered` : celui-ci reste borné, désormais à
        # `p.HISTORY_DAYS`. Un dernier événement plus ancien rendrait la liste vide et le
        # décrochage vaudrait 0 — soit « tout va bien » au moment précis où il faut alerter.
        "days_inactive": activity_service.trailing_inactive_days(
            db, student_id=student_id, last_day=today
        ),
        "inbox": _inbox(db, student_id, year.id if year else None),
        "periods": periods,
        "history_since": history_since.isoformat() if history_since else None,
        "subjects": subjects,
        "content_chain": _content_chain(db, year.id if year else None),
        "reading": _reading(db, student_id, subjects, ordered, today),
        # Proposition composée EN LECTURE par le moteur de missions (`preview_remediation`,
        # patron preview/confirm ADR-0010). Le GET n'écrit rien : la mission n'existe qu'après
        # confirmation explicite de Papa, sur la route de création déjà en place. `None` quand
        # aucune lacune n'est découverte — la carte ne propose alors rien plutôt que d'inventer
        # un travail à faire.
        "proposed_mission": _proposed_mission(db, student_id),
    }


def _proposed_mission(db: Session, student_id: int) -> dict | None:
    """Passe-plat vers le moteur de missions, enrichi du lien de confirmation.

    Le dashboard ne compose PAS lui-même : il demande au module qui détient la doctrine des
    parcours (ADR-0017 §5). Recomposer ici un « eli5 → quiz » à la main aurait produit une
    proposition qui diverge du jour où l'ordre des étapes change.
    """
    student = db.get(StudentProfile, student_id)
    if student is None:
        return None
    proposal = missions_service.preview_remediation(db, student)
    if proposal is None:
        return None
    return {
        **proposal,
        # Où va Papa pour confirmer. La création reste un POST explicite sur la surface Missions,
        # jamais un effet de bord de l'affichage.
        "confirm_href": "/missions",
    }


def _periods(
    db: Session,
    *,
    student_id: int,
    today: date,
    pairs: list[tuple[LearningEvent, int]],
    mastered_at: dict[int, date],
    fragile_at: dict[int, date],
    subjects: list[dict],
) -> dict[str, dict]:
    """KPI `{value, delta}` + sparklines de 12 points, par fenêtre.

    Les deltas sont calculés SERVEUR contre la fenêtre précédente de même longueur — le client
    n'invente aucun chiffre (adr-0028 §3).
    """
    day_minutes: dict[date, int] = {}
    for event, gained in pairs:
        day = local_day(event.created_at)
        day_minutes[day] = day_minutes.get(day, 0) + gained
    # Un jour « actif » est un jour où quelque chose a eu lieu, même si le temps actif y vaut 0
    # (une seule action isolée ne produit aucun écart mesurable). Compter les jours à minutes > 0
    # rendrait la régularité muette sur les journées courtes, qui sont justement le régime visé.
    active_days_set = {local_day(event.created_at) for event, _m in pairs}

    total_notions = sum(s["notions"]["total"] for s in subjects)
    consolidated_now = sum(s["notions"]["consolidated"] for s in subjects)
    fragile_now = sum(s["notions"]["fragile"] for s in subjects)
    open_gaps_now = sum(s["gaps_open"] for s in subjects)
    without_mission = len(_gaps_without_mission(db, student_id))
    gap_opened = _gap_open_dates(db, student_id)

    out: dict[str, dict] = {}
    for period in p.PERIODS:
        first, last = p.period_window(period, today)
        prev_first, prev_last = p.previous_window(period, today)
        marks = p.series_marks(period, today)

        minutes = sum(v for d, v in day_minutes.items() if first <= d <= last)
        prev_minutes = sum(v for d, v in day_minutes.items() if prev_first <= d <= prev_last)
        days = sum(1 for d in active_days_set if first <= d <= last)
        prev_days = sum(1 for d in active_days_set if prev_first <= d <= prev_last)
        consolidated_delta = sum(1 for d in mastered_at.values() if first <= d <= last)

        # La courbe ambre est calculée AVANT le KPI qu'elle accompagne, et le delta en est DÉRIVÉ
        # (`value - series[0]`) plutôt que recompté (addendum ADR-0028 §5 ter). C'est une garantie
        # de non-contradiction, pas une commodité : le chiffre et la sparkline dessinée trois
        # millimètres plus bas ne peuvent pas raconter deux histoires différentes.
        #
        # ⚠️ Ce delta n'est donc PAS un solde et ne peut jamais être négatif : `reconstruct_series`
        # projette l'ensemble d'AUJOURD'HUI à rebours, donc une notion réparée pendant la fenêtre
        # disparaît des deux nombres au lieu d'être soustraite. « +4 » se lit « parmi les 13
        # fragiles d'aujourd'hui, 4 le sont devenues sur la fenêtre ».
        fragile_series = p.reconstruct_series(fragile_now, list(fragile_at.values()), marks)

        out[str(period)] = {
            "kpis": {
                "active_minutes": {"value": minutes, "delta": minutes - prev_minutes},
                "active_days": {"value": days, "of": period, "delta": days - prev_days},
                "consolidated": {
                    "value": consolidated_now,
                    "of": total_notions,
                    "delta": consolidated_delta,
                },
                "fragile": {
                    "value": fragile_now,
                    "delta": fragile_now - fragile_series[0],
                },
                "open_gaps": {
                    "value": open_gaps_now,
                    "delta": 0,
                    "without_mission": without_mission,
                },
            },
            "sparks": {
                "active_minutes": p.bucket_sums(
                    [(d, v) for d, v in day_minutes.items() if first <= d <= last], marks
                ),
                "active_days": p.bucket_counts(
                    [d for d in active_days_set if first <= d <= last], marks
                ),
                "consolidated": p.reconstruct_series(
                    consolidated_now, list(mastered_at.values()), marks
                ),
                "fragile": fragile_series,
                "open_gaps": p.reconstruct_series(open_gaps_now, gap_opened, marks),
            },
        }
    return out


def _gap_open_dates(db: Session, student_id: int) -> list[date]:
    rows = db.execute(
        select(Gap.first_detected_at).where(
            Gap.student_id == student_id, Gap.status.in_(OPEN_GAP_STATUSES)
        )
    ).all()
    return [local_day(when) for (when,) in rows if when]


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()
