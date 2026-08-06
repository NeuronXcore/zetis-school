"""Exécution d'un lot de production (ADR-0031 §3, addendum « le gate vit dans la sélection »).

Ce module est ce que le worker exécute. Il ne génère rien lui-même : il **sélectionne**, appelle
`equipment.equip_notion` notion par notion, et tient le journal.

Trois règles, et ce sont trois refus :

1. **Le gate du §7 est une SÉLECTION.** On n'équipe que les notions dont la leçon est déjà
   `validated` ET porte un contenu. Les autres sont rendues **bloquées avec leur motif**, jamais
   omises en silence. `equip_notion` n'est pas modifié : ses deux chemins d'auto-validation du
   cours deviennent simplement inatteignables depuis un lot.
2. **« Massimo passe devant » se décide ENTRE deux notions.** Un appel LLM en cours n'est pas
   préemptible — prétendre l'interrompre serait un mensonge d'architecture. Le grain de la
   préemption est la notion.
3. **L'ordre suit la priorité d'évidence.** C'est ce qui rend un lot interrompu à 60 % utile : les
   60 % faits sont les notions les plus fragiles. La dégradation n'est pas un ajout, c'est l'ordre.
"""

import logging
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import (
    Fiche,
    LearningEvent,
    Lesson,
    LessonSkill,
    Mindmap,
    ProductionEvent,
    ProductionRun,
    Quiz,
    SpacedReviewCard,
)
from app.modules.activity.events import NON_WORK_EVENTS
from app.modules.ai.provider import EmbeddingProvider, LLMProvider
from app.modules.lesson_resolution import lessons_by_skill, lessons_of_skill

logger = logging.getLogger(__name__)

# Les tables que l'équipement écrit. Sert au tamponnage `production_run_id` par filigrane d'id :
# tout ce qui naît pendant l'équipement d'une notion appartient à ce run. C'est exact, et ça évite
# de toucher `equip_notion` — que l'addendum interdit de modifier.
_PRODUCED = (Lesson, Fiche, Mindmap, Quiz, SpacedReviewCard)

# Les motifs, dans la forme **état + geste** : ce qui manque en tête, ce qu'il y a à faire ensuite.
#
# ⚠️ **Réécrits le 2026-08-04, sur un « pas clair du tout ».** Les précédents disaient POURQUOI
# ZETIS s'était abstenu, dans son vocabulaire à lui — « à ce palier », « à votre place ». Deux
# défauts en une phrase : *palier* est un mot d'ADR que l'écran n'emploie nulle part (il dit
# *Manual · Hybrid · Autonom*), et *à votre place* se lit comme un reproche alors qu'il s'agit d'un
# réglage que Papa a choisi. Aucun des deux ne disait ce qu'il y avait à FAIRE.
#
# ⚠️ **Le régime n'est pas nommé dans le texte**, volontairement : ces phrases sont **écrites au
# journal** (`production_events.detail`) et n'en bougent plus. Y figer « Manual » ferait mentir la
# ligne le jour où le nom d'affichage change — il a déjà changé une fois, le 2026-08-04.
BLOCKED_NO_LESSON = "Notion sans leçon — rien à quoi rattacher un cours."
BLOCKED_COURSE_PENDING = "Cours à relire — il est écrit, il attend votre validation."
# ⚠️ **Deux motifs là où il y en avait un** (addendum ADR-0036 « verdict de situation »). L'ancien
# disait « à valider » d'une leçon souvent DÉJÀ validée — seulement vide. `Lesson.status` porte deux
# sens : « cette leçon fait partie du programme validé » (ce qu'écrit `validate_all_lessons`, qui
# passe en `validated` toutes les `draft` d'un chapitre sans regarder s'il y a un texte) et « le
# texte du cours est validé » (ce que lit la production). Mesuré le 2026-08-04 sur la base de dev :
# **39 leçons validées sans une ligne de contenu** contre 28 rédigées — le motif était donc faux
# dans la majorité des cas où il s'affichait.
BLOCKED_COURSE_MISSING = (
    "Cours à écrire — dans le réglage actuel, c'est vous qui rédigez les cours."
)


def _max_ids(db: Session) -> dict[str, int]:
    """Filigrane : le dernier id de chaque table produite, avant d'équiper."""
    return {
        model.__tablename__: (db.scalar(select(func.max(model.id))) or 0) for model in _PRODUCED
    }


def _stamp(db: Session, watermark: dict[str, int], run_id: int) -> int:
    """Attribue au run tout ce qui est né depuis le filigrane. Renvoie le nombre de pièces."""
    stamped = 0
    for model in _PRODUCED:
        rows = db.scalars(
            select(model).where(model.id > watermark[model.__tablename__])
        ).all()
        for row in rows:
            row.production_run_id = run_id
            stamped += 1
    return stamped


def _stamp_course(db: Session, *, skill_id: int, run_id: int) -> None:
    """Attribue au lot le COURS que ZETIS vient de rédiger — ce que le filigrane ne peut pas voir.

    ⚠️ **Trou trouvé le 2026-08-02, en écrivant les tests du Journal.** `_stamp` attribue les
    lignes **nées** depuis le filigrane ; or `equip_notion` ne crée jamais de `Lesson` — il écrit
    du contenu dans une ligne **préexistante** (le référentiel a créé la leçon bien avant). `Lesson`
    figurait donc dans `_PRODUCED` sans jamais pouvoir y être attribuée.

    Sans ce tamponnage, **le veto sur le cours n'aurait identifié aucun cours** — c'est-à-dire
    exactement la classe (A1) dont le palier 3 justifie tout le chantier d'autonomisation.

    Appelé **uniquement** quand `equip_notion` a rapporté `cours` dans `generated` : c'est la seule
    situation où ZETIS a écrit le texte. Un cours que Papa avait rédigé, ou seulement validé en
    lot, n'appartient à aucun lot — et ne doit pas être retirable par le veto.
    """
    # ⚠️ MÊME résolveur que `select_notions` et `equip_notion` (ADR-0037). Trois copies de la même
    # requête vivaient ici ; si l'une avait dérivé, le tampon serait posé sur une AUTRE leçon que
    # celle qu'on vient d'écrire — et le veto n'aurait plus rien à retirer.
    lecons = lessons_of_skill(db, skill_id)
    lesson = lecons[0] if lecons else None
    if lesson is not None and lesson.production_run_id is None:
        lesson.production_run_id = run_id


def _record(
    db: Session,
    *,
    run_id: int,
    skill_id: int | None,
    piece: str | None,
    outcome: str,
    detail: str | None = None,
) -> None:
    """Ajoute une ligne au journal. **Pas de commit** — l'appelant commite (ADR-0034 §1).

    Le patron vient de `log_learning_event` : l'événement vit dans la MÊME transaction que l'acte
    qu'il trace. Commiter ici ferait survivre un journal à un acte annulé, ou l'inverse.
    """
    db.add(
        ProductionEvent(
            run_id=run_id,
            skill_id=skill_id,
            piece=piece,
            outcome=outcome,
            detail=detail,
            created_at=datetime.now(timezone.utc),
        )
    )


def _record_notion(db: Session, *, run_id: int, result: dict) -> None:
    """Traduit UN retour d'`equip_notion` en lignes de journal.

    ⚠️ Aucune information nouvelle n'est calculée ici : `generated` / `skipped` / `errors` sont
    exactement ce que l'orchestrateur renvoyait déjà et que `execute` jetait. Le `reason` de
    niveau notion (« Aucune leçon rattachée », « Cours indisponible ») remplit le `detail` des
    pièces qu'il explique — une seule forme de ligne, jamais deux.
    """
    skill_id = result.get("skill_id")
    reason = result.get("reason")
    for piece in result.get("generated", []):
        _record(db, run_id=run_id, skill_id=skill_id, piece=piece, outcome="generated")
    for piece in result.get("skipped", []):
        _record(
            db, run_id=run_id, skill_id=skill_id, piece=piece, outcome="skipped", detail=reason
        )
    for err in result.get("errors", []):
        _record(
            db,
            run_id=run_id,
            skill_id=skill_id,
            piece=err.get("piece"),
            outcome="error",
            detail=err.get("message"),
        )


def _close_served_requests(db: Session) -> None:
    """Referme les demandes que ce lot vient de satisfaire (ADR-0036 §4).

    ⚠️ **Appelé UNIQUEMENT sur le chemin de succès.** Un lot en échec ne ferme rien : la demande
    reste `pending` et redeviendra éligible. C'est la moitié de la décision qui protège Massimo
    d'un « c'est prêt » sur du vide.

    ⚠️ **Et il n'a pas le droit de faire tomber le lot.** La production a réussi ; une passe de
    ménage qui échouerait (année scolaire inactive, notion devenue invisible) ne doit pas
    transformer ce succès en `failed` et effacer du journal ce qui a réellement été produit.
    """
    from app.modules.content_requests import service as content_requests

    try:
        closed = content_requests.close_available_requests(db)
    except Exception:  # noqa: BLE001 — le ménage ne commande pas le sort du lot
        logger.exception("production: fermeture des demandes servies impossible")
        return
    if closed:
        logger.info("production: demandes refermées par disponibilité — %s", closed)


def massimo_is_active(db: Session, *, student_id: int) -> bool:
    """Massimo a-t-il une activité PÉDAGOGIQUE récente ?

    `NON_WORK_EVENTS` est exclu : cocher une case d'agenda n'est pas une session de travail
    (ADR-0025 §3), **et se connecter ou ouvrir une page non plus**.

    ⚠️ **Corrigé le 2026-08-03.** Cette fonction ne filtrait que `NON_ACTIVITY_EVENTS`, alors que
    le module agenda avait déjà tranché en privé que la navigation n'est pas du travail. Mesuré en
    vrai : **un simple `login` suffisait à la faire répondre « il travaille »** pendant cinq
    minutes. Anodin pour un lot que Papa venait de demander (il attendait entre deux notions) ;
    bloquant depuis l'ADR-0035 §7, où la réponse décide si un lot AUTOMATIQUE démarre — un réveil
    entier du scan sautait.

    ⚠️ **La transaction est refermée avant de rendre**, et ce n'est pas de l'hygiène décorative.
    Observé en vrai le 2026-08-02 : sans ce `rollback`, la session du worker reste `idle in
    transaction` entre deux notions, garde un `AccessShareLock` sur les tables lues, et **un
    `ALTER TABLE` attend derrière — puis TOUTES les autres requêtes s'empilent derrière l'ALTER**.
    Un lot d'une heure gelait ainsi toute migration et, en cascade, le sondage de l'en-tête Papa.
    Une lecture qui n'écrit rien ne doit pas laisser de transaction ouverte.
    """
    since = datetime.now(timezone.utc) - timedelta(
        minutes=settings.production_pause_if_active_minutes
    )
    try:
        return bool(
            db.scalar(
                select(LearningEvent.id)
                .where(
                    LearningEvent.student_id == student_id,
                    LearningEvent.created_at >= since,
                    LearningEvent.event_type.not_in(tuple(NON_WORK_EVENTS)),
                )
                .limit(1)
            )
        )
    finally:
        db.rollback()  # lecture pure : on ne garde aucun verrou entre deux notions


def _wait_for_massimo(db: Session, *, student_id: int) -> None:
    """Attend que Massimo ait fini, dans une borne. Appelé ENTRE deux notions, jamais pendant.

    Bornée : sans ça, une longue session laisserait un run « running » indéfiniment. Passé le
    plafond, le lot reprend — on préfère un lot qui finit à un lot qui attend pour toujours.
    """
    deadline = time.monotonic() + settings.production_max_wait_minutes * 60
    while massimo_is_active(db, student_id=student_id):
        if time.monotonic() >= deadline:
            logger.info("production: attente de Massimo bornée atteinte, le lot reprend")
            return
        time.sleep(20)
        db.expire_all()  # sans ça, la session relirait son cache et n'verrait jamais la fin


def select_notions(
    db: Session, skill_ids: list[int], *, require_validated_course: bool = True
) -> tuple[list[int], list[dict]]:
    """LE GATE DU §7 (addendum ADR-0031). Sépare ce qui est équipable de ce qui est bloqué.

    Équipable = la notion a une leçon `validated` AVEC contenu. Tout le reste est **rendu**, avec
    son motif : une notion silencieusement omise se lirait comme un échec de production, alors que
    c'est un gate qui fonctionne.

    `require_validated_course=False` (palier 3 d'A1, ADR-0032) **retire le gate, et rien d'autre**.
    Les notions sans cours validé redeviennent éligibles ; `equip_notion` retrouve alors ses deux
    chemins de rédaction/validation, qui n'ont jamais été supprimés — seulement rendus
    inatteignables. **Aucune ligne de l'orchestrateur ne bouge**, ce qui est exactement ce que
    l'addendum avait préservé.

    ⚠️ Une notion **sans aucune leçon** reste bloquée à tous les paliers : il n'y a rien à quoi
    rattacher un cours. Ce n'est pas un gate, c'est une absence de support.
    """
    motifs = blockers_for(db, skill_ids, require_validated_course=require_validated_course)

    eligible: list[int] = []
    blocked: list[dict] = []
    for skill_id in skill_ids:
        motif = motifs[skill_id]
        if motif is None:
            eligible.append(skill_id)
        else:
            blocked.append({"skill_id": skill_id, "reason": motif})
    return eligible, blocked


def blockers_for(
    db: Session, skill_ids: list[int], *, require_validated_course: bool = True
) -> dict[int, str | None]:
    """Pour chaque notion : le motif qui l'écarterait d'un lot, ou `None` si elle est équipable.

    ⚠️ **C'est le MÊME code que la sélection du lot** — `select_notions` est écrit par-dessus. C'est
    la condition pour que l'aperçu ne mente pas : une seconde lecture « qui donne le même résultat »
    diverge le jour où l'une des deux bouge (leçon de l'ADR-0037, où trois modules répondaient
    différemment à « quelle est LA leçon de cette notion »).

    Sert deux appelants aux besoins opposés, et c'est pour ça qu'il rend un **dictionnaire** :
    l'exécution veut deux listes (équipable / bloqué), la page Demandes veut le motif d'UNE notion
    précise. Aucun des deux ne reformate le travail de l'autre.

    ⚠️ UNE requête pour tout le lot (ADR-0037), là où il y en avait une PAR NOTION. Un chapitre de
    31 notions coûtait 31 allers-retours avant même de commencer à produire — et la page Demandes
    en aurait fait un par ligne de la file.
    """
    par_notion = lessons_by_skill(db, skill_ids)
    motifs: dict[int, str | None] = {}
    for skill_id in skill_ids:
        lecons = par_notion.get(skill_id, [])
        lesson = lecons[0] if lecons else None
        if lesson is None:
            motifs[skill_id] = BLOCKED_NO_LESSON
        elif not require_validated_course:
            motifs[skill_id] = None
        elif not lesson.content_markdown:
            # Vide AVANT non-validé : une leçon sans texte est vide quel que soit son statut, et
            # c'est le cas le plus fréquent (39 contre 28 en base de dev).
            motifs[skill_id] = BLOCKED_COURSE_MISSING
        elif lesson.status != "validated":
            motifs[skill_id] = BLOCKED_COURSE_PENDING
        else:
            motifs[skill_id] = None
    return motifs


def authority_for(db: Session, run: ProductionRun) -> "str | None":
    """La provenance à écrire sur ce lot — et elle ne dépend PAS que du palier.

    ⚠️ **Correction d'une hypothèse de l'ADR-0032**, trouvée au read-before-code. L'ADR annonçait
    « au palier 3, la provenance est `parent_rule` ». C'est faux tant que Papa clique : le §G.1
    définit `parent_rule` comme « aucun humain n'a ouvert la pièce **ni cliqué pour ce lot** ». Un
    lot lancé depuis la Couverture EST un clic — sa provenance juste reste `parent_bulk`, même à
    A1 = 3.

    Deux questions, deux sources, et c'est déjà modélisé :

    - **le palier** dit si ZETIS a le droit de servir sans relecture (`A0a`, `A1`) ;
    - **`run.authorized_by`** dit qui a autorisé CE lot — `parent_direct` (un clic) ou
      `parent_rule` (une règle permanente, non émise à ce jour).

    Conséquence : `parent_rule` reste **légale et non émise**, exactement comme le §G l'a posée.
    Elle s'écrira le jour où un lot démarrera sans que personne l'ait demandé.
    """
    from app.modules.provenance import PARENT_BULK, PARENT_RULE
    from app.modules.settings import service as settings_service

    if not settings_service.derivatives_are_served(db):
        return None  # A0a = 2 : ZETIS produit, Papa valide. Rien n'est tamponné.
    return PARENT_RULE if run.authorized_by == "parent_rule" else PARENT_BULK


def execute(
    db: Session, *, run_id: int, llm: LLMProvider, embedder: EmbeddingProvider
) -> dict:
    """Exécute un lot : sélection, équipement notion par notion, journal tenu à jour."""
    from app.modules.production import equipment, scope

    run = db.get(ProductionRun, run_id)
    if run is None:
        raise ValueError(f"production_run {run_id} introuvable")

    run.status = "running"
    # ⚠️ `created_at` n'est pas l'heure de démarrage : le job a attendu en file (concurrence 1).
    # Sans `started_at`, la durée d'un lot inclurait son attente et ne mesurerait rien.
    run.started_at = datetime.now(timezone.utc)
    run.heartbeat_at = run.started_at
    db.commit()

    from app.modules.settings import service as settings_service

    # Les deux paliers se lisent UNE FOIS, au départ du lot (ADR-0032). Les relire entre deux
    # notions ferait changer les règles au milieu d'une partie : un lot doit s'exécuter sous le
    # régime qui l'a autorisé, même si Papa change d'avis pendant qu'il tourne.
    #
    # ⚠️ Et puisqu'ils sont lus ici, ils sont **ÉCRITS sur le lot** (addendum ADR-0034) : le Journal
    # doit pouvoir dire sous quel régime ce lot-là a tourné. Relire les réglages à l'affichage
    # ferait expliquer un lot d'hier par les paliers d'aujourd'hui — un lot que Papa avait relu se
    # lirait « servi sans relecture ». C'est exactement l'instant où l'information est vraie.
    paliers = settings_service.read_autonomy(db)
    run.a0a_level = paliers[settings_service.A0A]
    run.a1_level = paliers[settings_service.A1]
    # ⚠️ La provenance s'écrit ICI, avec la valeur, et jamais ailleurs : `capture` veut dire « le
    # lot l'a enregistré au démarrage », et c'est le seul endroit où c'est vrai. Un lot qui porte
    # cette marque ne se fait JAMAIS réinterpréter par ses artefacts (script de reprise, verrou de
    # test) — sinon la capture ne protégerait plus rien.
    run.zetis_mode_source = "capture"
    gate = settings_service.course_gate_enabled(db)
    authority = authority_for(db, run)

    # LE SCOPE — un chapitre, ou une pièce sur une notion (ADR-0036 §2). C'est la seule branche du
    # runner, et elle ne porte que le PLAN : le gate, l'ordre, le journal, le tamponnage et la
    # préemption restent littéralement les mêmes en dessous.
    #
    # ⚠️ Le gate s'applique AUSSI au lot-pièce, et c'est voulu : une demande de `cours` au palier
    # < 3 est bloquée ici même, avec son motif au journal. ZETIS n'écrit pas un cours à la place de
    # Papa parce que Massimo l'a demandé — c'est le palier qui ouvre cette porte, pas la demande.
    piece_kind = run.scope_kind
    notions = (
        [run.scope_skill_id]
        if piece_kind is not None
        else scope.plan(db, chapter_id=run.chapter_id)
    )
    eligible, blocked = select_notions(db, notions, require_validated_course=gate)
    results: list[dict] = []

    # Avancement : le total est connu APRÈS le gate — c'est le nombre de notions qu'on va
    # réellement équiper, pas celui du plan. Afficher « 3/31 » quand 20 sont bloquées ferait lire
    # un lot en panne là où il a fini.
    run.total_notions = len(eligible)
    run.done_notions = 0
    # Les notions écartées par le gate entrent au journal AVANT toute production (ADR-0034 §1) :
    # un lot interrompu à la première notion doit quand même dire ce qu'il n'allait pas faire.
    for item in blocked:
        _record(
            db,
            run_id=run_id,
            skill_id=item["skill_id"],
            piece=None,
            outcome="blocked",
            detail=item["reason"],
        )
    db.commit()

    try:
        for skill_id in eligible:
            # Entre deux notions — le grain de la préemption (ADR-0031 §3).
            _wait_for_massimo(db, student_id=run.student_id)

            run.current_skill_id = skill_id
            watermark = _max_ids(db)

            # La POSITION dans la notion en vol (addendum 2 ADR-0041 §20 bis). Le journal, lui,
            # n'atterrit qu'à la fin de la notion — sans cette écriture, la barre avancerait d'un
            # pas toutes les 69 s, que l'on compte des notions ou des pièces (`5/155` = `1/31`).
            #
            # ⚠️ **Aucun `commit` ici, et c'est le cœur du dispositif** : les cinq générateurs
            # commitent déjà en interne, donc c'est leur commit qui emporte cette valeur. En
            # ajouter un ferait vivre la position hors de la transaction de l'acte — précisément
            # ce que `_record` refuse de faire pour le journal.
            def _position(piece: str, _run=run) -> None:
                _run.current_piece = piece

            result = (
                equipment.equip_piece(
                    db,
                    skill_id=skill_id,
                    kind=piece_kind,
                    llm=llm,
                    embedder=embedder,
                    authority=authority,
                )
                if piece_kind is not None
                else equipment.equip_notion(
                    db,
                    skill_id=skill_id,
                    llm=llm,
                    embedder=embedder,
                    authority=authority,
                    on_piece=_position,
                )
            )
            result["pieces_stamped"] = _stamp(db, watermark, run_id)
            if "cours" in result.get("generated", []):
                _stamp_course(db, skill_id=skill_id, run_id=run_id)
            run.done_notions = (run.done_notions or 0) + 1
            # La notion est finie : c'est le journal qui porte ses cinq pièces à partir d'ici, et
            # la position doit lâcher — sinon elle serait comptée DEUX fois, une par le journal et
            # une par l'index, et la barre sauterait en avant à chaque notion.
            run.current_piece = None
            # Le battement et le détail vivent dans LE MÊME commit que l'avancement : un lot tué
            # entre les deux laisserait un journal qui ment sur ce qu'il a fait.
            run.heartbeat_at = datetime.now(timezone.utc)
            _record_notion(db, run_id=run_id, result=result)
            db.commit()
            results.append(result)
        run.status = "done"
        _close_served_requests(db)
    except Exception as exc:  # noqa: BLE001 — un lot qui échoue doit le DIRE, pas disparaître
        logger.exception("production: lot %s interrompu", run_id)
        run.status = "failed"
        # L'échec lui-même entre au journal. `skill_id` = la notion en cours, s'il y en avait une :
        # « le lot a échoué » sans dire OÙ oblige à relire les logs du worker.
        _record(
            db,
            run_id=run_id,
            skill_id=run.current_skill_id,
            piece=None,
            outcome="error",
            detail=str(exc),
        )
        raise
    finally:
        run.finished_at = datetime.now(timezone.utc)
        # Plus rien n'est en cours — laisser la dernière notion affichée ferait lire un lot fini
        # comme un lot bloqué dessus.
        run.current_skill_id = None
        run.current_piece = None
        db.commit()

    return {"run_id": run_id, "equipped": results, "blocked": blocked}
