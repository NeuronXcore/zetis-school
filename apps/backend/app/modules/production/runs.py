"""Création et lecture d'un lot de production (ADR-0031 §3-§5).

Séparé de `coverage.py`, qui reste **strictement en lecture seule** : l'invariant de l'ADR-0023
(« la Couverture ne génère, ne valide, n'écrit jamais rien ») ne doit pas s'éroder au prétexte
qu'on ajoute de l'écriture au module.
"""

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import (
    Chapter,
    Fiche,
    Mindmap,
    ProductionEvent,
    ProductionRun,
    Skill,
    StudentProfile,
)
from app.db.models.production import (
    AUTHORIZED_BY,
    EMITTED_TRIGGERS,
    PIECES,
    REGULATORS,
    TRIGGER_REFERENCE,
    TRIGGERS,
)


class ProductionRefused(HTTPException):
    """Un RÉGULATEUR a dit non — ce qui n'est ni une panne, ni une erreur de donnée.

    Reste une `HTTPException` : la route continue de rendre son `409` avec son `detail`, et pas une
    ligne de `runs_router` ne change. Ce qu'elle ajoute est un code **lisible par machine**, pour
    que l'appelant automatique sache lequel des cinq a parlé (addendum 2 §21).

    ⚠️ **Sans elle, il faudrait relire le motif dans la phrase française.** Un jour quelqu'un
    reformule « contenus attendent déjà votre relecture », et la classification tombe en silence —
    sans qu'aucun test ne rougisse, puisque le message resterait juste.
    """

    def __init__(self, regulator: str, detail: str) -> None:
        assert regulator in REGULATORS, f"régulateur inconnu : {regulator}"
        super().__init__(status.HTTP_409_CONFLICT, detail=detail)
        self.regulator = regulator

# Les dérivés qui attendent une relecture de Papa — et ils ne sont que DEUX.
#
# `Quiz` n'en est pas : il n'a même pas de `validation_status`. Il est servi sans relecture **par
# doctrine** (ADR-0014 §2, provenance `system`), donc il n'est jamais en attente et ne peut pas
# grossir un arriéré. Le compter aurait fait déborder le plafond avec du contenu que personne
# n'a jamais eu à relire.
#
# `Lesson` non plus : un cours en brouillon n'est pas un arriéré de relecture, c'est une passe 1
# qui attend sa passe 2 (addendum ADR-0031). Son gate est le §7 lui-même.
_PENDING_TABLES = (Fiche, Mindmap)


def pending_backlog(db: Session) -> int:
    """Nombre de dérivés en attente de validation — la mesure du régulateur du palier 2."""
    total = 0
    for model in _PENDING_TABLES:
        total += db.scalar(
            select(func.count(model.id)).where(model.validation_status == "pending")
        ) or 0
    return total


def is_stale(run: ProductionRun, *, now: datetime | None = None) -> bool:
    """Un lot `running` dont le battement a expiré — le worker est mort sans le dire.

    ⚠️ **C'est une LECTURE, jamais un état stocké** (ADR-0034 §2). Le §G.3 a écarté la quarantaine
    temporelle précisément parce qu'elle exigeait un ordonnanceur pour libérer à expiration, et
    l'ADR-0023 l'avait refusé. Le seul écrivain est `close_stale_runs`, appelé de façon
    OPPORTUNISTE avant de créer un lot — jamais périodiquement.

    Un lot sans `heartbeat_at` n'est pas zombie : il est antérieur au journal (aucune
    rétro-attribution, doctrine §F.4).
    """
    if run.status != "running" or run.heartbeat_at is None:
        return False
    deadline = timedelta(minutes=settings.production_heartbeat_timeout_minutes)
    # ⚠️ SQLite relit un datetime NAÏF là où Postgres rend un datetime AWARE. Comparer les deux
    # lève un `TypeError` — en test seulement, ce qui en fait un piège : le code passerait en prod
    # et tomberait en CI, ou l'inverse selon quel moteur voit le cas en premier.
    seen = run.heartbeat_at
    if seen.tzinfo is None:
        seen = seen.replace(tzinfo=timezone.utc)
    return (now or datetime.now(timezone.utc)) - seen > deadline


def close_stale_runs(db: Session) -> int:
    """Referme les lots dont le worker est mort. Renvoie le nombre de lots refermés.

    Appelé avant chaque création : c'est le seul moment où l'on sait qu'un humain regarde. Un lot
    zombie laissé `running` bloquerait `GET /active` et ferait croire à une production en cours.
    """
    closed = 0
    now = datetime.now(timezone.utc)
    for run in db.scalars(select(ProductionRun).where(ProductionRun.status == "running")).all():
        if not is_stale(run, now=now):
            continue
        # ⚠️ Lu AVANT d'être effacé : c'est la seule trace de l'endroit où le lot est mort, et
        # c'est précisément l'information qu'on vient chercher dans le journal.
        died_on = run.current_skill_id
        run.status = "failed"
        run.finished_at = now
        run.current_skill_id = None
        db.add(
            ProductionEvent(
                run_id=run.id,
                skill_id=died_on,
                piece=None,
                outcome="error",
                detail="Lot interrompu : le worker n'a plus donné signe de vie.",
                created_at=now,
            )
        )
        closed += 1
    if closed:
        db.commit()
    return closed


def _runs_in_window(db: Session, *, triggers: tuple[str, ...], now: datetime | None) -> int:
    since = (now or datetime.now(timezone.utc)) - timedelta(
        days=settings.production_auto_window_days
    )
    return db.scalar(
        select(func.count(ProductionRun.id)).where(
            ProductionRun.trigger.in_(triggers), ProductionRun.created_at >= since
        )
    ) or 0


def request_runs_in_window(db: Session, *, now: datetime | None = None) -> int:
    """Nombre de lots nés d'une DEMANDE sur la fenêtre — le régulateur de l'ADR-0036 §5.

    ⚠️ **Compté à part des lots d'échéance, et ce n'est pas une commodité.** Le régulateur de
    l'ADR-0035 compte des **lots**, pas du **coût** : un lot-pièce (~30 s) y pèse autant qu'un
    lot-chapitre (~36 min). Sous un plafond commun, **deux fiches demandées empêcheraient de
    préparer un contrôle** — un soir d'ennui de Massimo priverait son contrôle du jeudi.

    Trois origines, trois natures. La fenêtre est la même (`production_auto_window_days`) : c'est
    le plafond qui diffère, pas la période — deux périodes différentes n'auraient rien régulé de
    plus et auraient donné un réglage de plus à comprendre.
    """
    return _runs_in_window(db, triggers=("request",), now=now)


def auto_runs_in_window(db: Session, *, now: datetime | None = None) -> int:
    """Nombre de lots AUTOMATIQUES sur la fenêtre glissante — le régulateur de l'ADR-0035 §4.

    ⚠️ **Les lots manuels ne comptent pas**, et c'est le cœur de la décision : quand Papa clique,
    **le geste EST le régulateur** (ADR-0032 §5) — le volume est borné par le nombre de fois où un
    humain appuie. Les mélanger ferait qu'une session de rattrapage de Papa désarmerait
    l'automatisme, ou l'inverse.

    ⚠️ **Il ne remplace pas `pending_backlog`, il s'y ajoute.** Deux régulateurs, deux objets : ce
    compteur borne le VOLUME PRODUIT, l'autre borne l'ARRIÉRÉ DE RELECTURE. Au palier 2 le second
    mord ; au palier 3, plus rien ne devient `pending` et seul celui-ci mord. C'est voulu — c'est
    exactement le trou que l'ADR-0031 §5 avait annoncé.

    ⚠️ **`request` en est EXCLU depuis l'ADR-0036 §5.** La condition disait `trigger != "manual"`,
    ce qui ne désignait que l'agenda tant qu'il était le seul déclencheur automatique. Ouvrir les
    demandes sous cette condition-là aurait mis deux natures dans le même seau — voir
    `request_runs_in_window`. Les déclencheurs sont donc nommés, et non plus déduits par
    soustraction : le prochain qui s'ouvrira devra choisir son seau explicitement.
    """
    return _runs_in_window(db, triggers=("agenda", "evidence", "derived", "council"), now=now)


def run_exists_for(db: Session, *, trigger: str, reference_id: int) -> bool:
    """Un lot référence-t-il DÉJÀ cette origine ? (ADR-0035 §3, idempotence)

    Sans cette question, chaque réveil du scan reproduirait le même chapitre jusqu'à l'échéance.

    ⚠️ **L'idempotence se lit ICI, elle ne s'écrit pas sur la source.** Poser un `produced_at` sur
    `agenda_items` ferait écrire le module production dans une table que **Massimo co-édite**
    (ADR-0025 §2a : « personne ne réécrit silencieusement l'autre »). « Ce lot a-t-il déjà eu
    lieu ? » se pose au journal des lots — c'est sa raison d'être.
    """
    column = TRIGGER_REFERENCE.get(trigger)
    if column is None:
        return False
    return bool(
        db.scalar(
            select(ProductionRun.id)
            .where(getattr(ProductionRun, column) == reference_id)
            .limit(1)
        )
    )


def create_run(
    db: Session,
    *,
    chapter_id: int | None = None,
    scope_skill_id: int | None = None,
    scope_kind: str | None = None,
    trigger: str = "manual",
    authorized_by: str = "parent_direct",
    reference_id: int | None = None,
) -> ProductionRun:
    """Crée un lot. Refuse si l'arriéré déborde — ou si le volume auto est atteint.

    Le régulateur REFUSE et le DIT — il ne tronque pas silencieusement. Une production qui dépasse
    durablement la capacité de relecture fabrique une dette qui tue le dispositif (ADR-0023 §5).

    **Deux scopes possibles, jamais les deux, jamais aucun** (ADR-0036 §2) : un `chapter_id`, ou la
    paire `(scope_skill_id, scope_kind)` — une pièce sur une notion. La règle est tenue ICI **et**
    par une contrainte SQL : le service donne le message, la base garantit l'invariant même si un
    jour un autre chemin d'écriture apparaît.

    `trigger` / `authorized_by` / `reference_id` (ADR-0035 §3) — les défauts sont ceux du geste de
    Papa : **les appelants existants ne changent pas d'un caractère**.

    ⚠️ **Cette fonction lève des `HTTPException`.** C'est juste dans une requête, ça ne l'est pas
    dans un job RQ : le scan automatique **rattrape et journalise**, il ne laisse pas remonter un
    code de statut vers personne (voir `triggers.scan_agenda`).
    """
    if trigger not in TRIGGERS:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f"Déclencheur inconnu : {trigger}."
        )
    if trigger not in EMITTED_TRIGGERS:
        # Le modèle anticipe, le code n'anticipe pas : une valeur légale mais non émise doit être
        # refusée tant que son ADR n'existe pas (patron `content_kind`, patron `parent_rule`).
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Le déclencheur « {trigger} » est modélisé mais pas encore émis.",
        )
    if authorized_by not in AUTHORIZED_BY:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f"Autorité inconnue : {authorized_by}."
        )

    # « Exactement une FK, cohérente avec `trigger` » — la règle que l'ADR-0031 §4 a confiée au
    # service et qui n'avait aucun cas à valider tant que seul `manual` était émis.
    column = TRIGGER_REFERENCE[trigger]
    if column is None and reference_id is not None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Le déclencheur « {trigger} » ne référence rien.",
        )
    if column is not None and reference_id is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Le déclencheur « {trigger} » exige une référence ({column}).",
        )
    # « Exactement un scope » (ADR-0036 §2), refusé AVANT toute écriture. Un lot sans scope
    # produirait dans le vide ; un lot à deux scopes ferait diverger l'exécution de l'affichage.
    piece_scope = scope_skill_id is not None or scope_kind is not None
    if piece_scope and chapter_id is not None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Un lot porte un chapitre OU une pièce, jamais les deux.",
        )
    if not piece_scope and chapter_id is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Un lot doit porter un scope."
        )
    if piece_scope and (scope_skill_id is None or scope_kind is None):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Un scope de pièce exige la notion ET le type.",
        )
    if piece_scope and scope_kind not in PIECES:
        # Le lot parle la langue des tables (`PIECES`), pas celle de la demande (`CONTENT_KINDS`).
        # La traduction est le travail de l'appelant, et `REQUEST_KIND_TO_PIECE` la porte.
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Type de pièce inconnu : {scope_kind}.",
        )

    # Ménage opportuniste AVANT tout le reste : un lot zombie fausserait `GET /active` et ferait
    # croire à une production en cours (ADR-0034 §2).
    close_stale_runs(db)

    if chapter_id is not None:
        if db.get(Chapter, chapter_id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Chapitre introuvable.")
    elif db.get(Skill, scope_skill_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Notion introuvable.")

    # ZETIS est-il suspendu ? — PREMIER des régulateurs, jamais persisté (ADR-0063 §1, §2).
    #
    # Après les 404 de validation (un chapitre introuvable reste un défaut de donnée, pas une
    # politique), avant tout le reste : les cinq autres régulateurs répondent « pas maintenant,
    # pour telle raison » — répondre ça à quelqu'un qui a lui-même coupé le courant serait un
    # refus exact et incompréhensible.
    from app.modules.settings import service as settings_service

    if settings_service.production_suspended(db):
        raise ProductionRefused(
            "suspended",
            "ZETIS est suspendu : aucun lot ne démarre tant que vous ne l'avez pas remis en "
            "route. La file et les contenus existants ne bougent pas.",
        )

    # Un lot au MÊME scope attend déjà — le relancer ne produirait rien de plus (2026-08-05).
    #
    # Quatre lots `fiche` sur la notion 30 se sont empilés le même jour, à cinquante minutes
    # d'intervalle : rien ne bougeait à l'écran (le worker était éteint), donc Papa a recliqué. Le
    # régulateur d'arriéré ne pouvait rien y voir — il compte les contenus qui attendent une
    # RELECTURE, or aucun n'avait été produit. Deux régulateurs, deux objets.
    #
    # ⚠️ **Le refus vient APRÈS `close_stale_runs`**, jamais avant : un lot zombie interdirait
    # alors pour toujours de reproduire ce scope, et le remède serait pire que le mal.
    #
    # ⚠️ Ce n'est PAS de l'idempotence. `run_exists_for` (ADR-0035) demande « ce lot a-t-il déjà
    # été produit ? » sur toute l'histoire ; ici on demande « y en a-t-il un en train de le
    # faire ? ». Relancer une production terminée reste parfaitement légitime.
    doublon = db.scalar(
        select(ProductionRun)
        .where(
            ProductionRun.status.in_(("queued", "running")),
            ProductionRun.chapter_id == chapter_id,
            ProductionRun.scope_skill_id == scope_skill_id,
            ProductionRun.scope_kind == scope_kind,
        )
        .limit(1)
    )
    if doublon is not None:
        etat = "est en cours" if doublon.status == "running" else "attend son tour"
        raise ProductionRefused(
            "duplicate",
            f"Une production identique {etat} déjà (lot #{doublon.id}). "
            "Inutile de la relancer — elle apparaîtra dès qu'elle sera prête.",
        )

    # …et le contenu est peut-être DÉJÀ LÀ (2026-08-05, demande du user).
    #
    # Le lot #28 a tourné 76 ms pour rendre `skipped` : la fiche existait. Comportement juste — on
    # ne régénère jamais (ADR-0021) — mais **muet** : une ligne de plus au Journal, et Papa qui
    # attend un contenu qu'il possède. Le refus se dit maintenant avant l'écriture.
    #
    # ⚠️ **Lots-PIÈCE seulement.** Un lot de chapitre saute ses notions déjà équipées une par une
    # et produit les autres ; le refuser en bloc supprimerait du travail réel.
    #
    # ⚠️ Le prédicat vit dans `equipment`, à côté de ceux qu'`equip_piece` utilise, et les
    # RÉUTILISE. Une seconde lecture « qui donne le même résultat » divergerait au premier
    # générateur ajouté (défaut nommé par l'ADR-0037), et l'écran refuserait alors ce que le lot
    # aurait produit.
    if piece_scope:
        from app.modules.production.equipment import piece_deja_produite
        from app.modules.settings import service as settings_service

        deja = piece_deja_produite(
            db,
            skill_id=scope_skill_id,
            kind=scope_kind,
            # Même source que le lot : `authority_for` répond `None` quand A0a = 2 (ZETIS produit,
            # Papa valide). Dans ce régime, valider une pièce `pending` n'est pas au programme du
            # lot — donc il n'aurait vraiment rien à faire.
            peut_valider=settings_service.derivatives_are_served(db),
        )
        if deja is not None:
            raise ProductionRefused(
                "already_produced",
                f"{deja} Relancer une production ne la remplacerait pas.",
            )

    backlog = pending_backlog(db)
    if backlog >= settings.production_max_pending:
        raise ProductionRefused(
            "pending_backlog",
            f"{backlog} contenus attendent déjà votre relecture "
            f"(plafond : {settings.production_max_pending}). "
            "Validez-en une partie avant de lancer une nouvelle production.",
        )

    # Le régulateur de VOLUME ne s'applique qu'aux lots que personne n'a demandés (ADR-0035 §4) —
    # et il en existe DEUX, un par nature d'origine (ADR-0036 §5). Quand Papa clique, ni l'un ni
    # l'autre ne s'applique : le geste EST le régulateur (ADR-0032 §5).
    if trigger == "request":
        recent = request_runs_in_window(db)
        if recent >= settings.production_request_max_runs:
            raise ProductionRefused(
                "request_volume",
                f"{recent} contenus déjà produits sur demande ces "
                f"{settings.production_auto_window_days} derniers jours "
                f"(plafond : {settings.production_request_max_runs}).",
            )
    elif trigger != "manual":
        recent = auto_runs_in_window(db)
        if recent >= settings.production_auto_max_runs:
            raise ProductionRefused(
                "auto_volume",
                f"{recent} productions automatiques ces "
                f"{settings.production_auto_window_days} derniers jours "
                f"(plafond : {settings.production_auto_max_runs}).",
            )

    student = db.scalar(select(StudentProfile).order_by(StudentProfile.id))
    if student is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Aucun profil élève.")

    run = ProductionRun(
        student_id=student.id,
        trigger=trigger,
        authorized_by=authorized_by,
        status="queued",
        chapter_id=chapter_id,
        scope_skill_id=scope_skill_id,
        scope_kind=scope_kind,
        created_at=datetime.now(timezone.utc),
    )
    if column is not None:
        setattr(run, column, reference_id)
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def enqueue_or_cancel(db: Session, run: ProductionRun, *, trigger: str | None = None) -> str:
    """Enfile ce lot — ou le **SUPPRIME** et laisse remonter `QueueUnavailable` (ADR-0041 §10.1).

    ## Le trou que cette fonction ferme, et pourquoi la compensation est le seul remède

    `create_run` **commite** son lot (juste au-dessus) avant que quiconque ait pu l'enfiler. Redis
    absent ⇒ un `ProductionRun` en `queued` restait en base pour toujours, pendant qu'un 500 partait
    vers le navigateur. Papa recliquait ; le lot fantôme, lui, faisait échouer le régulateur
    d'idempotence (`run_exists_for`) et bloquait la vraie création le jour où Redis revenait.

    ⚠️ **On ne peut PAS simplement inverser l'ordre.** Le lot doit exister en base avant d'être
    enfilé : le worker peut le prendre dans la milliseconde, et il a besoin de le lire. C'est la
    même contrainte que pour un `AIJob` (§3). Le remède n'est donc pas un ordre différent mais une
    **compensation** : si la file refuse, ce qui vient d'être écrit est effacé.

    ⚠️ **`delete` et non `status = "failed"`.** Un lot en échec est un lot qui a TENTÉ quelque
    chose — il a un journal, il s'acquitte, il compte dans les régulateurs de volume. Un lot jamais
    parti n'a rien tenté du tout ; le laisser en base sous un autre statut ferait porter à
    l'historique de production un événement qui n'a pas eu lieu.

    Renvoie l'id du job RQ. Le `trigger` par défaut est celui du lot — le préciser ne sert qu'aux
    appelants qui en connaissent un plus juste (le scan, qui distingue `agenda` de `request`).
    """
    from app.core.queue import QueueUnavailable, enqueue_production

    try:
        return enqueue_production(run.id, trigger=trigger or run.trigger)
    except QueueUnavailable:
        db.delete(run)
        db.commit()
        raise


def _duree_attendue(db: Session, run: ProductionRun) -> int:
    """Combien de temps ce lot devrait prendre — la MESURE du serveur, pas une devinette (§9).

    Un lot-pièce vaut son générateur ; un lot de chapitre vaut N équipements de notion. La table
    de correspondance vit dans `activity`, qui la porte déjà pour la même raison.
    """
    from app.modules.ai.travaux import estimation_ms, estimations
    from app.modules.production.activity import PIECE_VERS_TYPE

    connues = estimations(db)
    if run.scope_skill_id is not None:
        return estimation_ms(connues, PIECE_VERS_TYPE.get(run.scope_kind or "", ""))
    return estimation_ms(connues, "equip_notion") * max(1, run.total_notions or 1)


def run_out(db: Session, run: ProductionRun) -> dict:
    """Vue d'un run pour le suivi Papa. Aucun contenu, aucun verbatim — un état."""
    # ⚠️ **`run_status()` et non `run.status`** (ADR-0041 §1) — correction, pas fonctionnalité.
    # Le Journal savait déjà dire `stale` ; cette vue rendait le statut brut, donc un lot zombie
    # apparaissait `running` dans l'en-tête, indiscernable d'un lot vivant. Deux lectures du même
    # état qui ne disaient pas la même chose.
    from app.modules.production import journal

    return {
        "id": run.id,
        "status": journal.run_status(run),
        "trigger": run.trigger,
        "authorized_by": run.authorized_by,
        "chapter_id": run.chapter_id,
        # Le scope de pièce voyage avec le lot : sans lui, un lot-pièce s'afficherait « sans
        # chapitre », c'est-à-dire comme un lot cassé (ADR-0036 §2).
        "scope_skill_id": run.scope_skill_id,
        "scope_kind": run.scope_kind,
        # Le NOM en plus de l'id — un lot qui annonce « une fiche sur la notion 17 » ne se lit pas.
        # Une requête, et seulement quand le lot porte un scope de pièce.
        "scope_skill_name": (
            db.scalar(select(Skill.name).where(Skill.id == run.scope_skill_id))
            if run.scope_skill_id
            else None
        ),
        "total_notions": run.total_notions,
        "done_notions": run.done_notions,
        # ⚠️ **La durée attendue, MESURÉE** (ADR-0041 §9) — ajoutée le 2026-08-06 pour réparer une
        # régression que la slice C venait d'introduire : les composants ont cessé d'estimer en dur,
        # or cette vue-ci ne portait pas de quoi estimer. Un lot-PIÈCE retrouvé au retour sur la
        # page perdait donc sa barre. Sur un lot de chapitre, le serveur mesure vraiment
        # (`progress_pct`) et ce champ ne sert pas — il est calculé quand même : deux vues du même
        # lot qui ne portent pas les mêmes champs finissent par diverger.
        "estimated_ms": _duree_attendue(db, run),
        # Pourcentage RÉEL, calculé serveur. L'estimation client (`KIT_MS_PER_NOTION`) mentait
        # d'un facteur 2 — mesuré le 2026-08-02 : 69 s par notion contre 150 s estimées. Une barre
        # qui progresse au vrai rythme vaut mieux qu'une barre qui devine.
        "progress_pct": (
            round(100 * (run.done_notions or 0) / run.total_notions)
            if run.total_notions
            else (100 if run.status == "done" else 0)
        ),
        "created_at": run.created_at,
        # ⚠️ **`started_at` n'est pas un ornement : il est ce qui rend l'avancement CONTINU.**
        # Sur un lot-pièce le serveur n'a aucune granularité (une notion : 0 % du début à la fin),
        # l'écran estime donc — et une estimation qui démarre au montage du composant repart de
        # zéro à chaque navigation. Papa revenait sur la page Demandes et voyait « 0 % » d'une
        # production commencée depuis une minute. Avec l'instant de départ, l'estimation se
        # calcule sur le TEMPS ÉCOULÉ, pas sur l'âge de l'affichage.
        "started_at": run.started_at,
        "finished_at": run.finished_at,
    }


def get_run(db: Session, run_id: int) -> ProductionRun:
    run = db.get(ProductionRun, run_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Lot introuvable.")
    return run


def preview(db: Session, *, chapter_id: int) -> dict:
    """Ce qu'un lot ferait sur ce chapitre, SANS rien créer (ADR-0031 slice C).

    Le gate doit être visible **avant** le clic. Sans cet aperçu, Papa presse un bouton et reçoit
    « rien produit » sur un chapitre neuf : il lirait un échec là où il y a un gate qui fonctionne.

    Lecture pure — `scope.plan` + `runner.select_notions`, déjà écrits et testés. Rien n'est
    réimplémenté ici, et surtout aucun run n'est créé.
    """
    from app.modules.production import runner, scope
    from app.modules.settings import service as settings_service

    chapter = db.get(Chapter, chapter_id)
    if chapter is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Chapitre introuvable.")

    # Le MÊME gate que l'exécution (ADR-0032). Un aperçu qui appliquerait le gate quand le lot ne
    # l'applique pas annoncerait « rien à produire » sur un chapitre que ZETIS équiperait
    # entièrement — c'est la seule façon pour cet écran de mentir.
    eligible_ids, blocked = runner.select_notions(
        db,
        scope.plan(db, chapter_id=chapter_id),
        require_validated_course=settings_service.course_gate_enabled(db),
    )

    # Le NOM en plus de l'id : une liste d'ids ne se lit pas.
    names = dict(
        db.execute(
            select(Skill.id, Skill.name).where(
                Skill.id.in_(eligible_ids + [b["skill_id"] for b in blocked])
            )
        ).all()
    )
    backlog = pending_backlog(db)
    return {
        "chapter_id": chapter_id,
        "eligible": [{"skill_id": i, "name": names.get(i, f"notion {i}")} for i in eligible_ids],
        "blocked": [
            {"skill_id": b["skill_id"], "name": names.get(b["skill_id"], ""), "reason": b["reason"]}
            for b in blocked
        ],
        # Pour que le bouton puisse dire POURQUOI il refuse, avant d'essayer.
        "pending_backlog": backlog,
        "max_pending": settings.production_max_pending,
    }


def active_run(db: Session) -> ProductionRun | None:
    """Le lot en cours, s'il y en a un. `None` sinon.

    ⚠️ Rend un **processus**, jamais un **stock**. L'indicateur qui le consomme ne doit à aucun
    moment devenir un compteur d'arriéré : « 12 contenus non contrôlés » affiché en permanence est
    exactement ce que l'addendum ADR-0011 §F.2 interdit — la provenance est un fait, jamais un
    reproche, et elle ne se totalise pas. Ici on dit « ça travaille », pas « vous êtes en retard ».
    """
    return db.scalar(
        select(ProductionRun)
        .where(ProductionRun.status.in_(("queued", "running")))
        .order_by(ProductionRun.id.desc())
        .limit(1)
    )
