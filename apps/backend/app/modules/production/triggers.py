"""Les déclencheurs automatiques (ADR-0035, ADR-0036) — ZETIS regarde, puis décide de travailler.

Deux sources, deux scans, **deux jeux de conditions** : l'agenda (`scan_agenda`, une échéance
EXOGÈNE) et la file des demandes de Massimo (`scan_requests`, ENDOGÈNE — d'où une porte plus
étroite). Les fusionner aurait rendu illisible pourquoi ZETIS n'a rien fait.


## Ce que ce module RÉPOND à l'objection qu'il révoque

`production_worker.py` portait `with_scheduler=False` **avec son motif** :

> « le déclenchement reste ÉVÉNEMENTIEL. Aucun cron, aucune tâche périodique — un scheduler ici
> ouvrirait la porte à *"tous les dimanches, produire quelque chose"*, qui n'a pas de sens
> pédagogique. »

**L'objection est maintenue, et satisfaite — pas contournée.** ZETIS ne produit **jamais** parce
que c'est dimanche. Il produit parce qu'un humain a écrit qu'il y avait un contrôle jeudi. Le
réveil périodique **REGARDE** ; il ne décide pas. C'est toute la différence, et elle tient dans
la séparation stricte de ce fichier et de `jobs.run_production`.

## Séparer le scan de l'exécution est un INVARIANT

Un scan qui produirait tiendrait un `AccessShareLock` pendant une heure — le défaut exact observé
le 2026-08-02, réparé par le `db.rollback()` de `massimo_is_active`. Le scan doit être **court, en
lecture**, et refermer sa transaction. Il **crée des runs** ; l'exécution reste le job existant.
"""

import logging
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import AgendaItem, ContentRequest, StudentProfile
from app.db.models.production import REQUEST_KIND_TO_PIECE
from app.modules.production import runner, runs

logger = logging.getLogger(__name__)

# ⚠️ **RÉVOCATION du 2026-08-03** (addendum ADR-0035). Le §1 disait `controle` SEUL, au motif qu'un
# devoir « reviendrait tous les jours et noierait le régulateur ». **L'objection reste juste** — un
# devoir est le `kind` par DÉFAUT de la saisie et revient plusieurs fois par semaine.
#
# Décision du commanditaire : un devoir mérite la même préparation qu'un contrôle. L'objection est
# traitée par le TRI ci-dessous, pas ignorée : quand le plafond ne laisse passer qu'un lot, c'est
# le contrôle qui l'obtient.
#
# `rendu` reste légal et non émis — le patron « le modèle anticipe, le code n'anticipe pas » tient.
TRIGGERING_KINDS = ("controle", "devoir")

# Ordre de priorité quand le régulateur est serré. Le scan crée les lots dans l'ordre et s'arrête
# quand le plafond refuse : trier ici, c'est décider QUI passe en dernier — et ce n'est pas le
# contrôle. Sans ce tri, trois devoirs saisis le dimanche mangeraient la semaine entière et le
# contrôle du jeudi partirait bredouille.
_KIND_PRIORITY = {"controle": 0, "devoir": 1}

# Les motifs de non-déclenchement, nommés. Un scan qui ne fait rien SANS DIRE POURQUOI est
# indistinguable d'un scan en panne — et il tourne la nuit, quand personne ne regarde.
SKIP_DISABLED = "Le déclenchement automatique est désarmé."
SKIP_NO_STUDENT = "Aucun profil élève."
SKIP_MASSIMO_ACTIVE = "Massimo travaille — un lot que personne n'a demandé ne lui dispute pas Ollama."
SKIP_NO_CHAPTER = "Échéance sans chapitre rattaché — rien à produire."
SKIP_ALREADY = "Un lot référence déjà cette échéance."

# Motifs propres au scan des DEMANDES (ADR-0036 §1).
SKIP_NOT_AUTONOMOUS = "Le régime n'est pas « Autonome » — la production reste un geste de Papa."
SKIP_REQUEST_ALREADY = "Un lot référence déjà cette demande."
SKIP_KIND_NOT_PRODUCIBLE = (
    "Ce type de contenu ne se produit pas tout seul — il reste un geste de Papa."
)


def eligible_items(db: Session, *, student_id: int, today: date | None = None) -> list[AgendaItem]:
    """Les échéances qui MÉRITENT un lot — les cinq conditions de l'ADR-0035 §1, sauf l'idempotence.

    L'idempotence est volontairement hors d'ici : elle se lit dans `production_runs`
    (`runs.run_exists_for`), pas dans l'agenda, qui est **co-édité par Massimo**.

    ⚠️ `chapter_id` est **nullable et rempli par un geste de Papa** (ADR-0025 §11, « posée dès
    maintenant, exploitée au Lot 3 »). Un contrôle sans chapitre ne déclenchera rien — c'est un
    fait produit, pas un bug, et la page Agenda devra le dire.
    """
    today = today or datetime.now(timezone.utc).date()
    horizon = today + timedelta(days=settings.production_auto_lookahead_days)
    items = list(
        db.scalars(
            select(AgendaItem)
            .where(
                AgendaItem.student_id == student_id,
                AgendaItem.kind.in_(TRIGGERING_KINDS),
                AgendaItem.chapter_id.is_not(None),
                AgendaItem.dismissed_at.is_(None),
                AgendaItem.due_on >= today,
                AgendaItem.due_on <= horizon,
            )
            .order_by(AgendaItem.due_on, AgendaItem.id)
        ).all()
    )
    # ⚠️ **Les CONTRÔLES d'abord, la date ensuite.** Le tri se fait en Python et non en SQL parce
    # que la priorité est un vocabulaire du domaine, pas une colonne : l'exprimer en `CASE WHEN`
    # la dupliquerait en base et la ferait diverger de `_KIND_PRIORITY` au premier `kind` ajouté.
    #
    # Conséquence voulue : un contrôle dans 6 jours passe AVANT un devoir demain. C'est le prix de
    # la révocation du §1 — sans lui, ouvrir les devoirs revenait à fermer les contrôles.
    items.sort(key=lambda i: (_KIND_PRIORITY.get(i.kind, 9), i.due_on, i.id))
    return items


def scan_agenda(db: Session) -> dict:
    """Regarde l'agenda et crée les lots qui manquent. **Ne produit rien lui-même.**

    Renvoie un compte rendu — jamais une exception. Un scan qui remonterait son échec ferait
    tomber le job périodique et arrêterait tout le dispositif pour un contrôle mal saisi.
    """
    report: dict = {"created": [], "skipped": []}

    from app.modules.settings import service as settings_service

    if not settings_service.auto_trigger_enabled(db):
        report["skipped"].append({"item_id": None, "reason": SKIP_DISABLED})
        return report

    student = db.scalar(select(StudentProfile).order_by(StudentProfile.id))
    if student is None:
        report["skipped"].append({"item_id": None, "reason": SKIP_NO_STUDENT})
        return report

    # ⚠️ Évalué À LA CRÉATION, pas seulement entre deux notions (ADR-0035 §7). La préemption
    # existante rend la main en cours de route, ce qui suffisait pour un lot que Papa venait de
    # demander en connaissance de cause. Un lot que PERSONNE n'a demandé ne doit pas disputer
    # Ollama à la session de Massimo, fût-ce une notion.
    if runner.massimo_is_active(db, student_id=student.id):
        report["skipped"].append({"item_id": None, "reason": SKIP_MASSIMO_ACTIVE})
        return report

    for item in eligible_items(db, student_id=student.id):
        if runs.run_exists_for(db, trigger="agenda", reference_id=item.id):
            report["skipped"].append({"item_id": item.id, "reason": SKIP_ALREADY})
            continue
        try:
            run = runs.create_run(
                db,
                chapter_id=item.chapter_id,
                trigger="agenda",
                # ⚠️ LA première émission de `parent_rule` : aucun humain n'a ouvert la pièce ni
                # cliqué pour ce lot. `authority_for` fait déjà le reste — aucune ligne du runner
                # ne bouge.
                authorized_by="parent_rule",
                reference_id=item.id,
            )
        except HTTPException as exc:
            # ⚠️ `create_run` lève des `HTTPException` — juste dans une requête, absurde dans un
            # job RQ : le code de statut ne part vers personne. On le traduit en motif lisible,
            # et le lot REFUSÉ NE CONSOMME PAS LA RÉFÉRENCE : l'item redeviendra éligible au
            # réveil suivant. Un refus n'est pas une production.
            report["skipped"].append({"item_id": item.id, "reason": str(exc.detail)})
            logger.info("production: échéance %s non déclenchée — %s", item.id, exc.detail)
            continue
        report["created"].append({"item_id": item.id, "run_id": run.id})
        logger.info("production: lot %s déclenché par l'échéance %s", run.id, item.id)

    return report


# --- Le second déclencheur : les demandes de Massimo (ADR-0036 §1) -----------------------------


def eligible_requests(db: Session, *, student_id: int) -> list[ContentRequest]:
    """Les demandes qui MÉRITENT un lot — hors idempotence, lue dans `production_runs`.

    **Premier arrivé, premier servi** (ADR-0036 §6) : aucune priorisation, aucun tri par
    « urgence ». Mesurer l'urgence d'un désir demanderait un modèle que ce chantier n'a pas, et
    qui se tromperait sur exactement l'enfant qu'il prétend servir.

    ⚠️ Tri par `updated_at` **croissant**, à l'inverse de `list_requests` qui sert l'inbox de Papa
    du plus frais au plus ancien. Ce n'est pas une incohérence : une file d'attente se sert par le
    début, une boîte de réception se lit par la fin. Et c'est `updated_at`, pas `created_at`, parce
    qu'une demande redemandée est **réactivée** sans changer sa date de création — la trier par
    création la laisserait enterrée alors que le besoin vient de revenir.
    """
    return list(
        db.scalars(
            select(ContentRequest)
            .where(
                ContentRequest.student_id == student_id,
                ContentRequest.status == "pending",
            )
            .order_by(ContentRequest.updated_at, ContentRequest.id)
        ).all()
    )


def scan_requests(db: Session) -> dict:
    """Regarde la file des demandes et crée les lots-pièce qui manquent. **Ne produit rien.**

    ## Deux conditions cumulatives, et ce n'est pas la fusion refusée par l'ADR-0035 §5

    Le §5 refusait qu'un **préréglage arme** le déclencheur — une condition qui aurait rendu le
    dispositif plus PERMISSIF sans qu'on l'ait demandé. Ici la conjonction exige les **deux**
    consentements au lieu d'un : elle est plus RESTRICTIVE. Les deux questions restent distinctes ;
    c'est leur et logique qui ouvre cette porte-ci.

    Hors de ce régime, rien ne change : la demande reste un repère de priorité et la production
    reste un geste de Papa — l'addendum ADR-0027 continue de s'appliquer mot pour mot.

    Même contrat que `scan_agenda` : un compte rendu, jamais une exception.
    """
    report: dict = {"created": [], "skipped": []}

    from app.modules.settings import service as settings_service

    # L'ordre des deux refus n'est pas indifférent : le régime d'abord, parce que c'est la
    # condition de DOCTRINE (« ZETIS produit-il sans relecture ? »), l'armement ensuite, qui est
    # la condition de MISE EN MARCHE. Le motif rendu doit être le plus fondamental des deux.
    if not settings_service.regime_is_autonomous(db):
        report["skipped"].append({"request_id": None, "reason": SKIP_NOT_AUTONOMOUS})
        return report
    if not settings_service.auto_trigger_enabled(db):
        report["skipped"].append({"request_id": None, "reason": SKIP_DISABLED})
        return report

    student = db.scalar(select(StudentProfile).order_by(StudentProfile.id))
    if student is None:
        report["skipped"].append({"request_id": None, "reason": SKIP_NO_STUDENT})
        return report

    if runner.massimo_is_active(db, student_id=student.id):
        report["skipped"].append({"request_id": None, "reason": SKIP_MASSIMO_ACTIVE})
        return report

    for req in eligible_requests(db, student_id=student.id):
        piece = REQUEST_KIND_TO_PIECE.get(req.content_kind)
        if piece is None:
            # `capsule` : son générateur exige une INSTRUCTION en texte libre que la demande ne
            # porte pas (ADR-0036 §3). Le refus est DIT ici et affiché sur la page Demandes —
            # jamais un lot qui échouerait en boucle.
            report["skipped"].append(
                {"request_id": req.id, "reason": SKIP_KIND_NOT_PRODUCIBLE}
            )
            continue
        if runs.run_exists_for(db, trigger="request", reference_id=req.id):
            report["skipped"].append({"request_id": req.id, "reason": SKIP_REQUEST_ALREADY})
            continue
        try:
            run = runs.create_run(
                db,
                scope_skill_id=req.skill_id,
                scope_kind=piece,
                trigger="request",
                # Aucun humain n'a ouvert la pièce ni cliqué pour ce lot : c'est la définition
                # littérale de `parent_rule` (§G.1). La demande de Massimo n'est pas un clic de
                # Papa — c'est la RÈGLE que Papa a posée qui autorise ce lot.
                authorized_by="parent_rule",
                reference_id=req.id,
            )
        except HTTPException as exc:
            # Un refus n'est pas une production : la référence n'est pas consommée, la demande
            # redeviendra éligible au réveil suivant.
            report["skipped"].append({"request_id": req.id, "reason": str(exc.detail)})
            logger.info("production: demande %s non déclenchée — %s", req.id, exc.detail)
            continue
        report["created"].append({"request_id": req.id, "run_id": run.id})
        logger.info("production: lot %s déclenché par la demande %s", run.id, req.id)

    return report
