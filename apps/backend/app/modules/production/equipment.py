"""Équipement pédagogique d'une notion (ADR-0021) — module NEUTRE (ADR-0031 §1).

Déplacé de `reports/service.py` le 2026-08-02, **sans un changement de comportement** : l'ADR-0023
§1 l'avait décidé le 2026-07-28 et l'extraction n'avait jamais eu lieu. Un service à plusieurs
consommateurs ne vit pas chez l'un d'eux (patron ADR-0011 §1) — il vivait chez le Conseil de
classe, qui n'en est qu'un appelant sur trois.

Appelants réels aujourd'hui : le Conseil de classe (`reports/router.py`) et la composition champion
(`missions/champion.py`). Le troisième annoncé par l'ADR-0023 — la Couverture — n'existe pas encore
et arrivera avec la production en lot.

Les imports des générateurs restent PARESSEUX, mais leur motif a changé et il faut le dire : ce
n'est plus « éviter un cycle avec `reports` » (vérifié : aucun générateur n'importe `production`),
c'est éviter de charger cinq modules de génération — et leurs providers — à l'import de
`production`, que la Couverture importe pour une page de LECTURE.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    Fiche,
    Lesson,
    LessonSkill,
    Mindmap,
    Quiz,
    Skill,
    SpacedReviewCard,
)
from app.modules.ai.provider import EmbeddingProvider, LLMProvider
from app.modules.lesson_resolution import lessons_of_skill
from app.modules.provenance import PARENT_BULK, ValidatedBy


# --- Équipement pédagogique d'une notion (ADR-0021) ----------------------------------------
#
# « Créer ces missions » génère, avant la mission, le KIT complet d'une notion (cours → fiche →
# SRS → quiz → mindmap) et l'AUTO-VALIDE (la popup de confirmation Papa vaut approbation — soupape
# §5ter bornée à ce geste). Orchestration pure des générateurs existants ; try/except par pièce ;
# **on ne régénère JAMAIS une pièce déjà créée** (même un brouillon `pending` de Papa) — on génère
# seulement ce qui manque, et on valide l'existant `pending` pour le rendre utilisable ; dégradation
# gracieuse leçon-centrée (notion sans leçon canonique → contenus sautés + signalés). Équiper AVANT
# de créer : les étapes de la mission
# résolvent alors les ressources fraîches.

_EQUIP_QUIZ_COUNT = 5
_EQUIP_QUIZ_DIFFICULTY = 2


def _skill_lesson(db: Session, skill_id: int) -> Lesson | None:
    """Leçon de la notion, ou `None`. **Délègue au résolveur partagé** (ADR-0037).

    ⚠️ La règle a changé le 2026-08-03, et il faut dire laquelle : c'était « la dernière CRÉÉE »
    (`id DESC`), sans aucun filtre d'année ; c'est désormais « la dernière TOUCHÉE », dans
    l'année active. Motif : la galaxie retenait déjà celle-là, et c'est elle qui décide de ce que
    Massimo atteint — équiper une autre leçon produisait du contenu que personne ne pouvait ouvrir.

    Le gate propre à la production **reste ici** : on accepte un BROUILLON, parce qu'au palier 3
    `equip_notion` a précisément le droit de rédiger puis de valider son cours. Filtrer sur
    `validated` comme la galaxie supprimerait ce palier.
    """
    lecons = lessons_of_skill(db, skill_id)
    return lecons[0] if lecons else None


# Existence = « déjà créé » (tout statut, y compris un brouillon de Papa) : on ne régénère JAMAIS,
# on génère uniquement ce qui manque (ADR-0021). On récupère l'entité pour la valider si besoin.
def _existing_fiche(db: Session, lesson_id: int) -> Fiche | None:
    return db.scalar(
        select(Fiche).where(Fiche.lesson_id == lesson_id).order_by(Fiche.id.desc()).limit(1)
    )


def _existing_mindmap(db: Session, lesson_id: int) -> Mindmap | None:
    return db.scalar(
        select(Mindmap).where(Mindmap.lesson_id == lesson_id).order_by(Mindmap.id.desc()).limit(1)
    )


def _has_mission_quiz(db: Session, skill_id: int) -> bool:
    """Un quiz de mission existe déjà pour la notion (tout statut) — pas de régénération."""
    return bool(
        db.scalar(
            select(Quiz.id)
            .join(LessonSkill, LessonSkill.lesson_id == Quiz.lesson_id)
            .where(Quiz.quiz_type == "mission", LessonSkill.skill_id == skill_id)
        )
    )


def _has_srs_cards(db: Session, skill_id: int) -> bool:
    """Des cartes SRS existent déjà pour la notion — `generate_cards_for_skill` rappellerait le LLM."""
    return bool(db.scalar(select(SpacedReviewCard.id).where(SpacedReviewCard.skill_id == skill_id)))


def piece_deja_produite(db: Session, *, skill_id: int, kind: str, peut_valider: bool) -> str | None:
    """Un lot-pièce sur ce scope ne produirait-il RIEN ? Rend le motif à dire, ou `None`.

    ## Pourquoi cette question doit exister (2026-08-05)

    Le lot #28, lancé pour vérifier un correctif, a tourné 76 ms et rendu `skipped` : la fiche
    existait déjà. C'est le comportement JUSTE — on ne régénère jamais (ADR-0021) — mais **rien ne
    l'avait dit avant le clic, et rien ne l'a dit après** : une ligne de plus au Journal, un lot de
    plus dans l'histoire, et Papa qui attend un contenu qu'il possède déjà. Le user a demandé que
    la création en double soit refusée et annoncée.

    ⚠️ **On réutilise les prédicats d'`equip_piece`, on n'en réécrit aucun.** Une seconde lecture
    « qui donne le même résultat » est le défaut que l'ADR-0037 nomme : elle diverge au premier
    générateur ajouté, et l'écran refuserait alors ce que le lot aurait produit — ou l'inverse.

    ⚠️ **« Existe » ne veut pas dire « rien à faire ».** Une fiche `pending` est une fiche
    inexploitable pour Massimo, et `equip_piece` la VALIDE quand le régime le permet : ce lot-là
    produit un vrai changement. `peut_valider` porte cette nuance — il vient d'`authority_for`,
    c'est-à-dire de la même source que le lot. Sans lui, on refuserait le seul geste qui restait
    utile.

    ⚠️ Ne répond que des lots-PIÈCE. Un lot de chapitre saute ses notions déjà équipées une par
    une et produit les autres : le refuser en bloc supprimerait du travail réel.
    """
    lesson = _skill_lesson(db, skill_id)
    if lesson is None:
        return None  # L'absence de leçon est déjà dite par `blockers_for` — un seul motif à la fois.

    if kind == "cours":
        if lesson.content_markdown and lesson.status == "validated":
            return "Le cours de cette notion est déjà écrit et validé."
        return None

    # Les dérivés ont besoin du cours ; sans lui, `blockers_for` a déjà le dernier mot.
    if not (lesson.status == "validated" and lesson.content_markdown):
        return None

    if kind == "fiche":
        existing = _existing_fiche(db, lesson.id)
        if existing is None:
            return None
        if existing.validation_status == "pending" and peut_valider:
            return None  # Le lot la validerait : il a quelque chose à faire.
        return "La fiche de cette notion existe déjà."
    if kind == "mindmap":
        existing = _existing_mindmap(db, lesson.id)
        if existing is None:
            return None
        if existing.validation_status == "pending" and peut_valider:
            return None
        return "La carte mentale de cette notion existe déjà."
    if kind == "srs":
        return "Les cartes de révision de cette notion existent déjà." if _has_srs_cards(db, skill_id) else None
    if kind == "quiz":
        return "Le quiz de cette notion existe déjà." if _has_mission_quiz(db, skill_id) else None
    return None


def equip_notion(
    db: Session,
    *,
    skill_id: int,
    llm: LLMProvider,
    embedder: EmbeddingProvider,
    authority: ValidatedBy | None = PARENT_BULK,
) -> dict:
    """Génère + auto-valide le kit pédagogique d'UNE notion (ADR-0021). Résumé typé, jamais
    d'exception qui remonte : chaque pièce est isolée, l'échec est reporté.

    `authority` (ADR-0032) — **un paramètre, jamais une lecture des réglages**. Un service qui
    irait lire lui-même le palier deviendrait inappelable par ses deux autres consommateurs : le
    Conseil de classe et la composition champion équipent sur un **geste explicite de Papa**, leur
    autorité est `parent_bulk` quel que soit le palier, et elle doit le rester. D'où le défaut par
    défaut : les appelants existants ne changent pas d'un caractère.

    - une valeur → les pièces produites sont validées avec cette provenance ;
    - `None` → **rien n'est auto-validé** ; les dérivés restent `pending` et Papa les relit
      (c'est le palier 2 de la classe A0a).
    """
    # Imports paresseux : évite tout cycle avec les modules générateurs (qui n'importent pas reports).
    from app.modules.curriculum.service import generate_lesson_content, set_lesson_validation
    from app.modules.fiches.service import generate_fiche, validate_fiche
    from app.modules.memory.generation import generate_cards_for_skill
    from app.modules.mindmaps.service import generate_mindmap, validate_mindmap
    from app.modules.quizzes.service import generate_quiz

    skill = db.get(Skill, skill_id)
    name = skill.name if skill is not None else f"notion {skill_id}"
    generated: list[str] = []
    skipped: list[str] = []
    errors: list[dict] = []

    lesson = _skill_lesson(db, skill_id)
    if lesson is None:
        return {
            "skill_id": skill_id,
            "skill_name": name,
            "has_lesson": False,
            "generated": [],
            "skipped": ["cours", "fiche", "srs", "quiz", "mindmap"],
            "errors": [],
            "reason": "Aucune leçon rattachée à cette notion — kit non généré.",
        }
    lesson_id = lesson.id

    # 1) Cours (leçon canonique). Un cours DÉJÀ RÉDIGÉ (manuel Papa ou antérieur) n'est jamais
    #    régénéré — juste validé s'il est encore en brouillon, pour rendre les dérivés possibles.
    # ⚠️ `by=` explicite sur les deux chemins : sans lui, la leçon repartait tamponnée `parent`,
    # c'est-à-dire « relue pièce à pièce par Papa » sur un cours que personne n'a ouvert. Défaut
    # trouvé le 2026-08-02 (ADR-0032, constat n°3) ; `course_authority` ne peut pas être `None`
    # ici, la monotonie interdit A0a=2 avec A1=3.
    course_authority = authority or PARENT_BULK
    try:
        if lesson.content_markdown:
            if lesson.status == "draft":
                # Brouillon existant → validé. C'est une validation EN LOT, jamais une relecture.
                set_lesson_validation(db, lesson_id, "validate", by=course_authority)
            skipped.append("cours")
        else:
            generate_lesson_content(db, llm, lesson_id)  # écrit le contenu, repasse en `draft`
            set_lesson_validation(db, lesson_id, "validate", by=course_authority)
            generated.append("cours")
    except Exception as exc:  # noqa: BLE001 — on isole chaque pièce
        errors.append({"piece": "cours", "message": str(exc)})

    # Sans leçon validée + contenu, aucun dérivé n'est possible (générateurs verrouillés, 409).
    db.refresh(lesson)
    if not (lesson.status == "validated" and lesson.content_markdown):
        skipped.extend(p for p in ("fiche", "srs", "quiz", "mindmap") if p not in skipped)
        return {
            "skill_id": skill_id,
            "skill_name": name,
            "has_lesson": True,
            "generated": generated,
            "skipped": skipped,
            "errors": errors,
            "reason": "Cours indisponible — dérivés non générés.",
        }

    # 2) Fiche — déjà créée (même `pending` de Papa) → jamais régénérée, validée si besoin.
    try:
        existing_fiche = _existing_fiche(db, lesson_id)
        if existing_fiche is not None:
            if existing_fiche.validation_status == "pending" and authority is not None:
                # Valide un brouillon PRÉEXISTANT de Papa : provenance de lot sans exception (§F.4).
                validate_fiche(db, existing_fiche.id, by=authority)
            skipped.append("fiche")
        else:
            fiche = generate_fiche(db, llm, embedder, lesson_id=lesson_id)
            if authority is not None:
                validate_fiche(db, fiche.id, by=authority)
            generated.append("fiche")
    except Exception as exc:  # noqa: BLE001
        errors.append({"piece": "fiche", "message": str(exc)})

    # 3) Cartes SRS — déjà présentes → pas de rappel LLM (`generate_cards_for_skill` régénère).
    try:
        if _has_srs_cards(db, skill_id):
            skipped.append("srs")
        else:
            generate_cards_for_skill(db, llm, embedder, skill_id=skill_id)
            generated.append("srs")
    except Exception as exc:  # noqa: BLE001
        errors.append({"piece": "srs", "message": str(exc)})

    # 4) Quiz de mission — déjà créé pour la notion → pas de régénération.
    try:
        if _has_mission_quiz(db, skill_id):
            skipped.append("quiz")
        else:
            generate_quiz(
                db,
                llm,
                embedder,
                lesson_id=lesson_id,
                count=_EQUIP_QUIZ_COUNT,
                difficulty=_EQUIP_QUIZ_DIFFICULTY,
            )
            generated.append("quiz")
    except Exception as exc:  # noqa: BLE001
        errors.append({"piece": "quiz", "message": str(exc)})

    # 5) Mindmap — déjà créée (même `pending` de Papa) → jamais régénérée, validée si besoin.
    try:
        existing_mindmap = _existing_mindmap(db, lesson_id)
        if existing_mindmap is not None:
            if existing_mindmap.validation_status == "pending" and authority is not None:
                # Idem fiche : brouillon préexistant validé en lot (§F.4).
                validate_mindmap(db, existing_mindmap.id, by=authority)
            skipped.append("mindmap")
        else:
            mindmap = generate_mindmap(db, llm, embedder, lesson_id=lesson_id)
            if authority is not None:
                validate_mindmap(db, mindmap.id, by=authority)
            generated.append("mindmap")
    except Exception as exc:  # noqa: BLE001
        errors.append({"piece": "mindmap", "message": str(exc)})

    return {
        "skill_id": skill_id,
        "skill_name": name,
        "has_lesson": True,
        "generated": generated,
        "skipped": skipped,
        "errors": errors,
        "reason": None,
    }


def equip_piece(
    db: Session,
    *,
    skill_id: int,
    kind: str,
    llm: LLMProvider,
    embedder: EmbeddingProvider,
    authority: ValidatedBy | None = PARENT_BULK,
) -> dict:
    """Produit UNE pièce sur UNE notion (ADR-0036 §2). Même résumé typé qu'`equip_notion`.

    Une fiche demandée → une fiche produite. **Pas le kit, pas le chapitre.**

    ⚠️ **`equip_notion` n'est pas touché**, et cette fonction ne l'appelle pas : l'addendum
    ADR-0031 interdit de modifier l'orchestrateur, dont dépendent le Conseil de classe et la
    composition champion. Le coût est écrit plutôt que masqué : **les appels aux générateurs sont
    donc écrits deux fois**, ici et là-bas. Le jour où la divergence coûtera plus que le risque de
    régression, l'extraction se fera dans son propre chantier, sous contre-épreuve — pas au détour
    d'un ajout de fonctionnalité.

    ## Le COURS est un prérequis, pas du kit

    Quatre des cinq générateurs refusent (409) une leçon non validée : une fiche ne peut donc pas
    se produire seule sur une notion dont le cours n'est pas écrit. Cette fonction reprend
    l'étape 1 d'`equip_notion` — écrire le cours s'il manque, valider le brouillon s'il existe —
    **et rien d'autre** : les quatre autres dérivés ne sont pas produits.

    ⚠️ Cela n'ouvre **aucune porte que le palier ne fermait pas** : le gate du §7 vit dans
    `runner.select_notions`, en amont. Au palier < 3 la notion est bloquée avant d'arriver ici (le
    lot journalise « Cours à valider », rien n'est écrit) ; au palier 3 — le seul où une demande
    déclenche (ADR-0036 §1) — ZETIS a précisément le droit d'écrire un cours, exactement comme un
    lot-chapitre le ferait sur la même notion.
    """
    from app.modules.curriculum.service import generate_lesson_content, set_lesson_validation
    from app.modules.fiches.service import generate_fiche, validate_fiche
    from app.modules.memory.generation import generate_cards_for_skill
    from app.modules.mindmaps.service import generate_mindmap, validate_mindmap
    from app.modules.quizzes.service import generate_quiz

    skill = db.get(Skill, skill_id)
    name = skill.name if skill is not None else f"notion {skill_id}"
    generated: list[str] = []
    skipped: list[str] = []
    errors: list[dict] = []

    def out(*, has_lesson: bool, reason: str | None) -> dict:
        return {
            "skill_id": skill_id,
            "skill_name": name,
            "has_lesson": has_lesson,
            "generated": generated,
            "skipped": skipped,
            "errors": errors,
            "reason": reason,
        }

    lesson = _skill_lesson(db, skill_id)
    if lesson is None:
        # Notion ORPHELINE : aucune leçon ne la porte, donc aucun générateur leçon-centré ne peut
        # la servir. Ce n'est pas une panne, c'est une absence de support — et elle se DIT.
        skipped.append(kind)
        return out(
            has_lesson=False,
            reason="Aucune leçon rattachée à cette notion — rien à produire.",
        )
    lesson_id = lesson.id

    # 1) Le prérequis. Identique à l'étape 1 d'`equip_notion`, `by=` explicite sur les deux chemins.
    course_authority = authority or PARENT_BULK
    try:
        if lesson.content_markdown:
            if lesson.status == "draft":
                set_lesson_validation(db, lesson_id, "validate", by=course_authority)
            if kind == "cours":
                skipped.append("cours")
        else:
            generate_lesson_content(db, llm, lesson_id)
            set_lesson_validation(db, lesson_id, "validate", by=course_authority)
            generated.append("cours")
    except Exception as exc:  # noqa: BLE001 — on isole chaque pièce
        errors.append({"piece": "cours", "message": str(exc)})

    if kind == "cours":
        return out(has_lesson=True, reason=None)

    db.refresh(lesson)
    if not (lesson.status == "validated" and lesson.content_markdown):
        skipped.append(kind)
        return out(has_lesson=True, reason="Cours indisponible — dérivé non généré.")

    # 2) La pièce demandée, et elle seule. Même règle qu'`equip_notion` : **on ne régénère JAMAIS**
    #    ce qui existe (même un brouillon de Papa) — on le valide, ce qui suffit à le rendre
    #    servable, donc à satisfaire la demande.
    try:
        if kind == "fiche":
            existing = _existing_fiche(db, lesson_id)
            if existing is not None:
                if existing.validation_status == "pending" and authority is not None:
                    validate_fiche(db, existing.id, by=authority)
                skipped.append("fiche")
            else:
                fiche = generate_fiche(db, llm, embedder, lesson_id=lesson_id)
                if authority is not None:
                    validate_fiche(db, fiche.id, by=authority)
                generated.append("fiche")
        elif kind == "mindmap":
            existing = _existing_mindmap(db, lesson_id)
            if existing is not None:
                if existing.validation_status == "pending" and authority is not None:
                    validate_mindmap(db, existing.id, by=authority)
                skipped.append("mindmap")
            else:
                mindmap = generate_mindmap(db, llm, embedder, lesson_id=lesson_id)
                if authority is not None:
                    validate_mindmap(db, mindmap.id, by=authority)
                generated.append("mindmap")
        elif kind == "srs":
            if _has_srs_cards(db, skill_id):
                skipped.append("srs")
            else:
                generate_cards_for_skill(db, llm, embedder, skill_id=skill_id)
                generated.append("srs")
        elif kind == "quiz":
            if _has_mission_quiz(db, skill_id):
                skipped.append("quiz")
            else:
                generate_quiz(
                    db,
                    llm,
                    embedder,
                    lesson_id=lesson_id,
                    count=_EQUIP_QUIZ_COUNT,
                    difficulty=_EQUIP_QUIZ_DIFFICULTY,
                )
                generated.append("quiz")
        else:
            # Vocabulaire fermé, refusé bien plus tôt par `create_run`. Si on arrive ici, une
            # troisième voie d'écriture est apparue — et elle doit se voir, pas passer.
            errors.append({"piece": kind, "message": f"Type de pièce inconnu : {kind}."})
    except Exception as exc:  # noqa: BLE001
        errors.append({"piece": kind, "message": str(exc)})

    return out(has_lesson=True, reason=None)
