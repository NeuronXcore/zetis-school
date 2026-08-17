"""Service agenda — co-édition, bande glissante, « ce qui arrive » (ADR-0025, Lot 1).

Toutes les règles de visibilité et d'autorité sont tenues ICI, côté serveur : le client ne
filtre rien, ne calcule aucune asymétrie, ne décide d'aucun droit. Une UI cachée n'est pas une
règle.

Ce module ne lit **ni** `missions`, **ni** les cartes SRS (règle de datation §4 : le calendrier
n'accueille que ce qui a une date dans le monde réel — ZETIS ne se donne jamais rendez-vous à
lui-même). Il ne crédite aucun XP et ne touche aucune table de progression.
"""

from collections.abc import Sequence
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import (
    AgendaItem,
    AppSetting,
    LearningEvent,
    Lesson,
    SchoolYear,
    Skill,
    StudentProfile,
    Subject,
)
from app.modules.agenda import plan as plan_mod
from app.modules.memory.service import chapter_servable_counts
from app.modules.activity.events import (
    EVENT_AGENDA_ITEM_CREATED,
    EVENT_AGENDA_ITEM_DONE,
    EVENT_CHAT_DIFFICULTY_DECLARED,
    EVENT_CHAT_TOOL_RESPONSE,
    EVENT_CHAT_TOPIC,
    EVENT_ELI5_REQUESTED,
    EVENT_ELI5_REVERSE,
    EVENT_FICHE_VIEWED,
    EVENT_LESSON_VIEWED,
    EVENT_LOGIN,
    EVENT_MISSION_COMPLETED,
    EVENT_MISSION_STEP_VIEW,
    EVENT_PAGE_VIEWED,
    EVENT_QUIZ_ATTEMPTED,
    EVENT_REVIEW_ATTEMPTED,
    NON_WORK_EVENTS,
    log_learning_event,
)

# `label_for` vit dans `activity.service`, pas dans `activity.events` — et c'est une fonction
# pure, sans accès DB. Aucun cycle : `activity.service` n'importe rien de `agenda`.
# On la RÉUTILISE plutôt que de recopier la table des libellés : deux copies du même vocabulaire
# divergeraient, exactement comme les deux copies de `NON_WORK_EVENTS` avaient divergé.
from app.modules.activity.service import label_for
from app.modules.activity.timeutils import local_day, range_bounds_utc, today_local

# Événements qui ne comptent pas comme une « activité » d'un jour passé : la navigation n'est pas
# du travail (sans quoi ouvrir la page allumerait une trace), et l'agenda lui-même est non
# probant. Le reste compte — le comptage est volontairement grossier et généreux.
# Promu dans `activity/events.py` sous le nom `NON_WORK_EVENTS` (2026-08-03) : la production en
# avait besoin de la MÊME liste, et deux copies avaient déjà divergé. Alias conservé pour ne pas
# toucher les lecteurs de ce module.
_NON_TRACE_EVENTS = NON_WORK_EVENTS

# « Ce qui arrive » ne montre QUE ce qui a une échéance qu'on prépare (§6). Un devoir du
# lendemain n'y a pas sa place : il est déjà dans la bande.
#
# ⚠️ **`lecon` en est VOLONTAIREMENT absent** (addendum §14.3), alors qu'il DÉCLENCHE la production
# — c'est le premier `kind` dans ce cas, et la dissymétrie est voulue. Trois raisons, par ordre de
# force : (1) `UpcomingItemOut` ne porte **aucun champ `kind`**, donc « contrôle jeudi » et « leçon
# pour demain » s'afficheraient sous une forme identique pour deux gravités différentes ; (2) la
# section est plafonnée à 4 et les leçons, fréquentes, chasseraient les contrôles de la seule
# surface qui sert à les anticiper ; (3) c'est le motif ci-dessus, mot pour mot.
# Réversible — mais en donnant d'abord un `kind` à `UpcomingItemOut`, pas avant.
UPCOMING_KINDS = ("controle", "rendu")

# Combien de mois la grille peut avancer au-delà du mois courant (Amdt 8 §D1). Deux, et pas plus :
# « ce qui arrive » a un horizon serveur de 21 jours et une étape de plan ne remonte que de
# quelques jours avant son échéance. Plus loin, la grille serait vide par construction.
MONTH_NAV_AHEAD = 2

# L'ordre d'affichage des FORMES de travail (Amdt 8 §D2, règle 3). Doctrinal et FIXE : trier par
# fréquence reviendrait à mesurer, ce que tout cet amendement existe pour éviter. L'ordre suit le
# geste pédagogique — on lit, puis on fiche, puis on s'exerce, puis on consolide, puis on demande.
# Un type absent de cette liste passe en fin, dans l'ordre du vocabulaire.
FORM_ORDER = (
    EVENT_LESSON_VIEWED,
    EVENT_FICHE_VIEWED,
    EVENT_QUIZ_ATTEMPTED,
    EVENT_REVIEW_ATTEMPTED,
    EVENT_ELI5_REQUESTED,
    EVENT_ELI5_REVERSE,
    EVENT_MISSION_STEP_VIEW,
    EVENT_MISSION_COMPLETED,
    # La conversation en dernier : c'est ce qu'on fait AUTOUR du travail. Les deux types de chat
    # rendent le même libellé — le dédoublonnage se fait donc sur le libellé, pas sur le type.
    EVENT_CHAT_TOPIC,
    EVENT_CHAT_TOOL_RESPONSE,
    EVENT_CHAT_DIFFICULTY_DECLARED,
)


def _add_months(day: date, delta: int) -> date:
    """Le 1er du mois décalé de `delta`. Jamais `timedelta(days=30)` — un mois n'est pas 30 jours."""
    total = (day.year * 12 + day.month - 1) + delta
    return date(total // 12, total % 12 + 1, 1)


def _end_of_month(first_of_month: date) -> date:
    return _add_months(first_of_month, 1) - timedelta(days=1)


def _school_year_floor(db: Session, *, today: date) -> date:
    """Le premier mois navigable en arrière : le mois de début de l'année scolaire active.

    L'année scolaire est l'unité naturelle du souvenir ; avant elle il n'y a rien à se rappeler,
    et un mois vide qu'on peut atteindre est un cul-de-sac.

    Repli sans année scolaire ou sans `starts_on` : le 1er septembre encadrant la date du jour.
    ⚠️ Ce repli ne doit jamais rendre un mois POSTÉRIEUR au mois courant, sinon le chevron
    arrière disparaîtrait alors qu'on est en septembre ou en octobre.
    """
    year = db.scalars(
        select(SchoolYear)
        .where(SchoolYear.status == "active", SchoolYear.starts_on.is_not(None))
        .order_by(SchoolYear.starts_on.desc())
        .limit(1)
    ).first()
    if year is not None and year.starts_on is not None:
        return year.starts_on.replace(day=1)
    rentree = date(today.year if today.month >= 9 else today.year - 1, 9, 1)
    return min(rentree, today.replace(day=1))


# --- Verrou de phase, réglable par Papa (ADR-0025 §10) ----------------------------------------
# La bascule est un GESTE de Papa, sur sa page. La variable d'environnement reste la valeur par
# défaut ; la première bascule depuis l'UI crée la ligne, qui prime ensuite.
STUDENT_ENTRY_KEY = "agenda_student_entry_enabled"


def student_entry_enabled(db: Session) -> bool:
    """Massimo peut-il saisir ? Ligne de réglage si elle existe, sinon la valeur d'env."""
    row = db.get(AppSetting, STUDENT_ENTRY_KEY)
    if row is None:
        return settings.agenda_student_entry_enabled
    return row.value == "true"


def set_student_entry_enabled(db: Session, *, enabled: bool) -> bool:
    """Bascule explicite par Papa. **Jamais appelée automatiquement** : la déclencher sur un
    seuil de coches observé ferait dépendre un droit d'une surveillance (§10, règle 2)."""
    row = db.get(AppSetting, STUDENT_ENTRY_KEY)
    if row is None:
        row = AppSetting(key=STUDENT_ENTRY_KEY, value="true" if enabled else "false")
        db.add(row)
    else:
        row.value = "true" if enabled else "false"
    db.commit()
    return enabled


class AgendaForbidden(HTTPException):
    """403 — refus d'AUTORITÉ, jamais de validation (§2b).

    Distinction volontaire avec un 422 : Papa qui tente de cocher n'a pas envoyé une donnée
    malformée, il a demandé quelque chose qui ne lui appartient pas."""

    def __init__(self, detail: str) -> None:
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


# --- Sérialisation ----------------------------------------------------------------------------


def subjects_index(db: Session) -> dict[int, Subject]:
    return {row.id: row for row in db.scalars(select(Subject))}


def _subject_ref(subjects: dict[int, Subject], subject_id: int | None) -> dict | None:
    subject = subjects.get(subject_id) if subject_id is not None else None
    if subject is None:
        return None
    return {
        "id": subject.id,
        "slug": subject.slug,
        "name": subject.name,
        "color": subject.color,
    }


def revisable_counts(
    db: Session, *, student_id: int, items: Sequence[AgendaItem]
) -> dict[int, int]:
    """Cartes que le deck de révision servirait, par chapitre — **EN LOT** (ADR-0049 §2).

    L'agenda rend sept jours d'items d'un coup : interroger chapitre par chapitre dans la boucle
    de rendu ferait N×2 requêtes par page. La déduplication est faite plus bas (deux échéances
    peuvent viser le même chapitre).
    """
    chapter_ids = [item.chapter_id for item in items if item.chapter_id is not None]
    if not chapter_ids:
        return {}
    return chapter_servable_counts(db, student_id, chapter_ids)


def student_out(
    item: AgendaItem, subjects: dict[int, Subject], *, revisable: dict[int, int]
) -> dict:
    """Vue Massimo. `parent_note` n'est pas filtrée : elle n'est jamais construite.

    ⚠️ `revisable` est un paramètre **obligatoire**, sans valeur par défaut, et c'est délibéré :
    un défaut à `{}` ferait qu'un appelant distrait rendrait `revisable_cards = 0` — donc
    **ferait disparaître la porte de révision sans qu'aucun test ne rougisse**. Mieux vaut un
    `TypeError` bruyant qu'une capacité qui s'éteint en silence.
    """
    return {
        "id": item.id,
        "label": item.label,
        "subject": _subject_ref(subjects, item.subject_id),
        "due_on": item.due_on,
        "kind": item.kind,
        "done": item.done_at is not None,
        "created_by": item.created_by,
        "edited_by_parent": item.edited_by_parent_at is not None,
        # Adresses de contenu, pas données sur lui (addendum §15) : elles servent le lien
        # « lire le cours ». Le contenu pointé est de toute façon déjà atteignable à la main, et
        # la route de lecture refuse tout ce qui n'est pas validé (ADR-0009 §9).
        "lesson_id": item.lesson_id,
        "chapter_id": item.chapter_id,
        # Combien de cartes le deck de ce chapitre servirait, PLAFOND COMPRIS (ADR-0049 §2/§3).
        # `0` ⇒ la surface ne rend AUCUNE porte : ni bouton grisé, ni bouton qui explique, rien.
        # Le calcul est serveur ; une surface qui recompterait serait la seconde source de vérité
        # qui a divergé le jour même au §14.5.
        "revisable_cards": revisable.get(item.chapter_id, 0) if item.chapter_id else 0,
    }


def student_out_one(db: Session, item: AgendaItem, *, student_id: int) -> dict:
    """`student_out` pour un item seul — les routes unitaires (créer, cocher, masquer…).

    Elles renvoient l'item mis à jour, et la porte de révision doit y être **aussi** juste que
    dans la bande : un item recoché qui perdrait sa porte serait un bug invisible aux tests de
    liste.
    """
    return student_out(
        item,
        subjects_index(db),
        revisable=revisable_counts(db, student_id=student_id, items=[item]),
    )


def pilot_out(
    item: AgendaItem, subjects: dict[int, Subject], *, plan: dict[int, tuple[int, int]]
) -> dict:
    """Vue Papa. Sur-ensemble de la vue élève : `parent_note` et les horodatages y vivent.

    ⚠️ `plan` est un paramètre **obligatoire**, sans valeur par défaut, pour la même raison que
    `revisable` sur `student_out` : un défaut à `{}` ferait qu'un appelant distrait rendrait
    `0/0` — donc **ferait disparaître le plan de l'écran de Papa sans qu'aucun test ne rougisse**.
    Mieux vaut un `TypeError` bruyant qu'une information qui s'éteint en silence.

    🔴 Et il vient de `plan_counts`, jamais de `get_or_create_plan` : lire la grille de Papa ne
    doit **rien composer** (cf. la docstring de `plan_counts`).
    """
    total, coches = plan.get(item.id, (0, 0))
    return {
        "id": item.id,
        "label": item.label,
        "subject": _subject_ref(subjects, item.subject_id),
        "subject_id": item.subject_id,
        "chapter_id": item.chapter_id,
        "lesson_id": item.lesson_id,
        "due_on": item.due_on,
        "kind": item.kind,
        "created_by": item.created_by,
        "parent_note": item.parent_note,
        "done_at": item.done_at,
        "dismissed_at": item.dismissed_at,
        "edited_by_parent_at": item.edited_by_parent_at,
        "created_at": getattr(item, "created_at", None),
        "updated_at": getattr(item, "updated_at", None),
        "plan_steps_total": total,
        "plan_steps_done": coches,
    }


def pilot_out_many(db: Session, items: Sequence[AgendaItem]) -> list[dict]:
    """`pilot_out` pour une liste — **un** appel à `plan_counts`, pas un par ligne."""
    subjects = subjects_index(db)
    plan = plan_mod.plan_counts(db, [item.id for item in items])
    return [pilot_out(item, subjects, plan=plan) for item in items]


def pilot_out_one(db: Session, item: AgendaItem) -> dict:
    """`pilot_out` pour un item seul — les routes unitaires (créer, corriger, noter, archiver).

    Miroir de `student_out_one`, et pour la même raison : une route unitaire qui rendrait un
    compte périmé mentirait juste après le geste qui l'a changé. Le cas concret est la
    **Décision 4** — corriger la date SUPPRIME le plan, et la réponse du PATCH doit dire `0/0`.
    """
    return pilot_out(item, subjects_index(db), plan=plan_mod.plan_counts(db, [item.id]))


# --- Lectures ---------------------------------------------------------------------------------


def _items_between(
    db: Session,
    *,
    student_id: int,
    first: date,
    last: date,
    include_archived: bool = False,
) -> list[AgendaItem]:
    query = select(AgendaItem).where(
        AgendaItem.student_id == student_id,
        AgendaItem.due_on >= first,
        AgendaItem.due_on <= last,
    )
    if not include_archived:
        query = query.where(AgendaItem.dismissed_at.is_(None))
    return list(db.scalars(query.order_by(AgendaItem.due_on, AgendaItem.id)).all())


def trace_subjects_by_day(
    db: Session, *, student_id: int, first: date, last: date
) -> dict[date, list[dict]]:
    """Les MATIÈRES travaillées chaque jour Europe/Paris, plafonnées (Amdt 8 §D2).

    🔴 **Remplace `traces_by_day`, qui rendait un COMPTE.** Le compte produisait « tu as travaillé
    3 fois » — une phrase qui ne dit rien de ce qui a été fait, et c'est le défaut qui a déclenché
    l'Amendement 8. On garde exactement la même mesure (des natures distinctes, plafonnées, jamais
    un volume ni un temps) mais on la rend **nommée** : une rafale de douze cartes de maths reste
    une seule matière, pas douze traces.

    Le plafond `agenda_traces_cap` survit et garde son rôle : borner la hauteur de la cellule.
    Il ne borne plus un « effort » — il borne un affichage.

    ⚠️ **`_NON_TRACE_EVENTS` (= `NON_WORK_EVENTS`) et jamais `NON_ACTIVITY_EVENTS`** : avec la
    seconde, `login` et `page_viewed` compteraient, et **ouvrir la page allumerait une trace**.
    Trois tests de non-régression gardent cette distinction ailleurs dans le dépôt.

    Rien n'est renvoyé pour un jour sans trace : `[]` et « pas de donnée » restent le même état
    (§7), et le contrat ne doit pas laisser croire qu'il existe des cases à remplir.
    """
    start, end = range_bounds_utc(first, last)
    rows = db.execute(
        select(
            # 🔴 **La matière se retrouve par la NOTION quand l'événement n'en porte pas.**
            # Vu à l'écran le 2026-08-17 : le samedi 15 août rendait une ligne SANS nom de
            # matière qui portait « Comparaison de fractions » et « Angles alternes-internes » —
            # deux notions de maths. Certains émetteurs (le chat) posent `skill_id` sans
            # `subject_id`, alors que `Skill.subject_id` existe et n'est pas nullable.
            # Déclarer « sans matière » ce que la base sait rattacher était une perte gratuite.
            func.coalesce(LearningEvent.subject_id, Skill.subject_id).label("subject_id"),
            LearningEvent.created_at,
        )
        .outerjoin(Skill, Skill.id == LearningEvent.skill_id)
        .where(
            LearningEvent.student_id == student_id,
            LearningEvent.created_at >= start,
            LearningEvent.created_at < end,
            LearningEvent.event_type.not_in(_NON_TRACE_EVENTS),
        )
    ).all()

    subjects = subjects_index(db)
    # `dict` et non `set` : l'ordre d'insertion EST l'ordre chronologique de première touche —
    # le récit de la journée. Un `set` le perdrait et forcerait un tri, donc un classement.
    seen: dict[date, dict[int | None, None]] = {}
    for subject_id, created_at in sorted(rows, key=lambda r: r[1]):
        seen.setdefault(local_day(created_at), {}).setdefault(subject_id, None)

    cap = settings.agenda_traces_cap
    out: dict[date, list[dict]] = {}
    for day, ids in seen.items():
        kept = [_trace_ref(subjects.get(sid) if sid is not None else None)
                for sid in list(ids)[:cap]]
        if kept:
            out[day] = kept
    return out


def _trace_ref(subject: Subject | None) -> dict:
    """La matière d'une trace — **trois champs, et pas l'`id`**.

    `_subject_ref` en rend quatre parce qu'une échéance a besoin de l'`id` (filtres, saisie). Une
    trace n'ouvre rien et ne se filtre pas : elle n'a aucun usage de l'identifiant. Le servir
    quand même serait un champ exposé de plus, pour rien.

    🔴 **Une activité SANS matière reste une trace, sous une identité neutre** (`slug = None`).
    La première écriture de cette fonction la jetait, au motif qu'une trace anonyme serait « un
    réceptacle déguisé ». **La mesure a démenti ce motif** : sur la base de dev, 44 des 48
    `chat_tool_response` n'ont pas de matière, et **1 jour travaillé sur 20 disparaissait
    entièrement** de l'agenda. C'est exactement le défaut qui a déclenché l'Amendement 8 — la
    page qui sous-déclare ce que Massimo a fait — réintroduit par la porte de derrière.

    ⚠️ Un réceptacle est une case **éteinte** qui attend d'être remplie ; un segment neutre est
    une marque **allumée** qui dit « tu as travaillé, sur rien de classé ». Les deux ne se
    ressemblent que sur le papier : l'un compte une absence, l'autre constate une présence.
    """
    if subject is None:
        return {"slug": None, "name": None, "color": None}
    return {"slug": subject.slug, "name": subject.name, "color": subject.color}


def day_traces(db: Session, *, student_id: int, day: date) -> dict:
    """Ce que Massimo a travaillé un jour donné : matières, notions, formes (Amdt 8 §D2).

    🔴 **Ce qui remplace « tu as travaillé 3 fois ».** Trois points verts ne disaient rien de ce
    qui avait été fait ; sur le samedi 15 août du commanditaire, l'écran affirmait « Rien à rendre
    ce jour-là » puis se dédisait en note de bas de page, avec un nombre.

    🔴 **Ne JAMAIS réutiliser `activity.service.day_detail` à la place.** Il est sous
    `require_parent` et son `DayDetailOut` transporte `time`, `minutes`, `xp` et `score_percent` —
    quatre interdits d'un coup. Le filtrer côté client est la faute que l'en-tête de
    `schemas.py` interdit en toutes lettres.

    ⚠️ **Aucune quantité ne doit jamais entrer dans ce retour.** Ni compte de cartes, ni durée, ni
    score, ni total. Un test-verrou l'assert sur le JSON sérialisé — pas sur la définition du
    schéma, parce que c'est la réponse réseau qui expose, pas la classe.

    ⚠️ **« Notion » et non « chapitre », et c'est un constat** : `LearningEvent` porte `skill_id`,
    et `Skill` n'a aucun `chapter_id`. Aucun chemin ne mène de l'événement au chapitre.
    """
    start, end = range_bounds_utc(day, day)
    rows = db.execute(
        select(
            # Même repli que `trace_subjects_by_day` : la matière se retrouve par la notion.
            # Les deux lectures DOIVENT s'accorder — la bande et le panneau racontent le même
            # jour, et une divergence se lirait comme une panne.
            func.coalesce(LearningEvent.subject_id, Skill.subject_id).label("subject_id"),
            LearningEvent.skill_id,
            LearningEvent.event_type,
            LearningEvent.created_at,
        )
        .outerjoin(Skill, Skill.id == LearningEvent.skill_id)
        .where(
            LearningEvent.student_id == student_id,
            LearningEvent.created_at >= start,
            LearningEvent.created_at < end,
            # La MÊME exclusion que `trace_subjects_by_day` — sans quoi le panneau raconterait
            # une journée que la bande n'a pas comptée, et « tu t'es connecté » deviendrait un
            # travail.
            LearningEvent.event_type.not_in(_NON_TRACE_EVENTS),
        )
    ).all()
    if not rows:
        return {"date": day, "subjects": []}

    subjects = subjects_index(db)
    skills = {
        row.id: row.name
        for row in db.scalars(
            select(Skill).where(
                Skill.id.in_({r[1] for r in rows if r[1] is not None} or {0})
            )
        )
    }

    # Ordre chronologique de PREMIÈRE TOUCHE — le récit de sa journée, jamais un classement.
    # Trier par nombre d'événements serait mesurer par la porte de derrière.
    grouped: dict[int | None, dict] = {}
    for subject_id, skill_id, event_type, _created in sorted(rows, key=lambda r: r[3]):
        bucket = grouped.setdefault(
            subject_id, {"notions": {}, "forms": {}}
        )
        if skill_id is not None and skill_id in skills:
            # Indexé par `skill_id` et non par le NOM : c'est l'identifiant qui rend la notion
            # cliquable (Amdt 8 §D10), et deux notions homonymes de matières différentes ne
            # doivent pas fusionner. Le `dict` garde l'ordre de première touche.
            bucket["notions"].setdefault(skill_id, skills[skill_id])
        bucket["forms"].setdefault(event_type, None)

    out = []
    for subject_id, bucket in grouped.items():
        # `None` ⇒ groupe neutre (`slug = None`) : une activité sans matière reste racontée.
        # Cf. `_trace_ref` — la jeter faisait disparaître 1 jour travaillé sur 20.
        subject = subjects.get(subject_id) if subject_id is not None else None
        ordered = sorted(
            bucket["forms"],
            key=lambda t: FORM_ORDER.index(t) if t in FORM_ORDER else len(FORM_ORDER),
        )
        # ⚠️ **Dédoublonnage sur le LIBELLÉ, pas sur le type d'événement.** `chat_topic` et
        # `chat_tool_response` rendent tous deux « Conversation avec ZETIS » : dédoublonner sur
        # le type laisserait la même phrase deux fois dans la ligne. `dict` pour garder l'ordre.
        labels: dict[str, None] = {}
        for event_type in ordered:
            # `label_for` rend déjà un vocabulaire bienveillant (« Cours lu », « Quiz »,
            # « Révision SRS ») et un repli présentable pour un type inconnu : le journal
            # accueillera d'autres producteurs que ceux d'aujourd'hui.
            labels.setdefault(label_for(event_type), None)
        out.append(
            {
                **_trace_ref(subject),
                # `{id, name}` et non plus le nom seul : l'identifiant est ce qui permet à
                # Massimo de REVENIR sur la notion (Amdt 8 §D10). Sans lui, le bloc racontait
                # ce qu'il avait fait sans lui laisser aucun moyen d'y retourner.
                "notions": [
                    {"id": skill_id, "name": name} for skill_id, name in bucket["notions"].items()
                ],
                "forms": list(labels),
            }
        )
    return {"date": day, "subjects": out}


def plan_steps_by_day(
    db: Session, *, student_id: int, first: date, last: date
) -> dict[date, list[dict]]:
    """Les étapes de plan qui tombent chaque jour de la fenêtre (ADR-0050).

    ⚠️ **La fenêtre des ÉCHÉANCES est plus large que celle des JOURS**, et c'est le point subtil
    de cette fonction : une étape tombe *avant* son échéance. Un contrôle qui a lieu trois jours
    après la fin de la bande porte donc des étapes **dans** la bande. Ne chercher que les
    échéances de la fenêtre les ferait disparaître, sans erreur et sans test rouge.

    Le plan est composé **à la demande** ici (`get_or_create_plan`) : c'est la « première lecture »
    du §8 rôle 1. Lire la bande est donc ce qui fait naître les plans — voulu, et la seule
    alternative serait un job de fond pour un objet que personne ne regarde peut-être jamais.
    """
    items = _items_between(
        db,
        student_id=student_id,
        first=first,
        last=last + timedelta(days=plan_mod.PLAN_MAX_STEPS),
    )
    out: dict[date, list[dict]] = {}
    for item in items:
        for step in plan_mod.get_or_create_plan(db, item):
            jour = item.due_on - timedelta(days=step.day_offset)
            if first <= jour <= last:
                out.setdefault(jour, []).append(plan_mod.step_out(step))
    return out


def _days_between(
    db: Session, *, student_id: int, first: date, last: date, anchor: date
) -> list[dict]:
    """Les jours d'une fenêtre, dans la forme unique que partagent la bande et la grille mois.

    Une seule composition pour deux vues (Amdt 8 §D1) : deux fabriques de jour finiraient par
    diverger sur l'asymétrie, qui est justement ce qui vient de changer.
    """
    today = today_local()
    subjects = subjects_index(db)
    # Une seule requête pour toute la fenêtre ; le découpage par jour se fait en Python.
    items = _items_between(db, student_id=student_id, first=first, last=last)
    by_day: dict[date, list[AgendaItem]] = {}
    for item in items:
        by_day.setdefault(item.due_on, []).append(item)
    traces = trace_subjects_by_day(
        db, student_id=student_id, first=first, last=min(last, today)
    )
    # Une seule résolution de servabilité pour toute la fenêtre (ADR-0049 §2).
    revisable = revisable_counts(db, student_id=student_id, items=items)
    steps_by_day = plan_steps_by_day(db, student_id=student_id, first=first, last=last)

    days: list[dict] = []
    day = first
    while day <= last:
        past_or_today = day <= today
        future_or_today = day >= today
        days.append(
            {
                "date": day,
                "offset": (day - anchor).days,
                # `[]` sur un jour passé sans activité, `null` sur un jour à venir. Les deux se
                # rendent identiquement — comme RIEN — mais le contrat garde la distinction : un
                # jour à venir n'a pas de passé, il n'a pas non plus de passé vide.
                "traces": traces.get(day, []) if past_or_today else None,
                # 🔴 **PLUS D'ASYMÉTRIE ICI** (Amdt 8 §R3). Un jour passé annonce désormais ce que
                # l'école demandait — c'était `[]`, et le §6 disait « un jour passé n'a plus
                # d'échéance à annoncer ».
                #
                # ⚠️ `done` part avec l'item, et il le faut : le panneau du jour s'en sert. Mais
                # **la grille ne doit jamais le rendre** — la différence visible coché/non-coché,
                # répétée sur trente jours, EST le compteur d'arriéré du §7. Le serveur ne peut
                # pas tenir cette règle à la place du client : elle est de RENDU.
                "fixed_items": [
                    student_out(item, subjects, revisable=revisable)
                    for item in by_day.get(day, [])
                ],
                # Le plan de préparation (ADR-0050). ⚠️ **Toujours jamais sur un jour PASSÉ**, et
                # l'Amendement 8 ne le rouvre pas : il a révoqué l'asymétrie des ÉCHÉANCES, pas
                # celle des étapes. Une étape qu'on ne peut plus faire n'est pas une aide, c'est
                # un reproche (§7).
                "plan_steps": steps_by_day.get(day, []) if future_or_today else [],
            }
        )
        day += timedelta(days=1)
    return days


def week(db: Session, *, student_id: int, anchor: date | None = None) -> dict:
    """Bande GLISSANTE (§6) : `AGENDA_BAND_DAYS_BEFORE` avant l'ancre, l'ancre, `_AFTER` après.

    ⚠️ Les valeurs sont **3 avant / 10 après — 14 colonnes** depuis le 2026-07-29, pas 3/3 : ce
    docstring annonçait « 7 jours, 3 après » depuis l'élargissement, et il était faux.

    Jamais alignée sur la semaine calendaire — celle-ci passerait de 6 jours d'horizon le lundi
    à 0 le dimanche, et l'écran deviendrait un pur rétroviseur au pire moment. C'est ce que
    `test_band_is_sliding_not_calendar` verrouille, et **l'Amendement 8 ne le rouvre pas** : la
    grille mois est une SECONDE vue, la bande ne devient pas calendaire.
    """
    anchor = anchor or today_local()
    return {
        "anchor": anchor,
        "days": _days_between(
            db,
            student_id=student_id,
            first=anchor - timedelta(days=settings.agenda_band_days_before),
            last=anchor + timedelta(days=settings.agenda_band_days_after),
            anchor=anchor,
        ),
    }


def month(db: Session, *, student_id: int, anchor: date | None = None) -> dict:
    """La grille mois (Amdt 8 §D1) — le mois de l'ancre, du 1er au dernier jour.

    **Ne rend QUE les jours du mois.** Les cellules de complément qui alignent la grille sur
    lundi sont fabriquées côté client et rendues totalement vides : afficher les jours voisins en
    gris importerait dans le champ de vision les trous d'un mois qu'on ne regarde pas.

    ⚠️ **Effet de bord assumé et BORNÉ** : `plan_steps_by_day` compose et persiste les plans à la
    lecture (`get_or_create_plan`). Sur un mois, cela peut faire naître les plans de toutes les
    échéances du mois — c'est le même mécanisme que la bande, sur une fenêtre plus large, et il
    reste idempotent. Ce qui serait fautif serait de le déclencher sur des mois qu'on ne regarde
    pas : d'où des bornes de navigation serrées ci-dessous, et aucun préchargement.
    """
    today = today_local()
    anchor = (anchor or today).replace(day=1)
    last = _end_of_month(anchor)

    # Bornes (§B6) : en arrière, le début de l'année scolaire ; en avant, mois courant + 2.
    # Au-delà il n'y a structurellement rien à voir — « ce qui arrive » a un horizon de 21 jours
    # et une étape de plan ne remonte que de quelques jours avant son échéance. Offrir la
    # navigation vers le désert enseigne que la page est vide.
    floor = _school_year_floor(db, today=today)
    ceiling = _add_months(today.replace(day=1), MONTH_NAV_AHEAD)
    previous = _add_months(anchor, -1)
    following = _add_months(anchor, 1)

    return {
        "anchor": anchor.strftime("%Y-%m"),
        "days": _days_between(
            db, student_id=student_id, first=anchor, last=last, anchor=today
        ),
        # `None` ⇒ le chevron DISPARAÎT côté client, il n'est jamais grisé (§14.6).
        "prev_anchor": previous.strftime("%Y-%m") if previous >= floor else None,
        "next_anchor": following.strftime("%Y-%m") if following <= ceiling else None,
    }


def upcoming(db: Session, *, student_id: int) -> list[dict]:
    """« Ce qui arrive » : contrôles et rendus non faits, horizon et liste BORNÉS (§6).

    La section ne grossit jamais, quel qu'en soit le nombre réel — un arriéré qui s'allonge à
    l'écran est un compteur de dette déguisé.
    """
    today = today_local()
    horizon = today + timedelta(days=settings.agenda_upcoming_horizon_days)
    subjects = subjects_index(db)
    rows = db.scalars(
        select(AgendaItem)
        .where(
            AgendaItem.student_id == student_id,
            AgendaItem.kind.in_(UPCOMING_KINDS),
            AgendaItem.due_on >= today,
            AgendaItem.due_on <= horizon,
            AgendaItem.done_at.is_(None),
            AgendaItem.dismissed_at.is_(None),
        )
        .order_by(AgendaItem.due_on, AgendaItem.id)
        .limit(settings.agenda_upcoming_max)
    ).all()
    return [
        {
            "id": item.id,
            "label": item.label,
            "subject": _subject_ref(subjects, item.subject_id),
            "due_on": item.due_on,
            "days_left": (item.due_on - today).days,
            # ADR-0050 : vrai SI ET SEULEMENT SI le plan a au moins une étape. Un `has_plan`
            # optimiste ferait apparaître un « ✦ » qui n'ouvre rien — le bouton mort du §14.6.
            "has_plan": bool(plan_mod.get_or_create_plan(db, item)),
        }
        for item in rows
    ]


def list_student_items(db: Session, *, student_id: int, first: date, last: date) -> list[dict]:
    subjects = subjects_index(db)
    items = _items_between(db, student_id=student_id, first=first, last=last)
    revisable = revisable_counts(db, student_id=student_id, items=items)
    return [student_out(item, subjects, revisable=revisable) for item in items]


def list_pilot_items(db: Session, *, student_id: int, first: date, last: date) -> list[dict]:
    """Vue Papa : archivés INCLUS (le masquage reste visible côté pilotage — §2c)."""
    items = _items_between(
        db, student_id=student_id, first=first, last=last, include_archived=True
    )
    # UNE requête pour toute la grille (ADR-0050 Décision 7), et surtout une requête qui ne
    # COMPOSE rien : lire le pilotage ne fige aucun plan.
    #
    # ⚠️ Les ARCHIVÉS en font partie, et leur plan aussi : `drop_plan` n'est appelé que sur un
    # déplacement de date, jamais à l'archivage. Un item masqué garde donc son compte — c'est
    # cohérent avec le §2c (« le masquage reste visible côté pilotage »), et l'écran le rend
    # déjà en `opacity-50`.
    return pilot_out_many(db, items)


def new_agenda_count(db: Session, student_id: int) -> int:
    """Items ARRIVÉS depuis le dernier regard de Massimo (addendum §12, adr-0030 §3).

    Témoin de NOUVEAUTÉ, jamais compteur d'arriéré : il naît d'un geste de Papa et meurt d'un
    REGARD. Ni `due_on` ni `done_at` n'entrent dans cette requête, et c'est le point entier —
    une échéance qui franchit sa date ne le bouge pas, cocher un item ne le bouge pas non plus.
    Le compteur d'items NON FAITS reste interdit sous toute forme (§3, §7, §12.4) : il
    grossirait quand Massimo ne vient pas, et c'est la définition d'une relance.

    Watermark NULL (personne n'a encore rien regardé depuis que le témoin existe) → tout est
    nouveau. C'est l'état correct, pas un cas dégradé : le badge retombera au premier regard.

    `dismissed_at IS NULL` écarte ce que Massimo a lui-même masqué. C'est un geste de l'enfant
    sur sa propre page, pas une échéance — la seule raison pour laquelle une date figure ici.
    """
    watermark = db.scalar(
        select(StudentProfile.agenda_last_seen_at).where(StudentProfile.id == student_id)
    )
    conditions = [
        AgendaItem.student_id == student_id,
        AgendaItem.dismissed_at.is_(None),
    ]
    if watermark is not None:
        conditions.append(AgendaItem.created_at > watermark)
    return db.scalar(select(func.count(AgendaItem.id)).where(*conditions)) or 0


# --- Écritures --------------------------------------------------------------------------------


def _get(db: Session, *, student_id: int, item_id: int) -> AgendaItem:
    item = db.get(AgendaItem, item_id)
    if item is None or item.student_id != student_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Échéance introuvable.")
    return item


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _trace_created(db: Session, item: AgendaItem) -> None:
    """Journal NON PROBANT (§3). Aucun XP, aucune écriture de progression."""
    log_learning_event(
        db,
        student_id=item.student_id,
        event_type=EVENT_AGENDA_ITEM_CREATED,
        subject_id=item.subject_id,
        payload={"item_id": item.id, "kind": item.kind, "source": item.created_by},
    )


def create_student_item(db: Session, *, student_id: int, data: dict) -> AgendaItem:
    """Saisie élève. **Verrou de phase (§10)** : 403 tant que le flag est fermé.

    Le verrou porte sur la SAISIE seule. Cocher et masquer restent ouverts dès la phase 0 :
    Papa étant en 403 sur `done_at`, sans eux l'objet n'aurait aucun état.
    """
    if not student_entry_enabled(db):
        raise AgendaForbidden("La saisie par Massimo n'est pas encore ouverte.")
    item = AgendaItem(
        student_id=student_id,
        label=data["label"],
        due_on=data["due_on"],
        subject_id=data.get("subject_id"),
        kind=data.get("kind") or "devoir",
        created_by="student",  # forcé serveur, jamais lu du corps.
    )
    db.add(item)
    db.flush()
    _trace_created(db, item)
    db.commit()
    db.refresh(item)
    return item


def _check_lesson_belongs(db: Session, lesson_id: int | None, chapter_id: int | None) -> None:
    """422 si la leçon pointée n'est pas dans le chapitre déclaré (addendum §15).

    Le cas se produit sans mauvaise volonté : Papa choisit un intitulé dans la liste d'un
    chapitre, **puis change de chapitre**. Le front efface alors la leçon, mais un client qui
    l'oublierait produirait un lien qui déposerait Massimo au hasard — exactement ce que
    `pilotageLinks` refuse en rendant `null`. Mieux vaut un 422 franc qu'une adresse fausse.
    """
    if lesson_id is None:
        return
    lesson = db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Leçon inconnue.")
    if chapter_id is not None and lesson.chapter_id != chapter_id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Cette leçon n'appartient pas au chapitre indiqué.",
        )


def create_parent_items(db: Session, *, student_id: int, items: list[dict]) -> list[AgendaItem]:
    """Saisie Papa, EN LOT (§9) : une semaine relevée sur l'ENT part en une requête."""
    created: list[AgendaItem] = []
    for data in items:
        _check_lesson_belongs(db, data.get("lesson_id"), data.get("chapter_id"))
        item = AgendaItem(
            student_id=student_id,
            label=data["label"],
            due_on=data["due_on"],
            subject_id=data.get("subject_id"),
            chapter_id=data.get("chapter_id"),
            lesson_id=data.get("lesson_id"),
            kind=data.get("kind") or "devoir",
            parent_note=data.get("parent_note"),
            created_by="parent",  # forcé serveur.
        )
        db.add(item)
        created.append(item)
    db.flush()
    for item in created:
        _trace_created(db, item)
    db.commit()
    for item in created:
        db.refresh(item)
    return created


# Champs éditables, par autorité. `created_by`, `done_at`, `dismissed_at` n'y figurent nulle
# part : l'immuabilité de `created_by` est tenue par cette liste, pas par une garde disséminée.
_STUDENT_EDITABLE = ("label", "due_on", "subject_id", "kind")
_PARENT_EDITABLE = ("label", "due_on", "subject_id", "chapter_id", "lesson_id", "kind")


def _apply(item: AgendaItem, data: dict, allowed: tuple[str, ...]) -> None:
    for field in allowed:
        if field in data:
            setattr(item, field, data[field])


def patch_student_item(db: Session, *, student_id: int, item_id: int, data: dict) -> AgendaItem:
    """Massimo édite SES items seulement (§2a, symétrique du marqueur côté Papa)."""
    if not student_entry_enabled(db):
        raise AgendaForbidden("La saisie par Massimo n'est pas encore ouverte.")
    item = _get(db, student_id=student_id, item_id=item_id)
    if item.created_by != "student":
        raise AgendaForbidden("Cette échéance a été ajoutée par Papa.")
    _apply(item, data, _STUDENT_EDITABLE)
    db.commit()
    db.refresh(item)
    return item


def patch_parent_item(db: Session, *, student_id: int, item_id: int, data: dict) -> AgendaItem:
    """Papa corrige. Sur un item de Massimo, le service pose LUI-MÊME `edited_by_parent_at`.

    Le marqueur n'est pas un champ du client : sans lui, Massimo découvrirait un agenda qui
    bouge tout seul, et la surveillance rentrerait par la porte de service (§2a).
    """
    if "done_at" in data:
        # Refus EXPLICITE plutôt qu'un champ silencieusement ignoré : si Papa coche, la case
        # devient une validation parentale et l'agenda un instrument de contrôle (§2b).
        raise AgendaForbidden("Seul Massimo coche ses échéances.")
    item = _get(db, student_id=student_id, item_id=item_id)
    # ⚠️ Contrôlé sur l'état RÉSULTANT, pas sur le corps : Papa peut ne patcher que le chapitre,
    # et rendre périmée une leçon posée plus tôt. Lire seulement `data` laisserait passer
    # exactement ce cas — celui qui produit un lien qui dépose Massimo au hasard.
    _check_lesson_belongs(
        db,
        data.get("lesson_id", item.lesson_id),
        data.get("chapter_id", item.chapter_id),
    )
    # 🔴 Le plan de préparation est une FONCTION DE LA DATE (ADR-0050 Décision 4) : si `due_on`
    # change, les jours qu'il porte ne veulent plus rien dire. On le supprime, coches comprises.
    #
    # ⚠️ Testé sur la PRÉSENCE de la clé et sur un changement RÉEL de valeur, jamais sur
    # `data.get("due_on")` : celui-ci vaut `None` aussi quand Papa ne patche pas la date, et le
    # chantier agenda a déjà payé « le PATCH partiel qui périme une donnée ».
    if "due_on" in data and data["due_on"] != item.due_on:
        plan_mod.drop_plan(db, item)
    _apply(item, data, _PARENT_EDITABLE)
    if item.created_by == "student":
        item.edited_by_parent_at = _now()
    db.commit()
    db.refresh(item)
    return item


def set_note(db: Session, *, student_id: int, item_id: int, note: str | None) -> AgendaItem:
    """Note privée de Papa — jamais servie à Massimo (schémas séparés).

    C'est le contrepoids explicite de l'absence de coche : Papa dispose d'un endroit pour écrire
    ce qu'il pense d'une échéance, pas d'un moyen de la valider.
    """
    item = _get(db, student_id=student_id, item_id=item_id)
    item.parent_note = note
    db.commit()
    db.refresh(item)
    return item


def set_done(db: Session, *, student_id: int, item_id: int, done: bool) -> AgendaItem:
    """Bascule `done_at`. Route ÉLÈVE exclusivement (§2b) — y compris sur un item de Papa.

    Cocher n'est pas remplir : c'est le seul geste qui rend l'objet sien. Aucun XP n'est crédité
    (§3) : cocher une case ne se récompense pas, sinon Massimo apprend à cocher.
    """
    item = _get(db, student_id=student_id, item_id=item_id)
    if done and item.done_at is None:
        item.done_at = _now()
        log_learning_event(
            db,
            student_id=item.student_id,
            event_type=EVENT_AGENDA_ITEM_DONE,
            subject_id=item.subject_id,
            payload={"item_id": item.id, "kind": item.kind},
        )
    elif not done:
        # Décocher n'émet RIEN : ni événement d'annulation, ni trace d'item non fait.
        # L'absence n'est pas un événement.
        item.done_at = None
    db.commit()
    db.refresh(item)
    return item


def dismiss(db: Session, *, student_id: int, item_id: int) -> AgendaItem:
    """Massimo masque un item. Archivage, jamais suppression (§2c).

    ⚠️ **Corrigé le 2026-08-10** : cette docstring disait *« y compris de Papa »*, ce que
    contredisent et le §2c (*« ce masquage reste visible côté pilotage »*) et `list_pilot_items`
    trente lignes plus haut, qui passe `include_archived=True`. Le code avait raison ; la phrase
    aurait envoyé une session future « réparer » un comportement juste.
    """
    item = _get(db, student_id=student_id, item_id=item_id)
    if item.dismissed_at is None:
        item.dismissed_at = _now()
    db.commit()
    db.refresh(item)
    return item


def undismiss(db: Session, *, student_id: int, item_id: int) -> AgendaItem:
    """Le masquage se rattrape — symétrique de `dismiss`, comme `set_done(done=False)` l'est de
    `set_done(done=True)`.

    🔴 **Né d'un défaut trouvé à la RELECTURE HUMAINE, le 2026-08-10.** `dismiss` n'avait aucun
    contraire — ni ici, ni en route, ni via `_STUDENT_EDITABLE`/`_PARENT_EDITABLE` d'où
    `dismissed_at` est exclu. Un tap de Massimo sur la croix retirait donc un devoir de son
    agenda **définitivement, et pour tout le monde** : Papa le voyait encore dans ses archives,
    mais ne pouvait que le **ressaisir à la main**.

    ⚠️ **Le §2c n'avait rien décidé là-dessus** — il tranche « masquer ≠ supprimer » et « le
    pilotage continue de voir ». L'irréversibilité n'était pas un choix, c'était un oubli, que
    l'asymétrie avec `undone` désignait dans le même routeur.

    Idempotent, comme `dismiss` : démasquer un item visible ne fait rien et ne casse pas.
    """
    item = _get(db, student_id=student_id, item_id=item_id)
    item.dismissed_at = None
    db.commit()
    db.refresh(item)
    return item


def archive(db: Session, *, student_id: int, item_id: int) -> AgendaItem:
    """« Suppression » côté Papa = archivage. La ligne reste en base : Papa n'efface jamais un
    item de Massimo."""
    return dismiss(db, student_id=student_id, item_id=item_id)


def restore(db: Session, *, student_id: int, item_id: int) -> AgendaItem:
    """Papa rend à Massimo une échéance archivée — le pendant de `archive`.

    C'est la moitié PARENTALE du rattrapage, et celle qui compte quand le geste n'était pas
    accidentel : un enfant qui masque un contrôle a besoin qu'un adulte puisse le remettre.
    Prolonge l'asymétrie que le §2c pose déjà (*« le parent voit tout »*) — il la rend agissante.
    """
    return undismiss(db, student_id=student_id, item_id=item_id)


def mark_agenda_seen(db: Session, *, student_id: int) -> None:
    """Massimo a regardé ce qui est arrivé — pose le high-water mark (addendum §12.3).

    Deux appelants côté client, et il en faut deux : l'ouverture de `/agenda` ET le rendu du
    bandeau d'Accueil. N'en retenir qu'un ferait mentir le témoin sur ce qui a déjà été lu.

    Idempotent, sans lecture préalable. **Geste de Massimo seul** : aucune route Papa n'appelle
    cette fonction, et la lecture du badge (`/api/student/news/summary`) non plus — sans quoi le
    compteur retomberait à zéro au montage du layout, avant tout regard.

    `func.now()` et non `_now()` : `AgendaItem.created_at` vient d'un `server_default=func.now()`
    (`db/base.py`), et la comparaison `created_at > agenda_last_seen_at` doit avoir la MÊME
    horloge des deux côtés. Un `datetime.now(timezone.utc)` Python se sérialise sur SQLite avec
    un suffixe `+00:00` qui trie après le naïf du server_default à instant égal — un item créé et
    vu dans la même seconde compterait comme nouveau.

    Résolution assumée : la comparaison est STRICTE (`>`), donc un item créé dans la même
    graduation d'horloge que le regard est considéré comme vu. En production (Postgres, `now()`
    à la microseconde) le cas ne se produit pas ; sur SQLite `CURRENT_TIMESTAMP` est à la
    seconde, et c'est pour ça que les tests datent explicitement les items « arrivés après ».
    Un `>=` échangerait ce cas de bord contre un pire : le badge ne retomberait pas à zéro pour
    les items regardés dans leur seconde de création.
    """
    db.execute(
        update(StudentProfile)
        .where(StudentProfile.id == student_id)
        .values(agenda_last_seen_at=func.now())
    )
    db.commit()
