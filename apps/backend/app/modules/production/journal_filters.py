"""Filtrer et trier le Journal — SERVEUR, sur toute l'histoire (addendum ADR-0034 « tri et filtre »).

## L'ordre est la décision : `WHERE` → `ORDER BY` → `LIMIT`

Filtrer une page déjà paginée est un défaut **silencieux**, et c'est la forme la plus coûteuse à
diagnostiquer : l'écran répondrait *« rien en maths »* alors que les lots de maths sont page 4.
Rien ici ne s'exécute côté Python sur des lots déjà chargés.

## Un filtre hiérarchique se résout en IDENTIFIANTS, puis devient un `IN`

`chapitre = C` doit retenir **aussi** les lots-pièce du chapitre C — un lot-pièce ne porte pas de
`chapter_id` (contrainte `ck_production_runs_exactly_one_scope`), il porte une notion. Sinon filtrer
par chapitre cacherait précisément les demandes de Massimo sur ce chapitre.

⚠️ **La règle « quelle est LA leçon de cette notion » n'est pas retraduite en SQL** : `lessons_by_skill`
(ADR-0037) est **appelée**, une fois par requête, et son résultat devient un paramètre. La récrire en
jointure referait le défaut qui a coûté un ADR entier — trois modules répondant différemment.

## La matière est une expression, pas deux requêtes

Deux chemins mènent à une matière (`chapitre → matière d'année` pour un lot-chapitre,
`Skill.subject_id` en direct pour un lot-pièce). Ils sont assemblés en **une** expression
`coalesce`, qui sert **à la fois** au filtre et au tri : sans ça, filtrer et trier pourraient ne pas
désigner la même chose.

⚠️ **La jointure matière passe par `school_year_subject_id`, exactement comme `lessons_by_skill`.**
Un chapitre rattaché seulement par `theme_id` n'a donc pas de matière ici — c'est **le même trou**
que dans le résolveur canonique, et le combler d'un seul côté créerait deux réponses. Voir la dette
nommée dans le rapport de slice : `Theme` porte une matière mais **aucune année scolaire**, donc la
réparation demande une décision de schéma, pas une jointure de plus.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import Select, and_, case, exists, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.core.config import settings
from app.db.models import (
    Chapter,
    Lesson,
    LessonSkill,
    ProductionEvent,
    ProductionRun,
    SchoolYearSubject,
    Skill,
    Subject,
)

# Les cinq statuts que l'écran montre. La base n'en connaît que quatre : `stale` est RENDU
# (ADR-0034 §2), et il se filtre donc par un prédicat, jamais par une colonne.
STATUTS = ("queued", "running", "stale", "done", "failed")
MODES = ("manuel", "semi", "autonome", "sur_mesure", "inconnu")
TRIS = ("date", "matiere", "mode", "statut")


@dataclass(frozen=True)
class JournalFiltre:
    """Ce que Papa a demandé. Vide partout = aucun filtre, et c'est l'état d'ouverture."""

    subject_ids: tuple[int, ...] = ()
    chapter_ids: tuple[int, ...] = ()
    depuis: date | None = None
    jusqu_a: date | None = None
    statuts: tuple[str, ...] = ()
    modes: tuple[str, ...] = ()
    pieces: tuple[str, ...] = ()
    tri: str = "date"
    descendant: bool = True

    def actif(self) -> bool:
        return bool(
            self.subject_ids
            or self.chapter_ids
            or self.depuis
            or self.jusqu_a
            or self.statuts
            or self.modes
            or self.pieces
        )


@dataclass
class _Jointures:
    """Les alias partagés entre le filtre et le tri — une seule construction, une seule vérité."""

    chapitre: type
    matiere_annee: type
    notion: type
    sujet: type
    subject_id: object = field(init=False)

    def __post_init__(self) -> None:
        # Un lot porte SOIT un chapitre SOIT une notion. `coalesce` dit « celle des deux qui existe »
        # sans que l'appelant ait à connaître la contrainte.
        self.subject_id = func.coalesce(self.matiere_annee.subject_id, self.notion.subject_id)


def _joindre(stmt: Select, j: _Jointures) -> Select:
    """Les quatre jointures externes. **Externes** : un lot sans chapitre ni notion résolvable doit
    rester dans le flux non filtré — le faire disparaître serait réécrire l'histoire par omission."""
    return (
        stmt.outerjoin(j.chapitre, j.chapitre.id == ProductionRun.chapter_id)
        .outerjoin(j.matiere_annee, j.matiere_annee.id == j.chapitre.school_year_subject_id)
        .outerjoin(j.notion, j.notion.id == ProductionRun.scope_skill_id)
        .outerjoin(j.sujet, j.sujet.id == j.subject_id)
    )


def _alias() -> _Jointures:
    return _Jointures(
        chapitre=aliased(Chapter),
        matiere_annee=aliased(SchoolYearSubject),
        notion=aliased(Skill),
        sujet=aliased(Subject),
    )


def _notions_canoniques_du_chapitre(db: Session, chapter_ids: tuple[int, ...]) -> set[int]:
    """Les notions dont LA leçon (au sens ADR-0037) tombe dans l'un de ces chapitres.

    Deux temps, et ils ne sont pas interchangeables :

    1. les notions **candidates** — celles liées à une leçon de ces chapitres. Une simple jointure ;
    2. le **filtre canonique** — parmi elles, celles dont la *première* leçon rendue par
       `lessons_by_skill` est bien dans le chapitre. Une notion portée par deux leçons de chapitres
       différents ne doit compter que pour celui vers lequel Massimo est orienté.

    Sauter le temps 2 rendrait un sur-ensemble : le filtre ramènerait des lots-pièce dont la notion
    « appartient » ailleurs. Le résolveur est appelé **une fois**, sur les candidates seulement.
    """
    from app.modules.lesson_resolution import lessons_by_skill

    if not chapter_ids:
        return set()
    candidates = set(
        db.scalars(
            select(LessonSkill.skill_id)
            .join(Lesson, Lesson.id == LessonSkill.lesson_id)
            .where(Lesson.chapter_id.in_(chapter_ids))
        ).all()
    )
    if not candidates:
        return set()
    par_notion = lessons_by_skill(db, list(candidates))
    return {
        skill_id
        for skill_id, lecons in par_notion.items()
        if lecons and lecons[0].chapter_id in chapter_ids
    }


def _clause_statut(statuts: tuple[str, ...], *, maintenant: datetime):
    """`stale` = `running` dont le battement a expiré — et **`running` l'EXCLUT**.

    Sans cette exclusion, un lot zombie répondrait à deux filtres et Papa le compterait deux fois.
    L'affichage les sépare déjà (`run_status`) ; le filtre doit dire la même chose, ou l'un des deux
    ment.
    """
    limite = maintenant - timedelta(minutes=settings.production_heartbeat_timeout_minutes)
    perime = and_(
        ProductionRun.status == "running",
        ProductionRun.heartbeat_at.is_not(None),
        ProductionRun.heartbeat_at < limite,
    )
    clauses = []
    for statut in statuts:
        if statut == "stale":
            clauses.append(perime)
        elif statut == "running":
            clauses.append(and_(ProductionRun.status == "running", ~perime))
        else:
            clauses.append(ProductionRun.status == statut)
    return or_(*clauses)


def _couples_nommes() -> dict[str, tuple[int, int]]:
    """Les paliers de chaque régime, LUS dans `NIVEAUX` — jamais recopiés (ADR-0032/0037)."""
    from app.modules.settings.service import A0A, A1, NIVEAUX

    return {nom: (paliers[A0A], paliers[A1]) for nom, paliers in NIVEAUX.items()}


def _clause_mode(modes: tuple[str, ...]):
    """Le mode devient deux entiers — pur SQL, paginable, et stable dans le temps."""
    couples = _couples_nommes()
    inconnu = or_(ProductionRun.a0a_level.is_(None), ProductionRun.a1_level.is_(None))
    nomme = or_(
        *[
            and_(ProductionRun.a0a_level == a0a, ProductionRun.a1_level == a1)
            for a0a, a1 in couples.values()
        ]
    )
    clauses = []
    for mode in modes:
        if mode == "inconnu":
            clauses.append(inconnu)
        elif mode == "sur_mesure":
            # Des paliers renseignés qui ne composent AUCUN préréglage : un état légitime.
            clauses.append(and_(~inconnu, ~nomme))
        elif mode in couples:
            a0a, a1 = couples[mode]
            clauses.append(
                and_(ProductionRun.a0a_level == a0a, ProductionRun.a1_level == a1)
            )
    return or_(*clauses) if clauses else None


def _clause_piece(pieces: tuple[str, ...]):
    """Le type se lit dans les ÉVÉNEMENTS, pas dans les cinq tables de pièces.

    Une table au lieu de cinq, et elle porte **déjà** ses index (`run_id`,
    `ix_production_events_run_created`). Surtout : l'événement existe pour ce qui a été **produit**
    comme pour ce qui a été **sauté** ou a **échoué** — filtrer les tables de pièces n'aurait rendu
    que les succès, c'est-à-dire l'inverse de ce qu'on cherche dans un journal.

    ⚠️ **Un lot bloqué AVANT d'avoir touché une pièce ne répond à aucun filtre de type**, et c'est
    inévitable : `production_events.piece` est `NULL` sur `outcome='blocked'` (constat de code, pas
    un oubli). L'écran doit le DIRE dans son état vide.
    """
    return exists(
        select(ProductionEvent.id).where(
            ProductionEvent.run_id == ProductionRun.id,
            ProductionEvent.piece.in_(pieces),
        )
    )


def _rang_du_mode() -> tuple:
    """DEUX expressions, et la première est la décision.

    1. **hors de l'échelle** (`sur_mesure`, `inconnu`) : `0` ou `1`, trié **toujours croissant** ;
    2. le rang d'autonomie parmi les régimes nommés, qui suit le sens demandé.

    ⚠️ Un rang unique **ne suffit pas**. Avec un seul `case`, donner le rang maximal aux hors-échelle
    les met en fin en ordre croissant… et **en tête** en ordre décroissant — c'est-à-dire au sommet
    de l'autonomie, ce qu'ils ne sont pas. Ils ne sont ni plus ni moins autonomes que *Manual* : ils
    sont hors de l'échelle, et une échelle ne classe pas ce qui n'est pas dessus.

    (Trouvé en écrivant le test, pas après : la première version rendait `{sur_mesure, inconnu}` en
    tête du tri décroissant.)
    """
    couples = _couples_nommes()
    ordre = ["manuel", "semi", "autonome"]
    branches = [
        (
            and_(
                ProductionRun.a0a_level == couples[nom][0],
                ProductionRun.a1_level == couples[nom][1],
            ),
            rang,
        )
        for rang, nom in enumerate(ordre)
        if nom in couples
    ]
    nomme = case(*[(cond, 0) for cond, _ in branches], else_=1)
    return nomme, case(*branches, else_=len(ordre))


def appliquer(
    stmt: Select, db: Session, filtre: JournalFiltre, j: _Jointures, *, maintenant: datetime
) -> Select:
    """Le `WHERE`. Les critères se cumulent en ET ; plusieurs valeurs d'un critère, en OU."""
    stmt = _joindre(stmt, j)

    if filtre.subject_ids:
        stmt = stmt.where(j.subject_id.in_(filtre.subject_ids))

    if filtre.chapter_ids:
        notions = _notions_canoniques_du_chapitre(db, filtre.chapter_ids)
        chapitre_ou_piece = [ProductionRun.chapter_id.in_(filtre.chapter_ids)]
        if notions:
            chapitre_ou_piece.append(ProductionRun.scope_skill_id.in_(notions))
        stmt = stmt.where(or_(*chapitre_ou_piece))

    if filtre.depuis:
        stmt = stmt.where(
            ProductionRun.created_at >= datetime.combine(filtre.depuis, time.min, timezone.utc)
        )
    if filtre.jusqu_a:
        # Borne INCLUSE : « jusqu'au 4 août » doit retenir un lot de 15:52 le 4 août. Comparer à
        # minuit exclurait toute la journée demandée, et personne ne s'en apercevrait.
        stmt = stmt.where(
            ProductionRun.created_at <= datetime.combine(filtre.jusqu_a, time.max, timezone.utc)
        )

    if filtre.statuts:
        stmt = stmt.where(_clause_statut(filtre.statuts, maintenant=maintenant))
    if filtre.modes:
        clause = _clause_mode(filtre.modes)
        if clause is not None:
            stmt = stmt.where(clause)
    if filtre.pieces:
        stmt = stmt.where(_clause_piece(filtre.pieces))
    return stmt


def ordonner(stmt: Select, filtre: JournalFiltre, j: _Jointures) -> Select:
    """L'`ORDER BY`, et sa QUEUE — qui n'est pas une élégance.

    ⚠️ **Toute clé est départagée par `created_at DESC, id DESC`.** Sans cette queue, deux lots de
    même matière s'ordonnent différemment d'une page à l'autre, et la pagination **perd ou répète
    des lots** en silence. C'est un défaut de pagination classique, et son test existe.
    """
    if filtre.tri == "mode":
        # Le hors-échelle passe TOUJOURS en dernier, quel que soit le sens : il est trié à part.
        hors_echelle, rang = _rang_du_mode()
        principaux = [hors_echelle.asc(), rang.desc() if filtre.descendant else rang.asc()]
        return stmt.order_by(
            *principaux, ProductionRun.created_at.desc(), ProductionRun.id.desc()
        )

    cles = {
        "date": ProductionRun.created_at,
        "matiere": j.sujet.name,
        "statut": ProductionRun.status,
    }
    cle = cles.get(filtre.tri, ProductionRun.created_at)
    principal = cle.desc() if filtre.descendant else cle.asc()
    if filtre.tri == "date":
        return stmt.order_by(principal, ProductionRun.id.desc())
    # ⚠️ La queue reste TOUJOURS chronologique décroissante, même quand la clé est inversée : elle
    # départage, elle ne participe pas au sens du tri demandé.
    return stmt.order_by(principal, ProductionRun.created_at.desc(), ProductionRun.id.desc())


def compter(db: Session, filtre: JournalFiltre, *, maintenant: datetime) -> int:
    """Le total de l'ensemble FILTRÉ — jamais celui de l'histoire entière.

    `has_more` et le compteur d'écran portent tous deux sur cet ensemble : afficher « 7 sur 23 »
    quand le filtre en garde 7 est juste ; afficher « 7 sur 7 » cacherait qu'il y a autre chose.
    """
    j = _alias()
    stmt = appliquer(select(func.count(ProductionRun.id)), db, filtre, j, maintenant=maintenant)
    return db.scalar(stmt) or 0


def selectionner(db: Session, filtre: JournalFiltre, *, maintenant: datetime) -> Select:
    """La requête des lots : filtrée, triée, **et seulement ensuite** paginée par l'appelant."""
    j = _alias()
    stmt = appliquer(select(ProductionRun), db, filtre, j, maintenant=maintenant)
    return ordonner(stmt, filtre, j)
