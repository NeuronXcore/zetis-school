"""Journal de production (ADR-0034) — ce que ZETIS a fait, et ce qui est encore rétractable.

Deux services en un fichier, parce qu'ils répondent à la même question sous deux angles :

- **le flux** : quand · quoi · notion · produit par · validé par · demandé par ;
- **la consommation** : Massimo a-t-il ouvert cette pièce ? C'est elle qui dit si le veto est
  encore exerçable, et elle seule (§G.3 : la consommation ferme la fenêtre, pas l'horloge).

## Portée v1 : ce qui vient d'un LOT — et la page le dit

`production_run_id IS NOT NULL`. ⚠️ Le Conseil de classe (ADR-0021) et la composition champion
(ADR-0022) appellent `equip_notion` **hors lot** : leurs pièces portent `production_run_id = NULL`
et n'apparaissent pas ici. Elles n'ont pas besoin de veto — Papa a cliqué pour elles, leur autorité
est `parent_bulk`. **Mais le silence sur elles ne doit pas se lire comme « rien d'autre n'a été
produit »** : la page l'écrit. Un journal qui paraît exhaustif sans l'être est pire qu'un journal
qui borne son sujet.

## La consommation se résout PAR FAMILLE, jamais par pièce

Cinq familles, cinq requêtes, quel que soit le nombre de pièces affichées. Résoudre pièce par pièce
ferait N requêtes pour une page qui en liste N — le motif qui a tué le sondage de l'en-tête Papa le
2026-08-02.
"""

from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    Fiche,
    FicheView,
    Lesson,
    LessonView,
    Mindmap,
    MindmapView,
    ProductionEvent,
    ProductionRun,
    Quiz,
    QuizAttempt,
    Skill,
    SpacedReviewAttempt,
    SpacedReviewCard,
)
from app.modules.production import journal_filters, runs

# Les cinq familles vetoables, et ce qui les rend « consommées ».
#
# ⚠️ Le §G.3 n'en énumérait que QUATRE — il oubliait le COURS, alors que c'est la classe (A1) dont
# le palier 3 justifie tout le chantier. `lesson_views` comble ce trou (ADR-0034 §4).
KINDS = ("cours", "fiche", "mindmap", "quiz", "srs")


def _ids(rows: Iterable) -> list[int]:
    return [r for r in rows if r is not None]


def _consumed_sets(db: Session, buckets: dict[str, list[int]]) -> dict[str, set[int]]:
    """Une requête par famille. Renvoie, pour chaque famille, les ids déjà consommés.

    Les `IN ()` vides sont sautés : PostgreSQL les accepte, mais une requête qui ne peut rien
    ramener n'a pas à partir.
    """
    out: dict[str, set[int]] = {k: set() for k in KINDS}

    if buckets["cours"]:
        out["cours"] = set(
            db.scalars(
                select(LessonView.lesson_id).where(LessonView.lesson_id.in_(buckets["cours"]))
            ).all()
        )
    if buckets["fiche"]:
        out["fiche"] = set(
            db.scalars(
                select(FicheView.fiche_id).where(FicheView.fiche_id.in_(buckets["fiche"]))
            ).all()
        )
    if buckets["mindmap"]:
        out["mindmap"] = set(
            db.scalars(
                select(MindmapView.mindmap_id).where(
                    MindmapView.mindmap_id.in_(buckets["mindmap"])
                )
            ).all()
        )
    if buckets["quiz"]:
        out["quiz"] = set(
            db.scalars(
                select(QuizAttempt.quiz_id).where(QuizAttempt.quiz_id.in_(buckets["quiz"]))
            ).all()
        )
    if buckets["srs"]:
        # Une carte est consommée dès sa PREMIÈRE révision (§G.3) : `SpacedReviewAttempt` existe.
        out["srs"] = set(
            db.scalars(
                select(SpacedReviewAttempt.card_id).where(
                    SpacedReviewAttempt.card_id.in_(buckets["srs"])
                )
            ).all()
        )
    return out


def _lesson_titles(db: Session, lesson_ids: set[int]) -> dict[int, str]:
    """Les titres des leçons concernées — UNE requête, pas une par pièce."""
    if not lesson_ids:
        return {}
    return {
        row.id: row.title
        for row in db.scalars(select(Lesson).where(Lesson.id.in_(lesson_ids))).all()
    }


def _pieces_of_run(db: Session, run_id: int) -> list[dict]:
    """Les pièces réellement produites par ce lot, tamponnées par le filigrane (ADR-0031).

    ⚠️ **`Fiche` et `Mindmap` n'ont AUCUNE colonne `title`** — vérifié en base le 2026-08-03,
    après avoir vu le Journal afficher « fiche #18 ». Elles sont **leçon-centrées** par
    construction (ADR-0015/0016 : une fiche = une leçon = une page), donc leur identité est celle
    de leur leçon. `Quiz` en a un, `Lesson` aussi. Une pièce nommée par son id ne se lit pas :
    Papa doit reconnaître ce qu'il retire.
    """
    pieces: list[dict] = []

    lessons = db.scalars(
        select(Lesson).where(Lesson.production_run_id == run_id).order_by(Lesson.id)
    ).all()
    for row in lessons:
        pieces.append(
            {
                "kind": "cours",
                "id": row.id,
                "label": row.title,
                "validated_by": row.validated_by,
                "skill_id": None,
                # ⚠️ Interne : sert à rattacher une LIGNE d'événement à SA pièce (`_piece_ids`).
                # `JournalPieceOut` ne le déclare pas, donc il ne sort pas de l'API — les quatre
                # dérivés sont leçon-centrés, et `skill_id` y vaut `None` par construction.
                "lesson_id": row.id,
            }
        )

    # Les deux dérivés leçon-centrés : leur libellé EST celui de leur leçon.
    derived = {
        "fiche": db.scalars(
            select(Fiche).where(Fiche.production_run_id == run_id).order_by(Fiche.id)
        ).all(),
        "mindmap": db.scalars(
            select(Mindmap).where(Mindmap.production_run_id == run_id).order_by(Mindmap.id)
        ).all(),
    }
    titles = _lesson_titles(
        db, {row.lesson_id for rows in derived.values() for row in rows if row.lesson_id}
    )
    for kind, rows in derived.items():
        for row in rows:
            pieces.append(
                {
                    "kind": kind,
                    "id": row.id,
                    "label": titles.get(row.lesson_id) or f"Leçon #{row.lesson_id}",
                    "validated_by": row.validated_by,
                    "skill_id": None,
                    "lesson_id": row.lesson_id,
                }
            )

    for row in db.scalars(
        select(Quiz).where(Quiz.production_run_id == run_id).order_by(Quiz.id)
    ).all():
        pieces.append(
            {
                "kind": "quiz",
                "id": row.id,
                "label": row.title,
                "validated_by": row.validated_by,
                "skill_id": None,
                "lesson_id": row.lesson_id,
            }
        )

    # Les cartes SRS portent un `skill_id` : elles se rattachent à la notion, pas à la leçon.
    for card in db.scalars(
        select(SpacedReviewCard)
        .where(SpacedReviewCard.production_run_id == run_id)
        .order_by(SpacedReviewCard.id)
    ).all():
        pieces.append(
            {
                "kind": "srs",
                "id": card.id,
                "label": card.front_markdown[:80],
                # `spaced_review_cards` n'a NI `validation_status` NI `validated_by` — constat de
                # code, pas un oubli : c'est la raison pour laquelle A0b est verrouillée au palier
                # 3 (ADR-0032, décision active n°5). `None` se lit « aucune étape de validation
                # n'existe », jamais « non validé ».
                "validated_by": None,
                "skill_id": card.skill_id,
            }
        )
    return pieces


def _decorate_consumption(db: Session, pieces: list[dict]) -> None:
    """Pose `consumed` sur chaque pièce — cinq requêtes, sur place."""
    buckets: dict[str, list[int]] = {k: [] for k in KINDS}
    for p in pieces:
        buckets[p["kind"]].append(p["id"])
    consumed = _consumed_sets(db, buckets)
    for p in pieces:
        p["consumed"] = p["id"] in consumed[p["kind"]]


def notion_targets(db: Session, skill_ids: set[int]) -> dict[int, dict]:
    """Où mène une notion : `{skill_id: {lesson_id, chapter_id, subject_id}}`.

    Sert les DEUX sens d'une ligne de journal — celle qui reste à débloquer, et celle qui a produit
    quelque chose à voir. La destination finale diffère (le référentiel dans un cas, la page de
    pilotage du dérivé dans l'autre), mais la question posée à la base est la même : **de quelle
    leçon, de quel chapitre, de quelle matière parle-t-on ?**

    ⚠️ **La résolution est SERVEUR, et ce n'est pas un choix de commodité.** « Quelle est la leçon
    de cette notion » a UNE réponse dans le dépôt — `lessons_of_skill` (ADR-0037), qui a coûté un
    ADR entier parce que trois modules répondaient différemment. Laisser le front la deviner à
    partir d'un `skill_id` en referait une quatrième.

    ⚠️ **Groupé pour toute la page** : un aller-retour par ligne bloquée referait le mal du
    2026-08-02. Deux requêtes au total, quel que soit le nombre de lignes.

    Une notion sans leçon n'entre pas dans le résultat — il n'y a **rien à ouvrir**, et c'est
    précisément ce que son motif dit déjà (« Aucune leçon rattachée »). Un lien qui mènerait
    quelque part malgré tout serait pire que pas de lien.
    """
    from app.db.models import Chapter, SchoolYearSubject
    from app.modules.lesson_resolution import lessons_by_skill

    if not skill_ids:
        return {}
    par_notion = lessons_by_skill(db, list(skill_ids))
    lecons = {
        skill_id: lst[0] for skill_id, lst in par_notion.items() if lst
    }
    if not lecons:
        return {}

    par_lecon = lesson_targets(db, {l.id: l.chapter_id for l in lecons.values()})
    return {
        skill_id: par_lecon[lecon.id]
        for skill_id, lecon in lecons.items()
        if lecon.id in par_lecon
    }


def lesson_targets(db: Session, chapitre_par_lecon: dict[int, int]) -> dict[int, dict]:
    """`lesson_id` → `{lesson_id, chapter_id, subject_id}`, pour un lot de leçons.

    ⚠️ Sortie de `notion_targets` pour servir aussi les PIÈCES, qui ne portent pas de notion : les
    quatre familles leçon-centrées ont `skill_id = None` par construction. Une seconde résolution
    « qui donnerait le même résultat » aurait divergé au premier changement de jointure.

    Le chapitre porte le `school_year_subject_id` ; la page Programme, elle, se lie par
    `subject_id` — « un identifiant de jointure n'a pas à voyager » (convention `pilotageLinks`).
    """
    from app.db.models import Chapter, SchoolYearSubject

    if not chapitre_par_lecon:
        return {}
    chapitres = {
        c.id: c
        for c in db.scalars(
            select(Chapter).where(Chapter.id.in_(set(chapitre_par_lecon.values())))
        ).all()
    }
    matieres = dict(
        db.execute(
            select(SchoolYearSubject.id, SchoolYearSubject.subject_id).where(
                SchoolYearSubject.id.in_({c.school_year_subject_id for c in chapitres.values()})
            )
        ).all()
    )
    cibles: dict[int, dict] = {}
    for lesson_id, chapter_id in chapitre_par_lecon.items():
        chapitre = chapitres.get(chapter_id)
        if chapitre is None:
            continue
        cibles[lesson_id] = {
            "lesson_id": lesson_id,
            "chapter_id": chapitre.id,
            "subject_id": matieres.get(chapitre.school_year_subject_id),
        }
    return cibles


def causes_resolues(db: Session, skill_ids: set[int]) -> set[int]:
    """Parmi ces notions bloquées, lesquelles ne le seraient PLUS si un lot partait maintenant ?

    ## Pourquoi une annotation au présent, et pas une réécriture

    Le lot #23 du 2026-08-04 a été bloqué à 15:18:58 par un cours inexistant ; le cours a été écrit
    à 15:20:51 et validé à 15:35:33. Sa ligne — « non produit, cours jamais rédigé » — reste
    **exacte**, et le §F.4 interdit de la corriger après coup : une ligne qui changerait ferait
    perdre la raison pour laquelle le lot n'avait rien produit.

    Mais elle se lit comme un problème **actuel**. D'où cette lecture séparée : le motif d'origine
    dit ce qui s'est passé, l'annotation dit où on en est. Deux temps, deux phrases, aucune
    n'écrase l'autre.

    ⚠️ **Rien n'est stocké** — même forme que `stale` (ADR-0034 §2) et que `target` : une lecture.
    Rejouer l'histoire en base, c'est la perdre.

    ⚠️ **Résolu = plus AUCUN blocage**, pas « le motif d'origine a disparu ». Une notion passée de
    « cours jamais rédigé » à « cours à valider » a bien changé de cause — et un lot n'y produirait
    toujours rien. Annoncer « résolu » ferait renoncer Papa au geste qui reste à faire.

    ⚠️ **Sous le palier D'AUJOURD'HUI**, et c'est volontaire : la question posée est « un lot lancé
    maintenant passerait-il ? ». C'est l'inverse de `zetis_mode`, qui dit sous quel régime le lot a
    tourné à l'époque. Les deux cohabitent sur la même ligne sans se contredire — l'un est au
    passé, l'autre au présent.
    """
    from app.modules.production.runner import blockers_for
    from app.modules.settings import service as settings_service

    if not skill_ids:
        return set()
    motifs = blockers_for(
        db,
        list(skill_ids),
        require_validated_course=settings_service.course_gate_enabled(db),
    )
    return {skill_id for skill_id, motif in motifs.items() if motif is None}


def _piece_ids(pieces: list[dict]) -> dict[tuple[int, str], int]:
    """Clé de rattachement d'une ligne d'événement à SA pièce → id de la pièce.

    ⚠️ **Deux clés, et ce n'est pas une complication gratuite** : quatre des cinq familles sont
    **leçon-centrées** (`skill_id` y vaut `None` par construction, cf. `_pieces_of_run`), seules les
    cartes SRS portent une notion. Rattacher tout le monde par `skill_id` rendait `None` partout —
    trouvé en écrivant le test, pas après.

    Le PREMIER gagne : deux pièces du même type sur la même leçon sont indiscernables depuis une
    ligne de journal, et en désigner une vaut mieux que n'en désigner aucune.
    """
    index: dict[tuple[int, str], int] = {}
    for p in pieces:
        cle = (p["skill_id"], "srs") if p["kind"] == "srs" else (p.get("lesson_id"), p["kind"])
        if cle[0] is not None and cle not in index:
            index[cle] = p["id"]
    return index


def _events_of_run(
    db: Session,
    run_id: int,
    names: dict[int, str],
    cibles: dict[int, dict],
    resolues: set[int],
    pieces: list[dict],
) -> list[dict]:
    """Le détail par pièce, dans l'ordre de production."""
    rows = db.scalars(
        select(ProductionEvent)
        .where(ProductionEvent.run_id == run_id)
        .order_by(ProductionEvent.created_at, ProductionEvent.id)
    ).all()
    ids = _piece_ids(pieces)

    def cible(e) -> dict | None:
        """Où mène CETTE ligne — deux sens, une seule forme.

        ⚠️ **Élargi le 2026-08-04 aux lignes PRODUITES.** La version d'avant ne portait une
        destination que sur `blocked` : *« un lien sur produit mènerait à une leçon qui va très
        bien »*. C'était vrai de la destination d'alors — le référentiel, pour écrire le cours. Ce
        n'est plus le motif : sur une ligne produite, on ne va pas réparer la leçon, on va **voir
        la pièce**. Deux sens de lecture, deux destinations, et c'est le `piece` de la ligne qui
        décide laquelle (côté écran, via `producedLink`).

        ⚠️ **`error` reste sans destination** : elle désignerait la mauvaise cause. Une erreur se
        lit dans son message, elle ne s'ouvre pas.

        ⚠️ **`skipped` non plus.** « Déjà présent » veut dire que ce lot n'a rien produit — la pièce
        existe, mais elle appartient à un autre moment. La rattacher ici ferait croire que ce
        lot-là l'a faite.
        """
        if e.skill_id is None:
            return None
        base = cibles.get(e.skill_id)
        if base is None:
            return None
        if e.outcome == "blocked":
            return {**base, "object_id": None}
        if e.outcome == "generated" and e.piece:
            cle = (e.skill_id, "srs") if e.piece == "srs" else (base["lesson_id"], e.piece)
            return {**base, "object_id": ids.get(cle)}
        return None

    return [
        {
            "skill_id": e.skill_id,
            "skill_name": names.get(e.skill_id) if e.skill_id else None,
            "piece": e.piece,
            "outcome": e.outcome,
            "detail": e.detail,
            "created_at": e.created_at,
            "target": cible(e),
            # `None` hors d'une ligne bloquée : « ni résolu ni non résolu » — la question ne se
            # pose pas. Un `False` par défaut se lirait « toujours bloqué » sur une pièce produite.
            "resolved": (
                e.skill_id in resolues if e.outcome == "blocked" and e.skill_id else None
            ),
        }
        for e in rows
    ]


def run_status(run: ProductionRun, *, now: datetime | None = None) -> str:
    """Le statut RENDU — `stale` est une lecture, jamais une valeur stockée (ADR-0034 §2)."""
    return "stale" if runs.is_stale(run, now=now) else run.status


def lot_evidence(db: Session, run_ids: list[int]) -> dict[int, dict]:
    """Ce que chaque lot a LAISSÉ — la seule trace de son régime quand il n'a pas été capturé.

    Trois faits par lot, tous groupés (trois requêtes pour la page entière, jamais une par lot) :

    - `a_ecrit_cours` — une `Lesson` porte son `production_run_id`. Le tamponnage n'a lieu que
      lorsque `equip_*` a **rédigé** le texte, donc que le gate du §7 était tombé ;
    - `derives_servis` / `derives_a_relire` — les fiches et cartes mentales que CE lot a produites,
      selon qu'il les a validées d'office ou laissées en attente. C'est `authority_for` qui écrit
      cette différence, et elle ne dépend que d'A0a ;
    - `bloque_sur_cours` — le lot a écarté une notion faute de cours utilisable.

    ⚠️ **Fiches et cartes mentales seulement.** Les quiz et les cartes SRS n'ont **aucun**
    `validation_status` (constat de code, cf. `_PENDING_TABLES` et le verrou A0b) : un lot qui n'a
    produit que ça ne dit rien de son régime, et il faut l'assumer plutôt que de deviner.
    """
    if not run_ids:
        return {}
    fait: dict[int, dict] = {
        rid: {
            "a_ecrit_cours": False,
            "derives_servis": False,
            "derives_a_relire": False,
            "bloque_sur_cours": False,
        }
        for rid in run_ids
    }
    for rid in db.scalars(
        select(Lesson.production_run_id).where(Lesson.production_run_id.in_(run_ids))
    ).all():
        fait[rid]["a_ecrit_cours"] = True

    for model in (Fiche, Mindmap):
        for rid, validated_by in db.execute(
            select(model.production_run_id, model.validated_by).where(
                model.production_run_id.in_(run_ids)
            )
        ).all():
            cle = "derives_servis" if validated_by else "derives_a_relire"
            fait[rid][cle] = True

    for rid, detail in db.execute(
        select(ProductionEvent.run_id, ProductionEvent.detail).where(
            ProductionEvent.run_id.in_(run_ids), ProductionEvent.outcome == "blocked"
        )
    ).all():
        if detail and detail.lower().startswith("cours"):
            fait[rid]["bloque_sur_cours"] = True
    return fait


def deduire_regime(trigger: str, preuves: dict) -> str | None:
    """Le régime qu'un lot a FORCÉMENT eu, d'après ce qu'il a fait. `None` si rien ne le prouve.

    ## Pourquoi c'est une déduction et pas une devinette

    Relire les réglages d'aujourd'hui pour expliquer un lot d'hier est interdit (§1) : ils ont pu
    changer. Mais **ce que le lot a laissé derrière lui n'a pas changé** — un cours écrit par ZETIS
    reste un cours écrit par ZETIS. On ne consulte donc aucun réglage : on lit des actes.

    | Preuve | Ce qu'elle force | Régime |
    |---|---|---|
    | `trigger = request` | le scan n'émet cette origine que sous ***Autonome*** (ADR-0036 §1) | `autonome` |
    | le lot a **rédigé un cours** | le gate du §7 était tombé → A1 = 3, donc A0a = 3 par monotonie | `autonome` |
    | un dérivé laissé **à relire** | A0a = 2 — et A1 = 3 forcerait A0a = 3, donc A1 = 2 | `manuel` |
    | un dérivé **servi** + une notion écartée faute de cours | A0a = 3 et A1 < 3 | `semi` |

    ⚠️ **L'ordre des règles est celui de la certitude**, pas de la commodité. `trigger=request` est
    la plus forte : elle est vraie par construction du déclencheur, sans regarder aucun artefact.

    ⚠️ **Le dernier cas RESTE inconnu, et c'est voulu** : un lot qui a servi ses dérivés sans jamais
    croiser un cours manquant ne dit rien d'A1 — *Semi* et *Autonome* y sont indiscernables. Rendre
    l'un des deux au hasard serait exactement le mensonge que tout ceci évite. On ne sait pas, on le
    dit.
    """
    if trigger == "request":
        return "autonome"
    if preuves.get("a_ecrit_cours"):
        return "autonome"
    if preuves.get("derives_a_relire"):
        return "manuel"
    if preuves.get("derives_servis") and preuves.get("bloque_sur_cours"):
        return "semi"
    return None


def zetis_mode(run: ProductionRun) -> str | None:
    """Le régime sous lequel CE lot a tourné — lu sur le lot, jamais dans les réglages.

    Trois réponses, et les trois disent quelque chose de différent :

    - `"manuel" | "semi" | "autonome"` — un régime nommé ;
    - `"sur_mesure"` — des paliers qui ne composent aucun préréglage. `niveau_de` rend déjà `None`
      pour ce cas ; on le NOMME ici, sans quoi il se confondrait avec le suivant ;
    - `None` — **non enregistré** : ni capturé, ni prouvé par les actes du lot au moment de la
      reprise. Aucune rétro-attribution : les réglages d'aujourd'hui ne disent rien de ceux d'hier
      (doctrine §F.4).

    ⚠️ **`niveau_de` est appelée, jamais réimplémentée.** Comparer les paliers à la main ici
    donnerait le même résultat aujourd'hui et divergerait le jour où un régime serait ajouté à
    `NIVEAUX` — le défaut exact de l'ADR-0037, où trois modules répondaient différemment à une
    même question.

    ⚠️ **Ne déduit plus rien** (addendum « tri et filtre » §5). La déduction est passée du chemin
    de LECTURE au script de reprise : elle lisait des artefacts que le veto peut retirer —
    `veto._delete_one` supprime la ligne `Lesson` d'un cours retiré, et la preuve « ce lot a rédigé
    un cours » partait avec elle. Le régime affiché d'un lot d'hier changeait donc quand Papa
    exerçait un droit prévu. Ici, on lit deux entiers.
    """
    from app.modules.settings.service import A0A, A1, niveau_de

    if run.a1_level is None or run.a0a_level is None:
        return None
    return niveau_de({A0A: run.a0a_level, A1: run.a1_level}) or "sur_mesure"


def list_journal(
    db: Session,
    *,
    limit: int = 20,
    offset: int = 0,
    filtre: journal_filters.JournalFiltre | None = None,
    now: datetime | None = None,
) -> dict:
    """Le flux, du lot le plus récent au plus ancien — filtré et trié SERVEUR.

    Pagination explicite : un journal qui grossit sans borne finit par charger toute l'histoire
    du dispositif à chaque ouverture de page.

    ⚠️ **`WHERE` puis `ORDER BY` puis `LIMIT`, dans cet ordre** (addendum « tri et filtre » §2).
    Filtrer les lots déjà chargés répondrait « rien en maths » alors que les lots de maths sont
    page 4 — un défaut qui ne ressemble pas à un défaut. `total` et `has_more` portent donc tous
    deux sur l'ensemble **filtré**.
    """
    filtre = filtre or journal_filters.JournalFiltre()
    maintenant = now or datetime.now(timezone.utc)
    total = journal_filters.compter(db, filtre, maintenant=maintenant)
    rows = db.scalars(
        journal_filters.selectionner(db, filtre, maintenant=maintenant).limit(limit).offset(offset)
    ).all()

    # UN seul aller-retour pour tous les noms de notions de la page — jamais un par événement.
    run_ids = [r.id for r in rows]
    skill_ids: set[int] = {r.current_skill_id for r in rows if r.current_skill_id}
    # ⚠️ Le scope d'un lot-pièce doit y entrer AUSSI : un lot encore en file n'a ni notion courante
    # ni événement, donc son nom ne viendrait de nulle part et la page afficherait un id nu.
    skill_ids.update(r.scope_skill_id for r in rows if r.scope_skill_id)
    if run_ids:
        skill_ids.update(
            _ids(
                db.scalars(
                    select(ProductionEvent.skill_id).where(
                        ProductionEvent.run_id.in_(run_ids)
                    )
                ).all()
            )
        )
    names: dict[int, str] = {}
    if skill_ids:
        names = {
            s.id: s.name
            for s in db.scalars(select(Skill).where(Skill.id.in_(skill_ids))).all()
        }

    # Où mène chaque ligne — résolu une fois pour toute la page (voir `notion_targets`). Toutes les
    # notions de la page, pas seulement les bloquées : une ligne produite mène désormais à SA pièce.
    cibles = notion_targets(db, skill_ids)

    # Le PRÉSENT des seules notions BLOQUÉES — une passe de plus sur un petit ensemble, jamais une
    # requête par ligne. Le motif d'origine reste intact ; ceci s'ajoute à côté.
    #
    # ⚠️ Restreint aux bloquées **exprès** : `resolved` n'a de sens que là. Le calculer pour tout le
    # monde coûterait plus et ferait croire que la question se pose ailleurs.
    bloquees: set[int] = set()
    if run_ids:
        bloquees = set(
            _ids(
                db.scalars(
                    select(ProductionEvent.skill_id).where(
                        ProductionEvent.run_id.in_(run_ids),
                        ProductionEvent.outcome == "blocked",
                    )
                ).all()
            )
        )
    resolues = causes_resolues(db, bloquees)

    # ⚠️ **`lot_evidence` n'est PLUS appelée ici** — trois requêtes de moins par page. Elle et
    # `deduire_regime` n'ont pas disparu : elles sont devenues les fonctions du script de reprise
    # (`scripts/backfill_zetis_mode.py`), qui les exécute une fois. Les lire à chaque affichage
    # faisait dépendre l'histoire d'artefacts rétractables et d'un motif d'écran.

    out_runs = []
    for run in rows:
        pieces = _pieces_of_run(db, run.id)
        _decorate_consumption(db, pieces)
        # ⚠️ **La liste des pièces est TOUJOURS visible, elle ; le détail est dans un repli.** Elle
        # n'offrait pourtant aucun lien — dit à l'écran le 2026-08-04 (« les liens cibles ne sont
        # pas mis en place »). Papa voyait « Fiche — Calculs avec priorités » sans pouvoir l'ouvrir.
        # Une requête de plus PAR LOT — même grain que `_pieces_of_run` et `_decorate_consumption`
        # juste au-dessus, qui interrogent déjà cinq tables par lot. Le grain de la page, lui, reste
        # borné par `limit`.
        lecons_des_pieces = {p["lesson_id"] for p in pieces if p.get("lesson_id")}
        par_lecon = lesson_targets(
            db,
            dict(
                db.execute(
                    select(Lesson.id, Lesson.chapter_id).where(Lesson.id.in_(lecons_des_pieces))
                ).all()
            )
            if lecons_des_pieces
            else {},
        )
        for p in pieces:
            p["skill_name"] = names.get(p["skill_id"]) if p["skill_id"] else None
            base = par_lecon.get(p.get("lesson_id")) or (
                cibles.get(p["skill_id"]) if p["skill_id"] else None
            )
            p["target"] = {**base, "object_id": p["id"]} if base else None
        out_runs.append(
            {
                "id": run.id,
                "status": run_status(run),
                "trigger": run.trigger,
                "authorized_by": run.authorized_by,
                # ⚠️ **Le régime de CE lot, pas celui d'aujourd'hui.** C'est lui qui rend le
                # résultat lisible : un lot qui n'a rien produit sous *Manual* n'est pas une panne,
                # c'est un gate qui a fonctionné. Sans ce mot, les deux se ressemblent — et les
                # lots #21/#22 du 2026-08-04 ont été lus comme des échecs.
                # ⚠️ **Une LECTURE, plus une déduction** (addendum « tri et filtre » §5). Le régime
                # et sa provenance sont désormais tous deux sur le lot : `zetis_mode` redérive le
                # NOM depuis les deux paliers (l'ADR-0032 tenue), `zetis_mode_source` dit d'où vient
                # la réponse. La déduction depuis les actes a lieu UNE FOIS, dans le script de
                # reprise — ici, elle rendait un régime qui changeait quand le veto retirait une
                # pièce. La provenance voyage toujours avec la valeur : « déduit » n'est pas
                # « enregistré », et l'écran ne doit pas pouvoir les confondre.
                "zetis_mode": zetis_mode(run),
                "zetis_mode_source": run.zetis_mode_source if zetis_mode(run) else None,
                "chapter_id": run.chapter_id,
                # Un lot-pièce n'a PAS de chapitre (ADR-0036 §2) : sans ces deux champs, il se
                # lirait comme un lot cassé au lieu d'un lot ciblé.
                "scope_skill_id": run.scope_skill_id,
                "scope_kind": run.scope_kind,
                "scope_skill_name": names.get(run.scope_skill_id)
                if run.scope_skill_id
                else None,
                "total_notions": run.total_notions,
                "done_notions": run.done_notions,
                "current_skill_id": run.current_skill_id,
                "current_skill_name": names.get(run.current_skill_id)
                if run.current_skill_id
                else None,
                "created_at": run.created_at,
                "started_at": run.started_at,
                "finished_at": run.finished_at,
                "events": _events_of_run(db, run.id, names, cibles, resolues, pieces),
                "pieces": pieces,
            }
        )

    return {
        "runs": out_runs,
        # ⚠️ AUCUN total de provenance, aucun ratio ZETIS/Papa (§F.2 : la provenance est un fait,
        # jamais un reproche — elle s'affiche par objet et ne se totalise pas). Ce compteur-ci est
        # celui des LOTS, pour la pagination, et rien d'autre.
        "has_more": offset + len(rows) < total,
        # ⚠️ Le total de l'ensemble FILTRÉ, pas de l'histoire. « 7 sur 23 » est juste ; « 7 sur 7 »
        # cacherait qu'il existe autre chose, et l'état vide n'aurait plus rien à dire.
        "total": total,
    }
