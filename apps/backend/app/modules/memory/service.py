from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Callable

from fastapi import HTTPException, status
from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session

from app.db.models import (
    Chapter,
    Lesson,
    LessonSkill,
    Skill,
    SpacedReviewAttempt,
    SpacedReviewCard,
    StudentProfile,
    Subject,
)
from app.modules.activity.events import EVENT_REVIEW_ATTEMPTED, log_learning_event
from app.modules.gamification.service import award_xp
from app.modules.lesson_resolution import ordered_chapter_skill_ids
from app.modules.memory.population import (  # noqa: F401 — ré-export, cf. ci-dessous
    CARD_TYPE_DEFINITION,
    CARD_TYPE_DEFINITION_PERSO,
    INACTIVE_CARD_STATUSES,
    servable,
)

# ⚠️ `INACTIVE_CARD_STATUSES` est **ré-exporté** ici volontairement : `galaxy/service.py`,
# `dashboard/service.py` et `production/coverage.py` l'importent depuis ce module depuis
# toujours. Le déplacer sans ré-export aurait cassé trois imports pour un gain nul — et ces
# trois-là ne sont PAS concernés par le masquage (cf. `servable()`), c'est une décision, pas un
# oubli : ils répondent à des questions de Papa (charge, couverture), pas à « que reçoit
# Massimo ? ».


def interval_from_score(score: int) -> int:
    """Intervalle FIXE de révision selon le score (pas de SM-2, pas d'ease_factor)."""
    if score < 50:
        return 1
    if score < 75:
        return 3
    return 7


def schedule_review(
    db: Session,
    *,
    student_id: int,
    skill_id: int,
    interval: int,
    front: str,
    back: str,
    card_type: str = CARD_TYPE_DEFINITION,
) -> SpacedReviewCard:
    """Crée ou met à jour la carte **de ce type** pour cette notion (due_at = now + intervalle).

    🔴 **La clé est `(student_id, skill_id, card_type)`, pas `(student_id, skill_id)`** — addendum
    ADR-0015 §13. Cette fonction cherchait la carte **sans le type et sans ordre**, alors que
    `generation.py` en produit jusqu'à trois par notion, une par type, et commente déjà la clé à
    trois colonnes. Les deux moitiés du module ne s'accordaient pas.

    ⚠️ **Le défaut était LATENT, pas manifeste** (mesuré le 2026-08-13) : sur les 106 notions
    multi-cartes de la base, le plus petit `id` est la carte `definition` **106 fois sur 106**, et
    le balayage séquentiel la rendait donc en premier. Ça marchait **par coïncidence d'ordre
    physique** — qu'un `UPDATE`, un `VACUUM` ou un autre plan suffit à défaire. Ajouter le type
    (et l'ordre) ne répare pas une panne : ça **retire une dépendance accidentelle**.

    Le défaut `"definition"` garde les quatre appelants — ELI5 `reverse_evaluate` et les trois
    chemins de missions — à comportement **strictement constant**. Le seul cas où l'ancienne et la
    nouvelle version divergent est une notion portant des cartes mais **aucune `definition`** :
    l'ancienne écrasait alors une carte d'un autre type, la nouvelle en crée une. Ce cas est
    **inexistant en base** (0 notion mesurée) — et c'est exactement le cas qu'on veut voir traité
    correctement le jour où il apparaît.
    """
    now = datetime.now(timezone.utc)
    due = now + timedelta(days=interval)

    card = db.scalar(
        select(SpacedReviewCard)
        .where(
            SpacedReviewCard.student_id == student_id,
            SpacedReviewCard.skill_id == skill_id,
            SpacedReviewCard.card_type == card_type,
        )
        # Ordre stable : la clé à trois colonnes n'est pas encore contrainte en base au moment où
        # cette ligne est écrite, et un `db.scalar` sans `ORDER BY` rend une ligne ARBITRAIRE —
        # le motif exact du doublon de brouillon de fiche corrigé la veille.
        .order_by(SpacedReviewCard.id)
    )
    if card is None:
        card = SpacedReviewCard(
            student_id=student_id,
            skill_id=skill_id,
            front_markdown=front,
            back_markdown=back,
            card_type=card_type,
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
# Deck chapitre (ADR-0049) — aligné sur le deck matière, et volontairement PAS relevé avant un
# contrôle : ce plafond borne UNE session, pas la révision (rien n'empêche d'en lancer une
# seconde). Un mur de 20 cartes serait la pression anxiogène que `CLAUDE.md` §gamification interdit.
REVIEW_SESSION_MAX_CHAPTER = 8
REVIEW_SESSION_FLASH = 5  # « Mélange éclair »

# Places réservées aux cartes que Massimo a écrites lui-même (ADR-0056, règle C).
#
# 🔴 **Ce n'est PAS un plafond de plus** : elles se prennent DANS le plafond du deck, jamais en
# plus — une session de matière sert toujours ses 8 cartes. Le tri `due_at asc` sert les plus
# anciennes, or ce qu'il vient d'écrire est par construction le plus RÉCENT : mesuré le
# 2026-08-14, ses 7 définitions étaient aux rangs **153 à 159 sur 159** en Français, soit 19
# sessions d'arriéré. Le §13 de l'addendum ADR-0015 veut qu'il retrouve SA formulation.
#
# ⚠️ **Un seuil, donc un chiffre à surveiller** : 2 places sur 8 avec 7 cartes personnelles
# aujourd'hui. À 30 cartes personnelles, la question se rouvre (ADR-0056 §Conséquences).
REVIEW_PERSO_RESERVED = 2

# XP : récompense l'EFFORT, pas le score (aucune incitation à s'auto-noter « Facile »).
XP_PER_REVIEW = 5  # premier passage du jour, quel que soit le rating
XP_PER_CONSOLIDATION = 2  # re-tour immédiat (planification inchangée)
XP_REASON_REVIEW = "review"
XP_REASON_CONSOLIDATION = "review_consolidation"
# Session chapitre (ADR-0049 Décision 5) : XP PLEIN, pas les 2 XP du re-tour. Ceux-là paient une
# répétition peu coûteuse (la même carte trois minutes plus tard), PAS l'absence de
# replanification — une session chapitre demande le même effort qu'une session normale, et
# sous-payer précisément la session qu'on veut voir avant un contrôle serait une contre-incitation.
# La `reason` distincte est ce qui rend la série lisible (§Le signal qui dirait qu'on s'est trompé).
XP_REASON_REVIEW_CHAPTER = "review_chapter"

# Intervalles MVP (rating → délai en jours). PAS de SM-2 : `ease_factor` reste à sa
# valeur par défaut (réserve d'évolution, docs/ai/spaced-memory.md §Adaptation).
RATING_INTERVALS = {"again": 1, "hard": 3, "good": 7, "easy": 14}
VALID_RATINGS = frozenset(RATING_INTERVALS)

def _now() -> datetime:
    """Instant courant (UTC = timezone serveur). Isolé pour être figé dans les tests."""
    return datetime.now(timezone.utc)


def _due_conditions(student_id: int, now: datetime):
    """Clauses WHERE communes : cartes **servables** et dues d'un élève.

    L'échéance se compose par-dessus `servable()` (addendum ADR-0015 §13) — elle est légitime
    ici et interdite ailleurs, d'où la séparation des deux.
    """
    return (
        SpacedReviewCard.student_id == student_id,
        SpacedReviewCard.due_at.is_not(None),
        SpacedReviewCard.due_at <= now,
        servable(),
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
        servable(),
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
                servable(),
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


def chapter_card_conditions(db: Session, student_id: int):
    """Clauses WHERE des cartes SERVABLES d'un chapitre — **sans clause d'échéance** (ADR-0049 §3).

    C'est la seule sélection du module qui sert des cartes **non dues** : c'est tout l'objet du
    deck chapitre (réviser avant un contrôle, pas quand l'oubli le réclame).

    🔴 **Une seule clause de `_due_conditions` tombe : `due_at <= now`.** Les deux autres restent, et
    ce n'est pas décoratif :

    - `due_at IS NOT NULL` écarte les cartes **`pending`** — générées sans cours validé (ADR-0013),
      donc jamais montrables à Massimo. C'est LA clause qu'on supprime par erreur en croyant
      supprimer l'échéance, et le test-verrou `test_chapter_deck_never_serves_pending_cards` existe
      pour rougir ce jour-là.
    - le filtre de statut écarte aussi `suspended` (notion orpheline) et `archived`.
    """
    return (
        SpacedReviewCard.student_id == student_id,
        SpacedReviewCard.due_at.is_not(None),
        servable(),
    )


def chapter_servable_count(db: Session, student_id: int, chapter_id: int) -> int:
    """Nombre de cartes que le deck de ce chapitre servirait — **plafond compris** (ADR-0049 §2).

    C'est le nombre qu'une surface affiche, et c'est lui qui décide si la porte EXISTE : à zéro,
    aucune affordance n'est rendue — ni bouton grisé, ni bouton qui explique, **rien**
    (*« un bouton mort se lit comme une panne »*, addendum ADR-0025 §14.6).

    ⚠️ **Le calcul vit ICI, jamais côté client** : le plafond vit ici, et une surface qui le
    recopierait mentirait le jour où il bouge — c'est le raisonnement de `session_size`, et c'est
    la seconde source de vérité qui a divergé le jour même au §14.5 du chantier agenda.
    """
    skill_ids = ordered_chapter_skill_ids(db, chapter_id)
    if not skill_ids:
        return 0
    total = (
        db.scalar(
            select(func.count(SpacedReviewCard.id)).where(
                *chapter_card_conditions(db, student_id),
                SpacedReviewCard.skill_id.in_(skill_ids),
            )
        )
        or 0
    )
    return min(REVIEW_SESSION_MAX_CHAPTER, total)


def chapter_servable_counts(db: Session, student_id: int, chapter_ids: list[int]) -> dict[int, int]:
    """Version EN LOT de `chapter_servable_count`, pour une page entière d'échéances.

    L'agenda rend jusqu'à sept jours d'items d'un coup ; appeler la version unitaire dans la boucle
    de rendu ferait N×2 requêtes par page. Les doublons sont dédupliqués (deux échéances peuvent
    viser le même chapitre).
    """
    return {cid: chapter_servable_count(db, student_id, cid) for cid in dict.fromkeys(chapter_ids)}


def servable_chapters(db: Session, student_id: int) -> list[dict]:
    """Les chapitres qui ont vraiment quelque chose à réviser, **toutes matières** (ADR-0057 §4).

    Le troisième niveau de `/revision` : matière → chapitre. La recherche traverse les matières
    (ADR-0057 §9(3)), d'où un seul listing plutôt qu'un par matière.

    🔴 **On part des CARTES, jamais des chapitres** — et ce n'est pas un détail d'implémentation,
    c'est ce qui évite le trou le plus cher du dépôt. `Chapter` n'a **aucun `subject_id`** : il a
    deux parents, **tous deux nullables** (`school_year_subject_id`, `theme_id`). Descendre
    matière → chapitre par un `INNER JOIN` sur `SchoolYearSubject` fait disparaître **en silence**
    les chapitres rattachés par thème — ce trou a coûté l'ADR-0037 entier, a été retrouvé dans
    `lessons_by_skill` (addendum ADR-0034), puis une troisième fois dans l'ADR-0042.
    Ici la question ne se pose pas : ce module lit la matière d'une carte par
    `Skill.subject_id`, comme `get_reviews_summary` et `build_session`. Une seule convention.

    🔴 **La requête ÉNUMÈRE, `chapter_servable_count` JUGE.** Un partage strict, et il s'est
    imposé par un sabotage vert : la requête portait aussi `Lesson.status == 'validated'`, si bien
    que la servabilité était décidée à **deux** endroits. Chacun couvrant l'autre, aucun des deux
    sabotages ne rougissait — une redondance qui se lit comme une double sécurité et qui est en
    fait un test aveugle. La règle « quelles leçons comptent » vit dans
    `ordered_chapter_skill_ids`, et **là seulement** ; ici on ne filtre que sur les cartes.

    🔴 **Le COMPTE ne vient jamais de cette requête** non plus. La jointure `LessonSkill`
    ci-dessous **surcompterait** : une notion enseignée par deux leçons du même chapitre produit
    deux lignes, donc sa carte serait comptée deux fois (`ordered_chapter_skill_ids` déduplique,
    précisément pour ça) — c'est le raisonnement de `session_size`, et la seconde source de vérité
    qui a divergé le jour même au §14.5 du chantier agenda.

    ⚠️ **Coût assumé** : les chapitres à leçon non validée entrent dans les candidats et sortent au
    compte, pour un appel chacun. Sur la base de dev, une dizaine de candidats.

    ⚠️ **Aucun filtre d'année**, volontairement : `ordered_chapter_skill_ids` n'en porte pas non
    plus, si bien que le deck `{chapter}` sert des cartes pour tout chapitre à leçon validée. Un
    listing plus étroit que son propre deck cacherait des chapitres qui fonctionnent.

    Un chapitre à zéro **ne sort pas** (ADR-0057 §6, citant l'`adr-0049` D2) : le serveur décide
    de la servabilité, la surface ne la recompte jamais.
    """
    candidats = db.execute(
        select(
            Subject.slug,
            Subject.name.label("subject_name"),
            Chapter.id.label("chapter_id"),
            Chapter.name.label("chapter_name"),
        )
        .join(Skill, Skill.subject_id == Subject.id)
        .join(SpacedReviewCard, SpacedReviewCard.skill_id == Skill.id)
        .join(LessonSkill, LessonSkill.skill_id == Skill.id)
        .join(Lesson, Lesson.id == LessonSkill.lesson_id)
        .join(Chapter, Chapter.id == Lesson.chapter_id)
        .where(*chapter_card_conditions(db, student_id))
        # ⚠️ L'ordre est celui du PROGRAMME (`Chapter.sort_order`), pas l'alphabétique — c'est
        # l'information qu'une année scolaire porte, et la trier par nom l'effacerait sans que
        # rien ne le signale. Le front la relaie par `chapterOrder`.
        .group_by(Subject.slug, Subject.name, Subject.sort_order, Chapter.id, Chapter.name, Chapter.sort_order)
        .order_by(Subject.sort_order, Subject.name, Chapter.sort_order, Chapter.name)
    ).all()

    out: list[dict] = []
    for slug, subject_name, chapter_id, chapter_name in candidats:
        taille = chapter_servable_count(db, student_id, chapter_id)
        if taille == 0:
            continue
        out.append(
            {
                "chapter_id": chapter_id,
                "name": chapter_name,
                "subject": subject_name,
                "subject_slug": slug,
                # 🔴 `session_size`, PAS un stock : `chapter_servable_count` rend
                # `min(REVIEW_SESSION_MAX_CHAPTER, total)`. Un chapitre de 72 cartes servables
                # annonce **8**, parce que c'est ce que la session servira. Nommer ce champ
                # « count » en ferait un arriéré, donc la pression quotidienne que `CLAUDE.md`
                # interdit (ADR-0057 §7 : un compteur doit dire ce qu'il compte).
                "session_size": taille,
            }
        )
    return out


def _rows_with_reserved_places(db: Session, stmt, cap: int) -> list:
    """Les places réservées aux cartes que Massimo a écrites lui-même (ADR-0056, règle C).

    🔴 **On FILTRE le `stmt` déjà construit par la branche du deck — on ne le refait pas.** C'est
    ce qui fait que la règle se compose avec les conditions PROPRES de chaque deck : le deck
    chapitre sert des cartes **non dues** (ADR-0049 §3), et réécrire ici une clause d'échéance le
    casserait sans qu'aucune requête ne paraisse fausse.

    ⚠️ Le quota **réserve au plus, jamais d'office** : sans carte personnelle, les deux places
    retournent à la file et la session est exactement celle d'avant. Les places sont prises
    **dans** le plafond, jamais en plus — le nombre de cartes servies ne change pas.

    Les cartes réservées sont servies **en tête** : c'est la composition qui a été soumise à
    l'arbitrage et retenue le 2026-08-14.
    """
    perso = db.execute(
        stmt.where(SpacedReviewCard.card_type == CARD_TYPE_DEFINITION_PERSO).limit(
            REVIEW_PERSO_RESERVED
        )
    ).all()
    reste = stmt
    if perso:
        # ⚠️ La clause reste DERRIÈRE le `if` : `filterwarnings = ["error"]` (pyproject) ferait
        # d'un `SAWarning` sur `not_in([])` un échec de test.
        reste = stmt.where(SpacedReviewCard.id.not_in([card.id for card, _ in perso]))
    return list(perso) + list(db.execute(reste.limit(cap - len(perso))).all())


def build_session(
    db: Session,
    student: StudentProfile,
    *,
    deck: str,
    subject_slug: str | None = None,
    chapter_id: int | None = None,
) -> list[dict]:
    """Construit la liste de cartes d'une session, bornée et ordonnée côté serveur.

    `deck` ∈ {"mix_day", "mix_flash", "subject", "chapter"} (+ `subject_slug` / `chapter_id`).
    Sélection : cartes triées par `due_at` croissant (les plus anciennes d'abord), plafonnées
    selon le deck, puis entrelacées pour les mélanges. Le payload n'expose AUCUN champ de
    planification (`due_at`, `interval_days`, `ease_factor`).

    ⚠️ Les decks **matière** et **chapitre** réservent jusqu'à `REVIEW_PERSO_RESERVED` places aux
    cartes personnelles (ADR-0056) — cf. `_rows_with_reserved_places`. Les **mélanges n'y sont pas
    soumis** : la question n'a pas été arbitrée, et le mélange est le rituel.

    ⚠️ Le deck `chapter` est le seul à servir des cartes **non dues** — cf.
    `chapter_card_conditions`. Le tri `due_at` croissant y garde tout son sens : les plus en
    retard d'abord, puis les plus proches de l'être.
    """
    now = _now()
    stmt = (
        select(SpacedReviewCard, Subject.slug)
        .join(Skill, SpacedReviewCard.skill_id == Skill.id)
        .join(Subject, Skill.subject_id == Subject.id)
        .order_by(SpacedReviewCard.due_at.asc(), SpacedReviewCard.id.asc())
    )

    if deck == "mix_day":
        stmt = stmt.where(*_due_conditions(student.id, now))
        cap, mix, quota = REVIEW_SESSION_MAX_MIX, True, False
    elif deck == "mix_flash":
        stmt = stmt.where(*_due_conditions(student.id, now))
        cap, mix, quota = REVIEW_SESSION_FLASH, True, False
    elif deck == "subject":
        if not subject_slug:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Matière manquante.")
        stmt = stmt.where(*_due_conditions(student.id, now), Subject.slug == subject_slug)
        cap, mix, quota = REVIEW_SESSION_MAX_SUBJECT, False, True
    elif deck == "chapter":
        if not chapter_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Chapitre manquant.")
        # Un chapitre est d'une seule matière : pas d'entrelacement (comme le deck matière).
        skill_ids = ordered_chapter_skill_ids(db, chapter_id)
        if not skill_ids:
            # Chapitre inconnu, sans leçon validée, ou dont aucune leçon ne porte de notion.
            # Le 400 tombe plus bas, indiscernable des autres causes.
            skill_ids = [0]
        stmt = stmt.where(
            *chapter_card_conditions(db, student.id),
            SpacedReviewCard.skill_id.in_(skill_ids),
        )
        cap, mix, quota = REVIEW_SESSION_MAX_CHAPTER, False, True
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Deck inconnu.")

    rows = (
        _rows_with_reserved_places(db, stmt, cap)
        if quota
        else db.execute(stmt.limit(cap)).all()  # (card, slug), déjà les plus anciennes
    )

    if deck == "subject" and not rows:
        # Matière inconnue OU sans carte due → même 400 (indiscernable, pas de fuite).
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Aucune carte à réviser pour cette matière."
        )

    if deck == "chapter" and not rows:
        # Chapitre inexistant, sans leçon validée, ou sans carte servable → LE MÊME 400.
        # Indiscernable comme celui de la matière : un élève ne doit pas pouvoir sonder
        # l'existence d'un chapitre. La Décision 2 fait qu'un clic ne l'atteint jamais — cette
        # garde défend la route, elle ne pilote pas l'écran.
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Aucune carte à réviser pour ce chapitre."
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
    db: Session,
    student: StudentProfile,
    card_id: int,
    rating: str,
    *,
    chapter_id: int | None = None,
) -> dict:
    """Enregistre une note de carte et crédite l'XP. **Trois branches, pas deux.**

    | Branche | Replanifie ? | XP | `reason` |
    |---|---|---|---|
    | Passage normal | oui, selon le rating | 5 | `review` |
    | **Re-tour** (même carte, même jour) | non | 2 | `review_consolidation` |
    | **Session chapitre** (ADR-0049) | non | **5** | `review_chapter` |

    **Re-tour : détecté CÔTÉ SERVEUR**, sans rien demander au client — la carte a déjà un attempt
    du même élève aujourd'hui (jour civil serveur). Rien ne change ici.

    🔴 **Session chapitre : le client déclare un CONTEXTE, jamais un EFFET** (ADR-0049 Décision 4).
    Le serveur ne peut pas déduire l'origine d'un attempt — la même carte est servie par le
    mélange, le deck matière et le deck chapitre, et l'attempt est identique dans les trois cas.
    Le client passe donc `chapter_id`, et **le serveur le revalide** : il re-résout le chapitre et
    vérifie que la carte lui appartient réellement. **Un contexte faux est IGNORÉ EN SILENCE** —
    l'attempt est traité normalement, sans erreur ni mention.

    ⚠️ **Ce n'est pas l'abandon de la doctrine « pas de flag client », c'est sa précision.** Un
    booléen `non_scheduling` piloté par le client aurait laissé un bug front éteindre la
    planification **en silence** sur des sessions normales : le SRS se dégraderait sans qu'aucun
    écran ne change. Ici, le pire cas d'un client menteur est de demander le non-scheduling sur une
    carte qui appartient **vraiment** au chapitre nommé — c'est-à-dire le cas où il est légitime.

    L'effet persisté est `SpacedReviewAttempt.is_consolidation=True` dans les deux branches non
    planifiantes : tous ses lecteurs le lisent comme *« cet attempt n'a pas mesuré l'oubli »*, ce
    qui est exactement vrai des deux. La distinction, elle, vit dans `XPEvent.reason` et dans le
    payload de `learning_events` — **zéro migration**.

    Une carte inexistante ou d'un autre élève → 404 (pas de fuite d'existence).
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
    is_retour = bool(already_today)

    # Revalidation SERVEUR du contexte proposé par le client (cf. docstring) : le chapitre est
    # re-résolu, et la carte doit lui appartenir. Sinon → `False`, silencieusement.
    is_chapter_session = bool(
        chapter_id and card.skill_id in set(ordered_chapter_skill_ids(db, chapter_id))
    )

    skill = db.get(Skill, card.skill_id)
    subject_id = skill.subject_id if skill is not None else None

    # Les deux branches non planifiantes partagent l'effet ; elles diffèrent par l'XP et la raison.
    is_consolidation = is_retour or is_chapter_session

    if is_consolidation:
        # Ni re-tour ni session chapitre ne déplacent la carte : `due_at` / `interval_days` /
        # `last_reviewed_at` intacts. Pour le re-tour, un « Bien » à 3 min ne doit pas honnêtement
        # envoyer la carte à 7 jours ; pour la session chapitre, la carte n'était pas due et
        # avancer sa programmation dégraderait la mesure de l'oubli jusqu'à des mois plus tard
        # (ADR-0025 §11, l'invariant du chantier).
        next_due_at = card.due_at
        if is_retour:
            # Le re-tour l'emporte : deux passages le même jour restent une répétition peu
            # coûteuse, même à l'intérieur d'une session chapitre.
            xp, reason = XP_PER_CONSOLIDATION, XP_REASON_CONSOLIDATION
        else:
            xp, reason = XP_PER_REVIEW, XP_REASON_REVIEW_CHAPTER
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
            # Ce qui distingue un re-tour d'une session chapitre — `is_consolidation` est vrai
            # pour les deux. `None` sur un passage normal.
            "deck_chapter_id": chapter_id if is_chapter_session else None,
        },
    )
    db.commit()
    return {
        "next_due_at": next_due_at,
        "xp_awarded": xp,
        "is_consolidation": is_consolidation,
    }
