"""La file de relecture : tout ce qui est produit et n'atteint pas encore Massimo (ADR-0039).

Ce module est la **source unique** du « en attente de relecture ». La file de la page `/relecture`
et la ligne `validation` de la file « À décider » du dashboard en dérivent toutes deux — c'est ce
qui empêche de recréer le défaut que l'addendum ADR-0028 a documenté et corrigé : *deux populations
disjointes sous le même mot*.

Trois invariants portent tout le reste :

1. **Une seule table de prédicats** (`_family_query`). `pending_counts()` compte littéralement les
   lignes des requêtes que `build_queue()` sert. Les deux ne peuvent pas diverger sans qu'on touche
   la même fonction.
2. **Lecture seule.** Aucune écriture, jamais, même « pour rafraîchir un statut ».
3. **Bornage à l'année active** (§3), comme la Couverture — sinon la file annoncerait des objets
   qu'aucune page ne sait ouvrir.

⚠️ **Les quiz de mission et de fin de cours n'y sont pas**, et c'est un choix : l'ADR-0014 §2 les
sert sans gate, par doctrine — ils sont dérivés d'un substrat déjà validé. Un test le verrouille
pour que l'absence ne se relise pas comme un oubli.

**Le diagnostic, lui, y est** (ADR-0043) : il ne dérive d'aucun substrat validé — son prompt ne
reçoit que le nom de la matière, celui de la notion et un niveau. L'exemption ne s'y est jamais
appliquée ; la 6ᵉ famille en tire la conséquence. La ligne de partage n'est donc **pas** la table
(`quizzes` porte les deux) mais `quiz_type` — c'est ce qui rend la doctrine relisible : ce qui
dérive du validé passe, ce qui mesure à froid se relit.

⚠️ **Les deux conventions de statut coexistent et restent** : `lessons.status == 'draft'` d'un côté,
`validation_status == 'pending'` de l'autre. Ce n'est pas une dette qu'on repousse : `school.py`
documente que `created_by`/`status` de `Lesson` **ne sont pas un doublon** du motif
`source`/`validation_status` des chapitres. Aligner défairait une décision écrite. On les nomme une
fois, ici, au seul endroit qui les regarde ensemble.
"""

from sqlalchemy import Select, and_, func, null, or_, select
from sqlalchemy.orm import Session

from app.db.models import (
    Capsule,
    Chapter,
    Fiche,
    Lesson,
    Mindmap,
    Quiz,
    SchoolYear,
    SchoolYearSubject,
    Subject,
    Theme,
)

# Ordre FIXE des familles, repris tel quel par la file « À décider » et par la page. Il encode la
# priorité de diffusion — un chapitre non validé bloque ses leçons, une leçon non validée bloque
# ses dérivés — et non la chronologie.
#
# `diagnostic` est en DERNIER, et pas par ancienneté : il ne bloque rien et rien ne le bloque. Un
# diagnostic se génère sans cours (son prompt ne lit aucun substrat), il n'a donc pas sa place dans
# la chaîne de déblocage que l'ordre encode.
KINDS: tuple[str, ...] = ("lesson", "fiche", "mindmap", "capsule", "chapter", "diagnostic")

# Libellés (singulier, pluriel) pour la ligne de la file « À décider » : « 27 cours · 1 fiche ».
#
# ⚠️ Le pluriel est PORTÉ, pas calculé par un `+ "s"` : **« cours » est invariable**, et une règle
# mécanique écrirait « 27 courss ». C'est aussi pourquoi la famille s'appelle `lesson` côté données
# et « cours » à l'écran — Papa relit un cours, la table stocke une leçon.
KIND_LABELS: dict[str, tuple[str, str]] = {
    "lesson": ("cours", "cours"),
    "fiche": ("fiche", "fiches"),
    "mindmap": ("mindmap", "mindmaps"),
    "capsule": ("capsule", "capsules"),
    "chapter": ("chapitre", "chapitres"),
    "diagnostic": ("diagnostic", "diagnostics"),
}


def kind_label(kind: str, count: int) -> str:
    """« 1 fiche », « 27 cours » — le nombre et son mot, accordés."""
    singulier, pluriel = KIND_LABELS[kind]
    return f"{count} {pluriel if count > 1 else singulier}"


def active_year_id(db: Session, student_id: int | None = None) -> int | None:
    """Année scolaire active — même lecture que `production/coverage.py`."""
    query = select(SchoolYear.id).where(SchoolYear.status == "active")
    if student_id is not None:
        query = query.where(SchoolYear.student_id == student_id)
    return db.scalar(query.order_by(SchoolYear.id.desc()))


def _year_subject_ids(year_id: int):
    """Sous-requête : les matières étudiées cette année-là."""
    return select(SchoolYearSubject.subject_id).where(SchoolYearSubject.school_year_id == year_id)


def _chapter_in_year(year_id: int):
    """Prédicat « ce chapitre appartient à l'année active », par les DEUX chemins de rattachement.

    ⚠️ `Chapter.school_year_subject_id` est **nullable** : un chapitre peut vivre sous
    `Subject → Theme → Chapter`, sans aucun chemin direct vers une année scolaire. Le même trou a
    coûté l'ADR-0037 entier, puis a été retrouvé une seconde fois dans `lessons_by_skill`
    (addendum ADR-0034) — à chaque fois parce qu'un `INNER JOIN` sur `SchoolYearSubject` faisait
    disparaître ces chapitres **en silence**.

    On accepte donc les deux : rattachement direct à l'année, ou — à défaut de rattachement — thème
    dont la matière est étudiée cette année. Le second cas est plus permissif que la Couverture ;
    c'est délibéré. Une file de relecture qui cache un objet produit est pire qu'une file qui en
    montre un de plus.
    """
    return or_(
        SchoolYearSubject.school_year_id == year_id,
        and_(
            Chapter.school_year_subject_id.is_(None),
            Theme.subject_id.in_(_year_subject_ids(year_id)),
        ),
    )


def _with_chapter_context(query: Select) -> Select:
    """Greffe la résolution de matière d'un chapitre : `COALESCE` des deux chemins.

    Une seule des deux jointures produirait des objets **sans matière**, silencieusement absents de
    tout regroupement — le pire cas, parce qu'il ne fait pas de bruit.
    """
    return (
        query.outerjoin(SchoolYearSubject, SchoolYearSubject.id == Chapter.school_year_subject_id)
        .outerjoin(Theme, Theme.id == Chapter.theme_id)
        .outerjoin(
            Subject,
            Subject.id == func.coalesce(SchoolYearSubject.subject_id, Theme.subject_id),
        )
    )


# ── Les cinq requêtes de famille ────────────────────────────────────────────────
#
# Chacune rend les MÊMES dix colonnes, sous les MÊMES libellés. Cette uniformité est ce qui permet
# à `pending_counts` de compter exactement ce que `build_queue` sert, sans réécrire un prédicat —
# et à `_row_to_item` de rester une seule fonction.
_COLUMNS = (
    "oid",
    "otitle",
    "subject_id",
    "subject_name",
    "subject_slug",
    "chapter_id",
    "chapter_name",
    "lesson_id",
    "lesson_title",
    "created_at",
)


def _lessons_query(year_id: int) -> Select:
    return _with_chapter_context(
        select(
            Lesson.id.label("oid"),
            Lesson.title.label("otitle"),
            Subject.id.label("subject_id"),
            Subject.name.label("subject_name"),
            Subject.slug.label("subject_slug"),
            Chapter.id.label("chapter_id"),
            Chapter.name.label("chapter_name"),
            Lesson.id.label("lesson_id"),
            Lesson.title.label("lesson_title"),
            Lesson.created_at.label("created_at"),
        )
        .select_from(Lesson)
        .join(Chapter, Chapter.id == Lesson.chapter_id)
    ).where(Lesson.status == "draft", _chapter_in_year(year_id))


def _derivative_query(model, year_id: int) -> Select:
    """Fiches et mindmaps : même rattachement leçon-centré, un seul modèle change.

    Le titre affiché est celui de la **leçon** : une fiche n'a pas de titre propre, et « Fiche 12 »
    ne dirait rien de ce qu'il y a à relire.
    """
    return _with_chapter_context(
        select(
            model.id.label("oid"),
            Lesson.title.label("otitle"),
            Subject.id.label("subject_id"),
            Subject.name.label("subject_name"),
            Subject.slug.label("subject_slug"),
            Chapter.id.label("chapter_id"),
            Chapter.name.label("chapter_name"),
            Lesson.id.label("lesson_id"),
            Lesson.title.label("lesson_title"),
            model.created_at.label("created_at"),
        )
        .select_from(model)
        .join(Lesson, Lesson.id == model.lesson_id)
        .join(Chapter, Chapter.id == Lesson.chapter_id)
    ).where(
        model.validation_status == "pending",
        Lesson.status != "archived",
        _chapter_in_year(year_id),
    )


def _capsules_query(year_id: int) -> Select:
    """Les capsules ne passent PAS par une leçon.

    Elles portent `subject_id` en direct et un `chapter_id` **facultatif** — c'est précisément
    pourquoi elles n'entrent pas dans la matrice de la Couverture, et pourquoi cette file existe.
    Le bornage se fait donc sur la matière : une capsule d'une matière étudiée cette année est dans
    le périmètre, rattachée à un chapitre ou non.
    """
    return (
        select(
            Capsule.id.label("oid"),
            Capsule.title.label("otitle"),
            Subject.id.label("subject_id"),
            Subject.name.label("subject_name"),
            Subject.slug.label("subject_slug"),
            Capsule.chapter_id.label("chapter_id"),
            Chapter.name.label("chapter_name"),
            null().label("lesson_id"),
            null().label("lesson_title"),
            Capsule.created_at.label("created_at"),
        )
        .select_from(Capsule)
        .join(Subject, Subject.id == Capsule.subject_id)
        .outerjoin(Chapter, Chapter.id == Capsule.chapter_id)
        .where(
            Capsule.validation_status == "pending",
            Capsule.subject_id.in_(_year_subject_ids(year_id)),
        )
    )


def _chapters_query(year_id: int) -> Select:
    """Un chapitre n'a pas de leçon parente : `lesson_id` reste `NULL`, et c'est l'information.

    C'est LUI le nœud à trancher — ses leçons ne peuvent pas être validées avant lui.

    ⚠️ `Chapter` n'hérite pas de `TimestampMixin` : il n'a **pas** de date de création. On sert
    `NULL` plutôt que d'inventer une date à partir d'autre chose.
    """
    return _with_chapter_context(
        select(
            Chapter.id.label("oid"),
            Chapter.name.label("otitle"),
            Subject.id.label("subject_id"),
            Subject.name.label("subject_name"),
            Subject.slug.label("subject_slug"),
            Chapter.id.label("chapter_id"),
            Chapter.name.label("chapter_name"),
            null().label("lesson_id"),
            null().label("lesson_title"),
            null().label("created_at"),
        ).select_from(Chapter)
    ).where(Chapter.validation_status == "pending", _chapter_in_year(year_id))


def _diagnostics_query(year_id: int) -> Select:
    """Les diagnostics en attente de relecture (ADR-0043 Décision 1).

    🔴 **Le bornage est celui des CAPSULES, pas celui des dérivés.** Un diagnostic porte
    `subject_id` et **rien d'autre** : `chapter_id` et `lesson_id` sont `NULL` par construction —
    il mesure une matière, pas un cours. Le passer par `_derivative_query`, qui joint la leçon,
    rendrait **zéro ligne en silence** : le piège exact que `_chapter_in_year` documente déjà pour
    les chapitres orphelins, transposé d'un cran.

    `status != 'archived'` : un diagnostic retiré ne se relit plus, mais ses tentatives restent
    (ADR-0014 Décision 3 — on n'efface pas l'histoire).

    ⚠️ **Le filtre porte sur `quiz_type`, jamais sur la table.** `quizzes` héberge maintenant du
    gaté et du non-gaté ; une requête écrite sur `Quiz` seul ferait entrer tous les quiz de mission
    dans la file au premier oubli de prédicat.
    """
    return (
        select(
            Quiz.id.label("oid"),
            Quiz.title.label("otitle"),
            Subject.id.label("subject_id"),
            Subject.name.label("subject_name"),
            Subject.slug.label("subject_slug"),
            null().label("chapter_id"),
            null().label("chapter_name"),
            null().label("lesson_id"),
            null().label("lesson_title"),
            Quiz.created_at.label("created_at"),
        )
        .select_from(Quiz)
        .join(Subject, Subject.id == Quiz.subject_id)
        .where(
            Quiz.quiz_type == "diagnostic",
            Quiz.validation_status == "pending",
            Quiz.status != "archived",
            Quiz.subject_id.in_(_year_subject_ids(year_id)),
        )
    )


def _family_query(kind: str, year_id: int) -> Select:
    if kind == "lesson":
        return _lessons_query(year_id)
    if kind == "fiche":
        return _derivative_query(Fiche, year_id)
    if kind == "mindmap":
        return _derivative_query(Mindmap, year_id)
    if kind == "capsule":
        return _capsules_query(year_id)
    if kind == "chapter":
        return _chapters_query(year_id)
    if kind == "diagnostic":
        return _diagnostics_query(year_id)
    raise ValueError(f"famille de relecture inconnue : {kind}")


def _row_to_item(kind: str, row) -> dict:
    """Une ligne brute → un item. Les dix colonnes sont les mêmes pour les cinq familles."""
    values = dict(zip(_COLUMNS, row))
    return {
        "kind": kind,
        "id": values["oid"],
        "title": values["otitle"],
        "subject_id": values["subject_id"],
        "subject": values["subject_name"],
        "subject_slug": values["subject_slug"],
        "chapter_id": values["chapter_id"],
        "chapter": values["chapter_name"],
        "lesson_id": values["lesson_id"],
        "lesson": values["lesson_title"],
        "created_at": values["created_at"],
    }


# ── Surface publique ────────────────────────────────────────────────────────────


def pending_counts(db: Session, year_id: int | None) -> dict[str, int]:
    """Compte par famille — **la même source que la file**, pas une seconde lecture.

    Chaque compte est un `COUNT(*)` sur la requête que `build_queue` sert : ajouter un prédicat
    d'un côté le déplace mécaniquement de l'autre. C'est ce qui rend
    `test_la_file_et_l_inbox_comptent_la_MEME_chose` difficile à casser par inadvertance.
    """
    if year_id is None:
        return {kind: 0 for kind in KINDS}
    return {
        kind: db.scalar(select(func.count()).select_from(_family_query(kind, year_id).subquery()))
        or 0
        for kind in KINDS
    }


def build_queue(
    db: Session,
    *,
    year_id: int | None,
    subject_id: int | None = None,
    kind: str | None = None,
) -> dict:
    """La file complète : compteurs, matières présentes, et les items filtrés.

    🔴 **`counts` et `subjects` ignorent les filtres**, toujours (ADR-0039 §4). Leçon déjà payée
    deux fois dans ce dépôt — `coverageFilters.ts::filterCounts` et le piège `allSubjects` de
    `CouverturePage` : des pastilles qui s'effondrent au premier clic obligent à repasser par
    « Tout » pour changer d'avis.

    **Aucun tri réglable, aucune pagination** (§7). L'ordre est celui du curriculum : Papa relit
    dans l'ordre où Massimo rencontrera le contenu. Au-delà de ~500 items, ce n'est plus un
    problème de pagination — c'est le signal que quelque chose produit sans que Papa l'ait demandé.
    """
    counts = pending_counts(db, year_id)
    counts["total"] = sum(counts[k] for k in KINDS)

    items: list[dict] = []
    if year_id is not None:
        for family in KINDS:
            for row in db.execute(_family_query(family, year_id)):
                items.append(_row_to_item(family, row))

    # Les matières présentes se lisent sur la file ENTIÈRE, avant tout filtre.
    subjects: dict[int, dict] = {}
    for item in items:
        subject_key = item["subject_id"]
        if subject_key is not None and subject_key not in subjects:
            subjects[subject_key] = {
                "id": subject_key,
                "name": item["subject"] or "Matière",
                "slug": item["subject_slug"] or "",
            }

    visible = [
        item
        for item in items
        if (kind is None or item["kind"] == kind)
        and (subject_id is None or item["subject_id"] == subject_id)
    ]
    # Ordre du curriculum. `KINDS.index` d'abord : les familles ne s'entrelacent jamais.
    visible.sort(
        key=lambda item: (
            KINDS.index(item["kind"]),
            item["subject"] or "",
            item["chapter"] or "",
            item["title"] or "",
            item["id"],
        )
    )

    return {
        "counts": counts,
        "subjects": sorted(subjects.values(), key=lambda s: s["name"]),
        "items": visible,
    }
