"""Service agenda — co-édition, bande glissante, « ce qui arrive » (ADR-0025, Lot 1).

Toutes les règles de visibilité et d'autorité sont tenues ICI, côté serveur : le client ne
filtre rien, ne calcule aucune asymétrie, ne décide d'aucun droit. Une UI cachée n'est pas une
règle.

Ce module ne lit **ni** `missions`, **ni** les cartes SRS (règle de datation §4 : le calendrier
n'accueille que ce qui a une date dans le monde réel — ZETIS ne se donne jamais rendez-vous à
lui-même). Il ne crédite aucun XP et ne touche aucune table de progression.
"""

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
    StudentProfile,
    Subject,
)
from app.modules.activity.events import (
    EVENT_AGENDA_ITEM_CREATED,
    EVENT_AGENDA_ITEM_DONE,
    EVENT_LOGIN,
    EVENT_PAGE_VIEWED,
    NON_WORK_EVENTS,
    log_learning_event,
)
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


def student_out(item: AgendaItem, subjects: dict[int, Subject]) -> dict:
    """Vue Massimo. `parent_note` n'est pas filtrée : elle n'est jamais construite."""
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
    }


def pilot_out(item: AgendaItem, subjects: dict[int, Subject]) -> dict:
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
    }


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


def traces_by_day(db: Session, *, student_id: int, first: date, last: date) -> dict[date, int]:
    """Traces d'activité par jour Europe/Paris : **types d'activité distincts, plafonnés**.

    Arbitrage du point ouvert n°3 de l'ADR : un COMPTE de natures d'activité, pas un temps actif
    reconstruit — mesurer l'effort réintroduirait exactement ce que la doctrine écarte. Une
    rafale de révision vaut donc 1, pas 12 ; trois natures différentes plafonnent à 3.

    Rien n'est renvoyé pour un jour sans trace : `0` et « pas de donnée » sont le même état
    (§7), et le contrat ne doit pas laisser croire qu'il existe des cases à remplir.
    """
    start, end = range_bounds_utc(first, last)
    rows = db.execute(
        select(LearningEvent.event_type, LearningEvent.created_at).where(
            LearningEvent.student_id == student_id,
            LearningEvent.created_at >= start,
            LearningEvent.created_at < end,
            LearningEvent.event_type.not_in(_NON_TRACE_EVENTS),
        )
    ).all()
    kinds: dict[date, set[str]] = {}
    for event_type, created_at in rows:
        kinds.setdefault(local_day(created_at), set()).add(event_type)
    cap = settings.agenda_traces_cap
    return {day: min(cap, len(types)) for day, types in kinds.items() if types}


def week(db: Session, *, student_id: int, anchor: date | None = None) -> dict:
    """Bande GLISSANTE de 7 jours (§6) : 3 jours avant l'ancre, l'ancre, 3 jours après.

    Jamais alignée sur la semaine calendaire — celle-ci passerait de 6 jours d'horizon le lundi
    à 0 le dimanche, et l'écran deviendrait un pur rétroviseur au pire moment.

    **L'asymétrie passé/futur est calculée ici, jamais laissée au client** : un jour à venir n'a
    pas de passé (`traces = null`, et surtout pas `0`), un jour passé n'a plus d'échéance à
    annoncer (`fixed_items = []`).
    """
    today = today_local()
    anchor = anchor or today
    first = anchor - timedelta(days=settings.agenda_band_days_before)
    last = anchor + timedelta(days=settings.agenda_band_days_after)

    subjects = subjects_index(db)
    # Une seule requête pour toute la bande ; le découpage par jour se fait en Python.
    items = _items_between(db, student_id=student_id, first=first, last=last)
    by_day: dict[date, list[AgendaItem]] = {}
    for item in items:
        by_day.setdefault(item.due_on, []).append(item)
    traces = traces_by_day(db, student_id=student_id, first=first, last=min(last, today))

    days = []
    for offset in range(-settings.agenda_band_days_before, settings.agenda_band_days_after + 1):
        day = anchor + timedelta(days=offset)
        past_or_today = day <= today
        future_or_today = day >= today
        days.append(
            {
                "date": day,
                "offset": offset,
                "traces": traces.get(day, 0) if past_or_today else None,
                "fixed_items": (
                    [student_out(item, subjects) for item in by_day.get(day, [])]
                    if future_or_today
                    else []
                ),
                "plan_steps": [],  # Lot 2 — champ au contrat, jamais rempli ici.
            }
        )
    return {"anchor": anchor, "days": days}


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
            "has_plan": False,  # Lot 2.
        }
        for item in rows
    ]


def list_student_items(db: Session, *, student_id: int, first: date, last: date) -> list[dict]:
    subjects = subjects_index(db)
    items = _items_between(db, student_id=student_id, first=first, last=last)
    return [student_out(item, subjects) for item in items]


def list_pilot_items(db: Session, *, student_id: int, first: date, last: date) -> list[dict]:
    """Vue Papa : archivés INCLUS (le masquage reste visible côté pilotage — §2c)."""
    subjects = subjects_index(db)
    items = _items_between(
        db, student_id=student_id, first=first, last=last, include_archived=True
    )
    return [pilot_out(item, subjects) for item in items]


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
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Leçon inconnue.")
    if chapter_id is not None and lesson.chapter_id != chapter_id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
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
    """Massimo masque un item, y compris de Papa. Archivage, jamais suppression (§2c)."""
    item = _get(db, student_id=student_id, item_id=item_id)
    if item.dismissed_at is None:
        item.dismissed_at = _now()
    db.commit()
    db.refresh(item)
    return item


def archive(db: Session, *, student_id: int, item_id: int) -> AgendaItem:
    """« Suppression » côté Papa = archivage. La ligne reste en base : Papa n'efface jamais un
    item de Massimo."""
    return dismiss(db, student_id=student_id, item_id=item_id)


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
