"""Fiabilité d'une mesure de diagnostic (ADR-0048).

Le diagnostic est le seul endroit de ZETIS où une mesure fausse **se propage** : elle écrit
`SkillMastery`, ouvre des `Gap`, et ces deux-là nourrissent missions, galaxie et Conseil de classe.
Ce module ne bloque rien — il **qualifie** la mesure, et Papa tranche.

🔴 **RÈGLE DE VOCABULAIRE, NON NÉGOCIABLE.** Tout ici prend **la mesure** pour sujet, jamais
l'enfant : `reliability`, `faits`, `indices`, « à confirmer ». Jamais `suspicion`, jamais `cheat`,
jamais un nom d'enfant en sujet de phrase. Un enfant accusé à tort par un logiciel apprend surtout
à s'en méfier — et la verbalisation (spec §6) repose entièrement sur le fait qu'il n'ait rien à
défendre.

⚠️ **Ce que ce module NE PEUT PAS faire, et qui doit rester dit** : aucun signal du navigateur ne
survit à un téléphone posé à côté de l'écran. Les cinq signaux clients sont *déclarés* par le
client ; seul le **contraste** (§`notions_sans_trace`) est calculé serveur, et il est le seul
infalsifiable. C'est pour ça qu'il pèse le plus.
"""

from statistics import median

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import LearningEvent, LessonSkill, LessonView, SkillMastery
from app.modules.activity.events import NON_WORK_EVENTS

# --- Vocabulaire du verdict ---------------------------------------------------------------------

VERDICT_A_CONFIRMER = "a_confirmer"
VERDICT_RIEN_A_SIGNALER = "rien_a_signaler"

# 🔴 Le verdict est FIGÉ à l'écriture, jamais dérivé à la lecture (ADR-0048 Décision 4). Ce numéro
# dit quelle règle l'a produit : sans lui, un verdict figé serait un verdict dont on ne sait plus
# rien le jour où les seuils changent.
REGLE_VERSION = 1

# --- Seuils du contraste ------------------------------------------------------------------------

# Une notion est « donnée acquise » par cette mesure au-delà de ce score.
CONTRASTE_SCORE_MIN = 90
# Plancher : un diagnostic à une ou deux notions ne déclenche pas pour rien.
CONTRASTE_PLANCHER = 2

# --- Seuils de l'INDICE de rapidité (ne déclenche jamais rien) -----------------------------------

# Relatif à la passation elle-même, pas à une constante : un enfant rapide a une médiane rapide.
RAPIDE_FRACTION_MEDIANE = 0.4
# En dessous de ce nombre de réponses chronométrées, la médiane ne décrit rien : aucun indice.
RAPIDE_MIN_REPONSES = 4


def notions_sans_trace(db: Session, *, student_id: int, skill_ids: list[int]) -> set[int]:
    """Les notions que ZETIS n'a **jamais rencontrées** — union de TROIS sources.

    🔴 **À APPELER AVANT `_upsert_skill_mastery`.** Cette fonction-là écrit un `SkillMastery` pour
    *chaque* notion de la passation : appelée après, celle-ci comparerait la passation **à
    elle-même**, ne rendrait jamais rien, et **tout marcherait**. Le meilleur signal du chantier
    serait mort sans qu'une ligne rougisse.

    🔴 **Les trois sources, et aucune n'est facultative** (spec §3.4 bis, corrigé au
    read-before-code du 2026-08-09 — la règle d'origine n'en citait qu'une, et c'était faux) :

    1. `SkillMastery` — la notion a été **mesurée** (diagnostic, quiz, mission) ;
    2. `LearningEvent` portant le `skill_id`, hors `NON_WORK_EVENTS` — elle a été **travaillée sans
       être mesurée** (ELI5, chat, révision SRS) ;
    3. `LessonView ⋈ LessonSkill` — **le cours a été lu**.

    **Pourquoi `LearningEvent` seul ne suffit pas** : sur les dix appels à `log_learning_event`,
    trois seulement passent un `skill_id`, et **le diagnostic n'en fait pas partie**
    (`diagnostics/router.py` journalise avec le `subject_id` seul). Une notion mesurée par trois
    diagnostics antérieurs aurait donc été « jamais rencontrée », et la bande serait apparue
    presque à chaque passation.

    ⚠️ `NON_WORK_EVENTS` et non `NON_ACTIVITY_EVENTS` : la navigation n'est pas du travail. Sans
    `page_viewed` dans le filtre, ouvrir une page suffirait à éteindre le signal — défaut déjà payé
    par `production.runner.massimo_is_active`.
    """
    if not skill_ids:
        return set()

    mesurees = set(
        db.scalars(
            select(SkillMastery.skill_id).where(
                SkillMastery.student_id == student_id,
                SkillMastery.skill_id.in_(skill_ids),
            )
        )
    )
    travaillees = set(
        db.scalars(
            select(LearningEvent.skill_id).where(
                LearningEvent.student_id == student_id,
                LearningEvent.skill_id.in_(skill_ids),
                LearningEvent.event_type.notin_(sorted(NON_WORK_EVENTS)),
            )
        )
    )
    cours_lus = set(
        db.scalars(
            select(LessonSkill.skill_id)
            .join(LessonView, LessonView.lesson_id == LessonSkill.lesson_id)
            .where(
                LessonView.student_id == student_id,
                LessonSkill.skill_id.in_(skill_ids),
            )
        )
    )
    return set(skill_ids) - mesurees - travaillees - cours_lus


def _rapides(durees_ms: list[int]) -> int:
    """Combien de réponses sont **nettement** plus rapides que les autres — un INDICE, jamais un
    fait. Lenteur ≠ triche, rapidité ≠ copie : un enfant qui sait répond vite.

    Normalisé sur la passation elle-même, pas sur une constante en secondes, qui punirait un enfant
    rapide et raterait un enfant lent."""
    if len(durees_ms) < RAPIDE_MIN_REPONSES:
        return 0
    seuil = median(durees_ms) * RAPIDE_FRACTION_MEDIANE
    return sum(1 for d in durees_ms if d < seuil)


def evaluer(
    *,
    reponses: list[dict],
    conditions: dict | None,
    per_skill: list[dict],
    sans_trace: set[int],
) -> dict:
    """Compose le bloc `reliability_json` d'une passation. **Appelé une fois, à la soumission.**

    `reponses` porte, par question, les drapeaux déclarés par le client (`quittee`, `enonce_copie`,
    `ms_reflexion`) ; `conditions` porte ceux qui valent pour la passation entière ; `per_skill` est
    la mesure déjà corrigée ; `sans_trace` vient de `notions_sans_trace`, appelée **avant** la
    propagation.

    🔴 **La règle, en une phrase** : un **fait** déclenche à lui seul, un **indice** ne déclenche
    jamais et s'affiche quand même. La frontière n'est pas la force du soupçon, c'est la part
    d'interprétation — un indice a une explication innocente au moins aussi probable que l'autre.

    Rend toujours un dict : dès lors que le serveur a regardé, le verdict est
    `rien_a_signaler`, jamais `NULL`. `NULL` est réservé aux passations d'avant le chantier.
    """
    conditions = conditions or {}

    # --- les FAITS déclarés par le client ---
    questions_quittees = sum(1 for r in reponses if r.get("quittee"))
    enonces_copies = sum(1 for r in reponses if r.get("enonce_copie"))
    plein_ecran_quitte = bool(conditions.get("plein_ecran_quitte"))

    # --- le FAIT calculé serveur : le contraste ---
    # ⚠️ Les notions sans `skill_id` ne comptent nulle part : elles n'ont pas d'historique à
    # contraster, et les inclure au dénominateur diluerait la majorité.
    notions = [r for r in per_skill if r.get("skill_id") is not None]
    acquises_sans_trace = sum(
        1
        for r in notions
        if r["skill_id"] in sans_trace and r.get("score", 0) >= CONTRASTE_SCORE_MIN
    )
    contraste = (
        acquises_sans_trace >= CONTRASTE_PLANCHER and acquises_sans_trace * 2 > len(notions)
    )

    # --- les INDICES : ils s'affichent, ils ne déclenchent pas ---
    durees = [int(r["ms_reflexion"]) for r in reponses if r.get("ms_reflexion") is not None]
    reponses_rapides = _rapides(durees)
    taille_changee = bool(conditions.get("taille_changee"))

    declencheurs: list[str] = []
    if questions_quittees:
        declencheurs.append("questions_quittees")
    if enonces_copies:
        declencheurs.append("enonces_copies")
    if plein_ecran_quitte:
        declencheurs.append("plein_ecran_quitte")
    if contraste:
        declencheurs.append("contraste")

    return {
        "verdict": VERDICT_A_CONFIRMER if declencheurs else VERDICT_RIEN_A_SIGNALER,
        "regle_version": REGLE_VERSION,
        "faits": {
            "questions_quittees": questions_quittees,
            "enonces_copies": enonces_copies,
            "plein_ecran_quitte": plein_ecran_quitte,
            "acquises_sans_trace": acquises_sans_trace,
            "notions_total": len(notions),
        },
        "indices": {
            "reponses_rapides": reponses_rapides,
            "taille_changee": taille_changee,
        },
        "declencheurs": declencheurs,
        # 🔴 L'instrument dit sa PORTÉE. Sans ce champ, l'absence d'un signal se lirait comme
        # l'absence du comportement — or le plein écran n'existe pas sur iPhone (iOS Safari refuse
        # `requestFullscreen`). Papa doit lire « rien à signaler » en sachant sur combien d'yeux ce
        # « rien » repose.
        "portee": {"observables": list(conditions.get("signaux_observables") or [])},
    }
