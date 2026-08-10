"""Le plan de préparation d'une échéance (ADR-0050, réalise l'ADR-0025 §8 rôle 1).

L'échéance dit **quoi** ; le plan dit **comment s'y prendre** — c'est le rôle de « traducteur »,
*« le seul rôle qui justifie la fonctionnalité ; sans lui, ZETIS construit un carnet de plus »*.

Fichier séparé de `service.py`, qui porte déjà la co-édition, la bande et les traces : le plan a
son propre cycle de vie (composition, figement, révocation) et n'a aucune raison de s'y diluer.

## Trois règles portées ici, et aucune n'est un détail

**1. Zéro LLM.** Le plan se compose depuis le RÉFÉRENTIEL (§8 rôle 1). Rien n'est rédigé.

**2. Chaque étape interroge le prédicat de SON grain** (ADR-0050 Décision 2, amendée) :

| Étape | Grain | Prédicat |
|---|---|---|
| `fiche`, `quiz` | notion | `galaxy.resolve_panoply` |
| `revision` | **chapitre** | `memory.chapter_servable_count` |

🔴 **Et surtout : aucune requête de disponibilité RÉÉCRITE ici.** La règle de l'addendum ADR-0024
n'est pas « tout passe par `resolve_panoply` », elle est **« un seul prédicat par question »**.
La panoplie répond *« cette NOTION a-t-elle une carte ? »* en filtrant sur le seul `status` ;
le deck chapitre exige aussi `due_at IS NOT NULL`. Composer `revision` depuis la panoplie
donnerait donc une étape qui ouvre sur un **400** — la « porte ouverte sur du vide ».

**3. Une étape par TYPE, jamais par notion** (Décision 2 bis). Sur un chapitre à six notions
testables, Massimo ne verra pas six « petit quiz » : le plan dit **par où commencer**, pas tout
ce qu'on pourrait faire. La panoplie complète reste accessible depuis la galaxie.
"""

from collections.abc import Sequence
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import AgendaItem, AgendaPlanStep
from app.modules.evidence import service as evidence
from app.modules.galaxy.service import resolve_panoply
from app.modules.activity.timeutils import today_local
from app.modules.lesson_resolution import ordered_chapter_skill_ids
from app.modules.memory.service import chapter_servable_count

# Plafonds de la Décision 3. ⚠️ Ils ne sont PAS le nombre d'étapes : celui-ci est aussi borné par
# le nombre de TYPES disponibles (Décision 2 bis), et trois types existent. Le plafond ne fait
# que le réduire quand l'échéance est proche.
PLAN_MAX_STEPS = 3
PLAN_MAX_STEPS_SHORT = 2  # 2 ou 3 jours restants
PLAN_SHORT_DAYS = 3

# L'ordre est celui de la panoplie — *comprendre, puis mémoriser, puis se tester* — et il ne se
# réordonne pas ici. `revision` s'y insère à sa place, même si sa disponibilité vient d'ailleurs.
PLAN_STEP_ORDER = ("fiche", "revision", "quiz")


def _today() -> date:
    """Le jour d'aujourd'hui **en Europe/Paris**, isolé pour être figé dans les tests.

    🔴 **CORRIGÉ le 2026-08-11 : cette fonction rendait la date UTC** — un bug de production,
    pas une coquette de test. Tout le reste de l'agenda date en Europe/Paris (`today_local`),
    et entre **minuit et 2 h** (été ; minuit–1 h en hiver) les deux sources **diffèrent d'un
    jour**. Mesuré à 00 h 16 : UTC disait le 10, Paris le 11.

    Conséquence à l'écran, et c'est ce qui en fait un bug et non un détail :
    `jours_restants = due_on - _today()` valait **un de trop**, donc une échéance de **demain**
    était vue comme J+2 — et ZETIS **composait un plan là où la Décision 3 l'interdit**
    (« aucun plan à J+0 ni J+1 »), avec une étape datée d'aujourd'hui ou de la veille. Un enfant
    qui ouvre son agenda à 00 h 30 est dans la fenêtre.

    ⚠️ **L'isolation reste** (patron `_now` du module `memory`) : c'est la SOURCE qui était
    fausse, pas le fait d'avoir une fonction. Elle est désormais la même que celle de la bande,
    des traces et des sections — une seule notion d'« aujourd'hui » dans tout l'agenda.
    """
    return today_local()


def _panoply_entry(actions: list[dict], kind: str) -> dict | None:
    """L'entrée d'un type dans la panoplie d'une notion, si elle est DISPONIBLE."""
    for action in actions:
        if action["kind"] == kind and action.get("available"):
            return action
    return None


def compose_steps(db: Session, item: AgendaItem) -> list[dict]:
    """Les étapes que MÉRITE cette échéance — sans rien persister, sans rien décider du figement.

    Rend `[]` dès qu'une des conditions manque : pas de chapitre, échéance à J+0 ou J+1, ou aucune
    activité disponible. **Les trois se lisent pareil pour l'appelant**, et c'est voulu : la
    surface n'affiche rien dans les trois cas (Décision 3 + `adr-0025` §14.6).
    """
    if item.chapter_id is None:
        return []

    jours_restants = (item.due_on - _today()).days
    if jours_restants < 2:
        # J+0 et J+1 : il n'y a pas de « rétro-planning » sur zéro jour disponible. Et une
        # échéance passée n'a rien à préparer.
        return []

    skill_ids = ordered_chapter_skill_ids(db, item.chapter_id)
    if not skill_ids:
        return []

    panoply = resolve_panoply(db, student_id=item.student_id, skill_ids=skill_ids)
    candidates: dict[str, dict] = {}

    # `fiche` — celle de la PREMIÈRE leçon du chapitre qui en a une, en ordre curriculum.
    # `skill_ids` est déjà dans cet ordre : le premier trouvé est le bon.
    for skill_id in skill_ids:
        entry = _panoply_entry(panoply.get(skill_id, []), "fiche")
        if entry is not None:
            candidates["fiche"] = {
                "kind": "fiche",
                "skill_id": skill_id,
                "resource_id": entry.get("fiche_id"),
            }
            break

    # `revision` — grain CHAPITRE, donc prédicat du chapitre. Voir l'en-tête : la panoplie
    # répondrait à une autre question, avec un filtre plus lâche.
    if chapter_servable_count(db, item.student_id, item.chapter_id) > 0:
        candidates["revision"] = {
            "kind": "revision",
            "skill_id": None,  # le deck n'a pas de grain plus fin que le chapitre
            "resource_id": item.chapter_id,
        }

    # `quiz` — la notion la PLUS FRAGILE parmi celles qui en ont un (patron ADR-0018 §3 :
    # les plus faibles d'abord). À égalité, l'ordre curriculum départage — déterministe.
    mastery = evidence.mastery_by_skill(db, student_id=item.student_id)
    testables = [
        (float(mastery.get(skill_id, {}).get("mastery", 0.0)), rang, skill_id, entry)
        for rang, skill_id in enumerate(skill_ids)
        if (entry := _panoply_entry(panoply.get(skill_id, []), "quiz")) is not None
    ]
    if testables:
        _, _, skill_id, entry = min(testables, key=lambda t: (t[0], t[1]))
        candidates["quiz"] = {
            "kind": "quiz",
            "skill_id": skill_id,
            "resource_id": entry.get("quiz_id"),
        }

    retenues = [candidates[kind] for kind in PLAN_STEP_ORDER if kind in candidates]
    if not retenues:
        return []

    plafond = PLAN_MAX_STEPS_SHORT if jours_restants <= PLAN_SHORT_DAYS else PLAN_MAX_STEPS
    retenues = retenues[:plafond]

    # Répartition : une étape par jour, **en commençant au plus tôt** (demain), et **jamais le
    # jour de l'échéance** — `day_offset` ne descend pas sous 1, la veille. Sur une échéance à
    # J+2, il n'y a qu'un jour disponible : les deux étapes y tiennent ensemble, ce qui reste
    # préférable à en supprimer une.
    for index, etape in enumerate(retenues):
        etape["day_offset"] = max(1, (jours_restants - 1) - index)
        etape["sort_order"] = index
    return retenues


def get_or_create_plan(db: Session, item: AgendaItem) -> list[AgendaPlanStep]:
    """Le plan de cette échéance — composé à la PREMIÈRE lecture, puis **figé** (§8 rôle 1).

    *« Un plan qui se recalcule à chaque ouverture est un plan auquel on ne fait pas confiance. »*
    S'y ajoute une raison que le §8 ne donne pas : un plan qui bouge rétroactivement effacerait les
    étapes que Massimo a déjà faites.

    ⚠️ **Conséquence assumée** : une fiche validée APRÈS la première lecture n'entre jamais dans
    le plan. C'est le prix du figement, et il est plus faible que celui d'un plan mouvant.

    ⚠️ **Un plan vide n'est pas persisté** — on ne stocke pas une absence. La composition sera
    donc retentée à chaque lecture tant qu'elle ne donne rien, ce qui est **exactement** le
    comportement voulu : le jour où Papa valide la fiche, le plan apparaît.
    """
    existantes = list(
        db.scalars(
            select(AgendaPlanStep)
            .where(AgendaPlanStep.agenda_item_id == item.id)
            .order_by(AgendaPlanStep.sort_order, AgendaPlanStep.id)
        )
    )
    if existantes:
        return existantes

    etapes = compose_steps(db, item)
    if not etapes:
        return []

    crees = [AgendaPlanStep(agenda_item_id=item.id, **etape) for etape in etapes]
    db.add_all(crees)
    # 🔴 **COMMIT, pas seulement `flush`** — et c'est le défaut que les verrous ont attrapé.
    #
    # Cette fonction est appelée depuis des **GET** (la bande, « ce qui arrive »), qui ne
    # committent pas. Un `flush` seul assignait les ids, les servait au client… puis la
    # transaction était annulée en fin de requête. Le plan semblait exister — il était rendu,
    # avec des ids — et n'existait pas : la coche répondait **404**, et chaque lecture
    # recomposait tout.
    #
    # ⚠️ Une écriture dans un GET est inhabituelle et assumée : c'est **la « première lecture »
    # du §8 rôle 1**, le moment même où le plan naît. L'alternative serait un job de fond pour
    # un objet que personne ne regardera peut-être jamais.
    db.commit()
    for etape in crees:
        db.refresh(etape)
    return crees


def plan_counts(db: Session, item_ids: Sequence[int]) -> dict[int, tuple[int, int]]:
    """`{agenda_item_id: (étapes, cochées)}` — **LECTURE PURE, EN LOT** (ADR-0050 Décision 7).

    🔴 **Ne compose RIEN et n'écrit RIEN**, et c'est la raison d'être de cette fonction. Compter
    via `get_or_create_plan` aurait fait de **Papa le déclencheur du figement** : il ouvre sa
    grille le dimanche soir en relevant l'ENT, et le plan de Massimo se fige là, sur un état du
    référentiel antérieur aux fiches que Papa s'apprête justement à valider.

    Le §8 dit *« composé à la première lecture »* — la première lecture **de Massimo**. La surface
    de pilotage **constate**, elle ne provoque pas. C'est la même frontière que `done_at`, que Papa
    lit et n'écrit jamais (§2b).

    ⚠️ **En lot** : la grille de Papa rend deux semaines d'items. Une requête par ligne dans la
    boucle de rendu ferait N requêtes par page — patron de `revisable_counts`.

    ⚠️ Une échéance **sans plan** est absente du résultat, elle ne rend pas `(0, 0)` : c'est à
    l'appelant de choisir son défaut, et `pilot_out` l'exige explicitement.
    """
    if not item_ids:
        return {}
    lignes = db.execute(
        select(
            AgendaPlanStep.agenda_item_id,
            func.count(AgendaPlanStep.id),
            # `done_at IS NOT NULL` compté en base : ramener les lignes pour les compter en
            # Python ferait transiter tout le plan pour deux entiers.
            func.count(AgendaPlanStep.done_at),
        )
        .where(AgendaPlanStep.agenda_item_id.in_(item_ids))
        .group_by(AgendaPlanStep.agenda_item_id)
    ).all()
    return {item_id: (total, coches) for item_id, total, coches in lignes}


def drop_plan(db: Session, item: AgendaItem) -> int:
    """Supprime le plan d'une échéance, **coches comprises**. Rend le nombre d'étapes retirées.

    🔴 Appelé quand `due_on` CHANGE (Décision 4) : un rétro-planning est une fonction de la date,
    et le garder afficherait des jours qui ne veulent plus rien dire.

    ⚠️ **Les coches sont perdues, et c'est assumé** : elles portaient des jours qui n'existent
    plus. C'est le coût le plus discutable de l'ADR-0050, et il y est écrit noir sur blanc.
    """
    etapes = list(
        db.scalars(select(AgendaPlanStep).where(AgendaPlanStep.agenda_item_id == item.id))
    )
    for etape in etapes:
        db.delete(etape)
    return len(etapes)


def step_out(step: AgendaPlanStep) -> dict:
    """Vue Massimo d'une étape. Aucun champ de mécanique : ni `sort_order`, ni identifiants
    internes au-delà de ce qui permet d'ouvrir l'activité."""
    return {
        "id": step.id,
        # Le SUJET de l'étape (Décision 2 ter) — ce qu'elle prépare, pas un rouage.
        "agenda_item_id": step.agenda_item_id,
        "kind": step.kind,
        "day_offset": step.day_offset,
        "skill_id": step.skill_id,
        "resource_id": step.resource_id,
        # ⚠️ « coché », jamais « fait » : le serveur ne sait rien d'autre qu'un `done_at` posé par
        # une route élève (ADR-0050 Décision 5 option A, `adr-0025` §14.7).
        "done": step.done_at is not None,
    }


def set_step_done(
    db: Session, *, student_id: int, step_id: int, done: bool
) -> AgendaPlanStep:
    """Massimo coche (ou décoche) une étape. **Sa déclaration, et rien d'autre.**

    🔴 **Aucun XP, aucune célébration, aucune écriture pédagogique** — ni `skill_mastery`, ni SRS,
    ni `evidence`. C'est la règle de l'en-tête de `models/agenda.py`, et la Décision 5 (option A)
    de l'ADR-0050 : *cocher ne prouve rien, ne pas cocher ne prouve rien*. Récompenser le geste
    apprendrait à Massimo à cocher.

    ⚠️ **Jouer l'activité ne passe jamais par ici** : une session de cartes ne coche aucune étape,
    et cocher n'exige pas d'avoir joué. La variante « prouvée par la trace » est reportée.

    Étape inexistante, ou appartenant à l'échéance d'un autre élève → 404, jamais 403 : un id
    inconnu ne doit rien révéler (patron `_get`).
    """
    step = db.scalar(
        select(AgendaPlanStep)
        .join(AgendaItem, AgendaItem.id == AgendaPlanStep.agenda_item_id)
        .where(AgendaPlanStep.id == step_id, AgendaItem.student_id == student_id)
    )
    if step is None:
        # 404 et non 403, comme `_get` : un id inconnu et un id qui appartient à un autre élève
        # doivent être INDISCERNABLES, sinon la route devient un oracle d'existence.
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Étape introuvable.")
    step.done_at = datetime.now(timezone.utc) if done else None
    db.commit()
    db.refresh(step)
    return step
