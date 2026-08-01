from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Callable

from fastapi import HTTPException, status
from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session

from app.db.models import (
    Skill,
    SpacedReviewAttempt,
    SpacedReviewCard,
    StudentProfile,
    Subject,
)
from app.modules.activity.events import EVENT_REVIEW_ATTEMPTED, log_learning_event
from app.modules.gamification.service import award_xp


def interval_from_score(score: int) -> int:
    """Intervalle FIXE de révision selon le score (pas de SM-2, pas d'ease_factor)."""
    if score < 50:
        return 1
    if score < 75:
        return 3
    return 7


def schedule_review(
    db: Session, *, student_id: int, skill_id: int, interval: int, front: str, back: str
) -> SpacedReviewCard:
    """Crée ou met à jour LA carte de révision d'une notion (due_at = now + intervalle)."""
    now = datetime.now(timezone.utc)
    due = now + timedelta(days=interval)

    card = db.scalar(
        select(SpacedReviewCard).where(
            SpacedReviewCard.student_id == student_id,
            SpacedReviewCard.skill_id == skill_id,
        )
    )
    if card is None:
        card = SpacedReviewCard(
            student_id=student_id,
            skill_id=skill_id,
            front_markdown=front,
            back_markdown=back,
            card_type="definition",
            interval_days=interval,
            due_at=due,
            status="scheduled",
        )
        db.add(card)
    else:
        card.front_markdown = front
        card.back_markdown = back
        card.interval_days = interval
        card.due_at = due
        card.status = "scheduled"
    return card


def get_due_cards(db: Session, *, student_id: int) -> list[SpacedReviewCard]:
    now = datetime.now(timezone.utc)
    return list(
        db.scalars(
            select(SpacedReviewCard).where(
                SpacedReviewCard.student_id == student_id,
                SpacedReviewCard.due_at <= now,
            )
        )
    )


# --- Session de révision (page Massimo « Révision », spec docs/frontend-massimo/page-revision.md) ---
#
# Plafonds de session — constantes SERVEUR, jamais exposées au client : la mécanique SRS
# est invisible côté Massimo (cf. page-revision.md §Plafonds).
REVIEW_SESSION_MAX_MIX = 12  # « Mélange du jour » (toutes matières)
REVIEW_SESSION_MAX_SUBJECT = 8  # deck matière
REVIEW_SESSION_FLASH = 5  # « Mélange éclair »

# XP : récompense l'EFFORT, pas le score (aucune incitation à s'auto-noter « Facile »).
XP_PER_REVIEW = 5  # premier passage du jour, quel que soit le rating
XP_PER_CONSOLIDATION = 2  # re-tour immédiat (planification inchangée)
XP_REASON_REVIEW = "review"
XP_REASON_CONSOLIDATION = "review_consolidation"

# Intervalles MVP (rating → délai en jours). PAS de SM-2 : `ease_factor` reste à sa
# valeur par défaut (réserve d'évolution, docs/ai/spaced-memory.md §Adaptation).
RATING_INTERVALS = {"again": 1, "hard": 3, "good": 7, "easy": 14}
VALID_RATINGS = frozenset(RATING_INTERVALS)

# Une carte « active » (`scheduled`/`new`) est révisable ; on exclut les états non-servis
# (ADR-0013) : `pending` = générée sans cours validé (cas dégradé) ; `suspended` = orpheline
# (plus aucun cours validé ne la couvre, planification conservée) ; `archived` = réserve.
# Le gate `due_at IS NOT NULL` (cf. `_due_conditions`) exclut déjà `pending` (due_at null) ;
# ce filtre de statut protège aussi les cartes suspendues (qui gardent leur due_at).
INACTIVE_CARD_STATUSES = frozenset({"pending", "suspended", "archived"})


def _now() -> datetime:
    """Instant courant (UTC = timezone serveur). Isolé pour être figé dans les tests."""
    return datetime.now(timezone.utc)


def _due_conditions(student_id: int, now: datetime):
    """Clauses WHERE communes : cartes dues et actives d'un élève."""
    return (
        SpacedReviewCard.student_id == student_id,
        SpacedReviewCard.due_at.is_not(None),
        SpacedReviewCard.due_at <= now,
        SpacedReviewCard.status.not_in(INACTIVE_CARD_STATUSES),
    )


def get_reviews_summary(db: Session, student: StudentProfile) -> dict:
    """Cartes dues agrégées par matière (via `skill_id` → `Skill.subject_id`).

    TOUTES les matières sont renvoyées (Massimo voit l'ensemble de ses matières « par
    défaut »), avec trois états côté client :
    - `has_cards=True, due_count>0` : cartes à réviser (lançable) ;
    - `has_cards=True, due_count=0` : cartes présentes mais aucune due (« à jour ✓ ») ;
    - `has_cards=False` : aucune carte active générée → matière GRISÉE (« pas encore de
      cartes »), non lançable (l'UI affiche alors l'emoji de la matière).

    Compteurs EXACTS : le « 15+ » est de la présentation (slice UI). `flash_size` = nombre
    de cartes que servirait le « Mélange éclair ».

    ⚠️ Le `new_count` renvoyé ici porte une clause d'ÉCHÉANCE (`due_at <= now`) et n'est donc
    **pas servable en navigation** : `schedule_review` pose `due_at = now + intervalle`, si bien
    qu'une carte fraîchement générée y entrerait 1 à 7 jours plus tard, SANS aucun geste de
    Massimo — un compteur qui grossit par écoulement du temps (adr-0030 §1). La clause est
    légitime ICI (le deck ne montre que ce qui est servable) et interdite là-bas. Le badge de
    navigation utilise `new_cards_count`, plus bas.
    """
    now = _now()
    # Cartes ACTIVES (servables) par matière, indépendamment de l'échéance : on compte à part
    # les cartes dues (à réviser) et, parmi elles, les « nouvelles » (jamais révisées → badge).
    active_conditions = (
        SpacedReviewCard.student_id == student.id,
        SpacedReviewCard.due_at.is_not(None),
        SpacedReviewCard.status.not_in(INACTIVE_CARD_STATUSES),
    )
    due_expr = func.count(case((SpacedReviewCard.due_at <= now, SpacedReviewCard.id)))
    new_expr = func.count(
        case(
            (
                and_(
                    SpacedReviewCard.due_at <= now,
                    SpacedReviewCard.last_reviewed_at.is_(None),
                ),
                SpacedReviewCard.id,
            )
        )
    )
    card_rows = db.execute(
        select(Subject.id, due_expr, new_expr)
        .join(Skill, Skill.subject_id == Subject.id)
        .join(SpacedReviewCard, SpacedReviewCard.skill_id == Skill.id)
        .where(*active_conditions)
        .group_by(Subject.id)
    ).all()
    with_cards = {sid: (due, new) for sid, due, new in card_rows}

    rows = db.execute(
        select(Subject.id, Subject.slug, Subject.name).order_by(Subject.sort_order, Subject.name)
    ).all()
    subjects = []
    for sid, slug, name in rows:
        due, new = with_cards.get(sid, (0, 0))
        subjects.append(
            {
                "slug": slug,
                "name": name,
                "due_count": due,
                "new_count": new,
                # Ce que servirait RÉELLEMENT le deck de cette matière — le plafond, pas
                # l'arriéré. Calculé ici parce que `REVIEW_SESSION_MAX_SUBJECT` vit ici : une
                # surface qui recopierait la constante mentirait le jour où elle bouge, sans
                # que rien ne le signale. `flash_size` ne convient pas, il est GLOBAL.
                "session_size": min(REVIEW_SESSION_MAX_SUBJECT, due),
                "has_cards": sid in with_cards,
            }
        )

    total_due = sum(s["due_count"] for s in subjects)
    return {
        "subjects": subjects,
        "total_due": total_due,
        "flash_size": min(REVIEW_SESSION_FLASH, total_due),
        "new_count": sum(s["new_count"] for s in subjects),
    }


def new_cards_count(db: Session, student_id: int) -> int:
    """Cartes JAMAIS RÉVISÉES — témoin de nouveauté de navigation (adr-0030 §3).

    **Diverge volontairement de `get_reviews_summary()["new_count"]`**, qui ajoute une clause
    d'échéance. Le raisonnement, parce qu'il se perd vite : `schedule_review` crée les cartes
    avec une échéance dans le FUTUR (`now + intervalle`) ; exiger que l'échéance soit atteinte
    ferait entrer la carte dans le compteur plusieurs jours après sa génération, sans que
    Massimo ait rien fait. C'est littéralement la colonne « arriéré » du §1 — un badge qui
    grossit tout seul — et le test-verrou `test_news_doctrine.py` le vérifie sur le CORPS de
    cette fonction. C'est pourquoi on n'écrit ici aucune garde de nullité sur l'échéance, même
    inoffensive : la règle est plus facile à tenir qu'à nuancer.

    Le filtre de statut suffit à écarter les cartes non servables — `pending` (générée sans
    cours validé), `suspended` (orpheline), `archived` (réserve).

    Naît d'une génération par Papa, meurt du PREMIER passage (`last_reviewed_at` posé), et une
    carte notée « re-tour » ne revient jamais dans le compteur (ce champ n'est plus remis à NULL).
    """
    return (
        db.scalar(
            select(func.count(SpacedReviewCard.id)).where(
                SpacedReviewCard.student_id == student_id,
                SpacedReviewCard.last_reviewed_at.is_(None),
                SpacedReviewCard.status.not_in(INACTIVE_CARD_STATUSES),
            )
        )
        or 0
    )


def interleave(cards: list, key: Callable[[object], str]) -> list:
    """Entrelace des cartes pour éviter deux matières identiques consécutives quand c'est
    possible — c'est le mécanisme pédagogique du deck mélange, pas un détail cosmétique
    (un `ORDER BY random()` ne le garantit PAS).

    Déterministe (aucun aléa) : à entrée égale, sortie égale. Stable : l'ordre d'entrée
    (due_at croissant) est préservé au sein d'une matière et sert de départage. Ne lève
    jamais : si l'alternance est impossible (ex. 5 cartes d'une matière + 1 d'une autre),
    le résultat reste complet, avec les collisions inévitables regroupées en fin.
    """
    groups: dict[str, deque] = {}
    order: list[str] = []  # ordre de première apparition = départage déterministe
    for card in cards:
        k = key(card)
        if k not in groups:
            groups[k] = deque()
            order.append(k)
        groups[k].append(card)

    result: list = []
    prev: str | None = None
    while len(result) < len(cards):
        eligible = [k for k in order if groups[k] and k != prev]
        if not eligible:  # seule la matière précédente reste : on la place quand même
            eligible = [k for k in order if groups[k]]
        # matière la plus fournie d'abord (évite de la coincer en fin, ce qui créerait
        # des collisions) ; à égalité, ordre d'apparition.
        best = max(eligible, key=lambda k: (len(groups[k]), -order.index(k)))
        result.append(groups[best].popleft())
        prev = best
    return result


def build_session(
    db: Session, student: StudentProfile, *, deck: str, subject_slug: str | None = None
) -> list[dict]:
    """Construit la liste de cartes d'une session, bornée et ordonnée côté serveur.

    `deck` ∈ {"mix_day", "mix_flash", "subject"} (+ `subject_slug` pour un deck matière).
    Sélection : cartes dues triées par `due_at` croissant (les plus anciennes d'abord),
    plafonnées selon le deck, puis entrelacées pour les mélanges. Le payload n'expose
    AUCUN champ de planification (`due_at`, `interval_days`, `ease_factor`).
    """
    now = _now()
    stmt = (
        select(SpacedReviewCard, Subject.slug)
        .join(Skill, SpacedReviewCard.skill_id == Skill.id)
        .join(Subject, Skill.subject_id == Subject.id)
        .where(*_due_conditions(student.id, now))
        .order_by(SpacedReviewCard.due_at.asc(), SpacedReviewCard.id.asc())
    )

    if deck == "mix_day":
        cap, mix = REVIEW_SESSION_MAX_MIX, True
    elif deck == "mix_flash":
        cap, mix = REVIEW_SESSION_FLASH, True
    elif deck == "subject":
        if not subject_slug:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Matière manquante.")
        stmt = stmt.where(Subject.slug == subject_slug)
        cap, mix = REVIEW_SESSION_MAX_SUBJECT, False
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Deck inconnu.")

    rows = db.execute(stmt.limit(cap)).all()  # (card, slug), déjà les plus anciennes

    if deck == "subject" and not rows:
        # Matière inconnue OU sans carte due → même 400 (indiscernable, pas de fuite).
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Aucune carte à réviser pour cette matière."
        )

    selected = interleave(rows, key=lambda r: r[1]) if mix else rows
    return [
        {
            "card_id": card.id,
            "subject_slug": slug,
            "front_markdown": card.front_markdown,
            "back_markdown": card.back_markdown,
        }
        for card, slug in selected
    ]


def record_attempt(
    db: Session, student: StudentProfile, card_id: int, rating: str
) -> dict:
    """Enregistre une note de carte et crédite l'XP.

    Consolidation détectée CÔTÉ SERVEUR (pas de flag client) : si la carte a déjà un
    attempt du même élève aujourd'hui (jour civil serveur), c'est un re-tour →
    planification inchangée, XP réduit. Sinon, replanification selon le rating (XP plein,
    quel que soit le rating). Une carte inexistante ou d'un autre élève → 404 (pas de
    fuite d'existence).
    """
    if rating not in VALID_RATINGS:  # défense (le router garde déjà via Literal → 422)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Note de révision inconnue.")

    card = db.scalar(
        select(SpacedReviewCard).where(
            SpacedReviewCard.id == card_id,
            SpacedReviewCard.student_id == student.id,
        )
    )
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Carte introuvable.")

    now = _now()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    already_today = db.scalar(
        select(func.count(SpacedReviewAttempt.id)).where(
            SpacedReviewAttempt.card_id == card.id,
            SpacedReviewAttempt.student_id == student.id,
            SpacedReviewAttempt.reviewed_at >= day_start,
        )
    )
    is_consolidation = bool(already_today)

    skill = db.get(Skill, card.skill_id)
    subject_id = skill.subject_id if skill is not None else None

    if is_consolidation:
        # Re-tour : tracé, mais `due_at` / `interval_days` / `last_reviewed_at` intacts
        # (un « Bien » à 3 min ne doit pas honnêtement envoyer la carte à 7 jours).
        next_due_at = card.due_at
        xp, reason = XP_PER_CONSOLIDATION, XP_REASON_CONSOLIDATION
    else:
        interval = RATING_INTERVALS[rating]
        card.interval_days = interval
        card.due_at = now + timedelta(days=interval)
        card.last_reviewed_at = now
        card.status = "scheduled"
        next_due_at = card.due_at
        xp, reason = XP_PER_REVIEW, XP_REASON_REVIEW

    db.add(
        SpacedReviewAttempt(
            card_id=card.id,
            student_id=student.id,
            rating=rating,
            reviewed_at=now,
            next_due_at=next_due_at,
            is_consolidation=is_consolidation,
        )
    )
    award_xp(db, student_id=student.id, subject_id=subject_id, amount=xp, reason=reason)
    # Journal d'activité : une carte = un événement. Les cartes consécutives d'une même séance
    # sont regroupées À LA LECTURE en « Révision SRS · n cartes » (le journal reste brut, la
    # projection agrège) — cf. `activity/service.group_reviews`.
    log_learning_event(
        db,
        student_id=student.id,
        event_type=EVENT_REVIEW_ATTEMPTED,
        subject_id=subject_id,
        skill_id=card.skill_id,
        payload={
            "card_id": card.id,
            "rating": rating,
            "is_consolidation": is_consolidation,
            "xp": xp,
        },
    )
    db.commit()
    return {
        "next_due_at": next_due_at,
        "xp_awarded": xp,
        "is_consolidation": is_consolidation,
    }
