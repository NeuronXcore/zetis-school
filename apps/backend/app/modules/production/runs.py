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
    TRIGGER_REFERENCE,
    TRIGGERS,
)

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
    """
    since = (now or datetime.now(timezone.utc)) - timedelta(
        days=settings.production_auto_window_days
    )
    return db.scalar(
        select(func.count(ProductionRun.id)).where(
            ProductionRun.trigger != "manual", ProductionRun.created_at >= since
        )
    ) or 0


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
    chapter_id: int,
    trigger: str = "manual",
    authorized_by: str = "parent_direct",
    reference_id: int | None = None,
) -> ProductionRun:
    """Crée un lot sur un chapitre. Refuse si l'arriéré déborde — ou si le volume auto est atteint.

    Le régulateur REFUSE et le DIT — il ne tronque pas silencieusement. Une production qui dépasse
    durablement la capacité de relecture fabrique une dette qui tue le dispositif (ADR-0023 §5).

    `trigger` / `authorized_by` / `reference_id` (ADR-0035 §3) — les défauts sont ceux du geste de
    Papa : **les appelants existants ne changent pas d'un caractère**.

    ⚠️ **Cette fonction lève des `HTTPException`.** C'est juste dans une requête, ça ne l'est pas
    dans un job RQ : le scan automatique **rattrape et journalise**, il ne laisse pas remonter un
    code de statut vers personne (voir `triggers.scan_agenda`).
    """
    if trigger not in TRIGGERS:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Déclencheur inconnu : {trigger}."
        )
    if trigger not in EMITTED_TRIGGERS:
        # Le modèle anticipe, le code n'anticipe pas : une valeur légale mais non émise doit être
        # refusée tant que son ADR n'existe pas (patron `content_kind`, patron `parent_rule`).
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Le déclencheur « {trigger} » est modélisé mais pas encore émis.",
        )
    if authorized_by not in AUTHORIZED_BY:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Autorité inconnue : {authorized_by}."
        )

    # « Exactement une FK, cohérente avec `trigger` » — la règle que l'ADR-0031 §4 a confiée au
    # service et qui n'avait aucun cas à valider tant que seul `manual` était émis.
    column = TRIGGER_REFERENCE[trigger]
    if column is None and reference_id is not None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Le déclencheur « {trigger} » ne référence rien.",
        )
    if column is not None and reference_id is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Le déclencheur « {trigger} » exige une référence ({column}).",
        )
    # Ménage opportuniste AVANT tout le reste : un lot zombie fausserait `GET /active` et ferait
    # croire à une production en cours (ADR-0034 §2).
    close_stale_runs(db)

    chapter = db.get(Chapter, chapter_id)
    if chapter is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Chapitre introuvable.")

    backlog = pending_backlog(db)
    if backlog >= settings.production_max_pending:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=(
                f"{backlog} contenus attendent déjà votre relecture "
                f"(plafond : {settings.production_max_pending}). "
                "Validez-en une partie avant de lancer une nouvelle production."
            ),
        )

    # Le régulateur de VOLUME ne s'applique qu'aux lots que personne n'a demandés (ADR-0035 §4).
    if trigger != "manual":
        recent = auto_runs_in_window(db)
        if recent >= settings.production_auto_max_runs:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail=(
                    f"{recent} productions automatiques ces "
                    f"{settings.production_auto_window_days} derniers jours "
                    f"(plafond : {settings.production_auto_max_runs})."
                ),
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
        created_at=datetime.now(timezone.utc),
    )
    if column is not None:
        setattr(run, column, reference_id)
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def run_out(db: Session, run: ProductionRun) -> dict:
    """Vue d'un run pour le suivi Papa. Aucun contenu, aucun verbatim — un état."""
    return {
        "id": run.id,
        "status": run.status,
        "trigger": run.trigger,
        "authorized_by": run.authorized_by,
        "chapter_id": run.chapter_id,
        "total_notions": run.total_notions,
        "done_notions": run.done_notions,
        # Pourcentage RÉEL, calculé serveur. L'estimation client (`KIT_MS_PER_NOTION`) mentait
        # d'un facteur 2 — mesuré le 2026-08-02 : 69 s par notion contre 150 s estimées. Une barre
        # qui progresse au vrai rythme vaut mieux qu'une barre qui devine.
        "progress_pct": (
            round(100 * (run.done_notions or 0) / run.total_notions)
            if run.total_notions
            else (100 if run.status == "done" else 0)
        ),
        "created_at": run.created_at,
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
