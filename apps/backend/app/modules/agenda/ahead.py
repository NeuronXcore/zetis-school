"""« Prendre de l'avance » — l'agrégat de la troisième question (ADR-0025 Amdt 9).

L'agenda doit répondre à trois questions : *qu'est-ce qui est en retard* (le passé), *qu'est-ce
qu'il y a à faire* (le présent), *comment m'avancer* (le futur). Les deux premières avaient déjà
leur surface ; celle-ci n'en avait aucune depuis que l'Amendement 8 §D8 a retiré « Ce qui arrive ».

🔴 **Ce module ANCRE, il n'inventorie pas.** Il part de la **prochaine échéance** et propose les
gestes qui la préparent — son plan, la mindmap de CE chapitre, les cartes de CE chapitre, la
mission qui touche CETTE notion. La forme alternative (quatre listes empilées, une par source) a
été écartée par le commanditaire, et le motif est le §7 lui-même : **quatre listes de choses à
faire grossissent quand Massimo ne vient pas**, ce qui est la définition du compteur d'arriéré.

🔴 **AUCUN NOMBRE ne sort d'ici.** Ni `days_left`, ni `due_count`, ni score, ni total. Deux pièges
sont signalés dans le code même qu'ils concernent, et ils sont respectés :
  – `due_count` (`memory/schemas.py`) est l'arriéré : on ne lit que le SERVABLE, et seulement
    pour savoir s'il y en a — jamais combien ;
  – `mastery_score` n'atteint jamais Massimo (ADR-0024 §5) : la notion fragile se dérive du
    **statut** `weak`, jamais d'un score.

🔴 **Un geste n'est servi que si sa cible existe** (§B6, *« un bouton mort se lit comme une
panne »*), et c'est le SERVEUR qui tranche — pas le client.

⚠️ **Ce module ne rend AUCUNE route.** La table de routage vit dans `notionRoutes.ts` côté client,
et elle existe précisément pour n'exister qu'une fois : *« la recopier aurait créé un second jeu de
routes, qui aurait divergé au premier correctif »*. On rend donc des **identifiants**, jamais des
chemins.

⚠️ **La frontière du §4 passe ici.** *« ZETIS ne se donne jamais rendez-vous à lui-même »* : le
bloc ne porte AUCUNE date propre, il propose des gestes. La seule date de la réponse est celle de
l'ancre, qui est une échéance scolaire réelle. Les surfaces datées (bande, grille) restent
intactes, et `test_dated_surfaces_never_contain_missions_or_srs_cards` reste l'autorité.
"""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.activity.timeutils import today_local
from app.db.models.agenda import AgendaItem
from app.db.models.content import Mindmap
from app.db.models.progress import SkillMastery
from app.db.models.school import Lesson, LessonSkill, Skill
from app.db.models.user import StudentProfile
from app.modules.agenda import plan as plan_mod
from app.modules.agenda import service
from app.modules.galaxy.service import normalize_status
from app.modules.memory import service as memory_service
from app.modules.missions import service as missions_service

# Les types qu'on prépare EN PRIORITÉ. Un contrôle se prépare sur plusieurs jours et ne se
# rattrape pas la veille — c'est l'arbitrage du commanditaire (« contrôles à préparer, en
# priorité »), et c'est aussi la raison d'être de `UPCOMING_KINDS` au §14.3.
PRIORITAIRES = service.UPCOMING_KINDS

# Le statut galaxy qui vaut « à renforcer ». UN seul, et surtout pas `unknown` : une notion jamais
# rencontrée n'est pas une notion fragile, et la proposer serait un reproche adressé au hasard.
STATUT_FRAGILE = "weak"


def _anchor_item(db: Session, *, student_id: int) -> AgendaItem | None:
    """La prochaine échéance à préparer, ou `None`.

    Strictement APRÈS aujourd'hui : le présent a déjà ses deux sections (« Aujourd'hui »,
    « Demain » — le bloc ne redit pas ce qui est juste au-dessus). Horizon partagé avec
    « ce qui arrive » (`agenda_upcoming_horizon_days`) : deux horizons différents pour la même
    notion de « à venir » divergeraient au premier réglage.
    """
    today = today_local()
    horizon = today + timedelta(days=settings.agenda_upcoming_horizon_days)
    candidats = list(
        db.scalars(
            select(AgendaItem)
            .where(
                AgendaItem.student_id == student_id,
                AgendaItem.due_on > today,
                AgendaItem.due_on <= horizon,
                AgendaItem.done_at.is_(None),
                # ⚠️ `dismissed_at` EST l'archivage : le §2c interdit le DELETE physique, il n'y a
                # donc pas de seconde colonne à filtrer. Chercher un `archived_at` inexistant
                # aurait levé un `AttributeError` au premier appel.
                AgendaItem.dismissed_at.is_(None),
            )
            .order_by(AgendaItem.due_on, AgendaItem.id)
        )
    )
    if not candidats:
        return None
    # Le premier contrôle / rendu prime, même s'il est plus loin qu'un devoir ordinaire.
    for item in candidats:
        if item.kind in PRIORITAIRES:
            return item
    return candidats[0]


def _geste(kind: str, **champs) -> dict:
    """Un geste : son type, ce qu'il désigne, et rien d'autre.

    ⚠️ Pas de `label` : le libellé est de la COPIE, et la copie de cette page vit côté client
    (`AGENDA_KIND_LABEL`, le vocabulaire du `CLAUDE.md`). Le serveur rend de la donnée.
    """
    return {"kind": kind, "detail": None, "mindmap_id": None, "skill_id": None, **champs}


def _geste_plan(db: Session, student: StudentProfile, item: AgendaItem | None) -> dict | None:
    """Le plan de préparation de l'ancre — *« le seul signal d'approche »* (§6).

    ⚠️ `get_or_create_plan` **écrit** (il compose et fige le plan à la première demande). L'effet
    de bord est borné exactement comme pour `/upcoming` : UN item, celui de l'ancre — jamais une
    fenêtre entière. Une grille naïve le déclencherait sur quarante-deux jours.
    """
    if item is None:
        return None
    etapes = plan_mod.get_or_create_plan(db, item)
    return _geste("plan") if etapes else None


def _geste_mindmap(db: Session, student: StudentProfile, item: AgendaItem | None) -> dict | None:
    """Reconstruire la mindmap DE CE CHAPITRE.

    🔴 **Aucun signal « à reconstruire » n'existe côté élève, et on n'en fabrique pas.** Le seul
    matériau qui pourrait en tenir lieu (`attempt_count`, `avg_score`) est explicitement interdit
    chez Massimo par le schéma qui le porte. Le geste proposé est donc une **façon de travailler**,
    pas une dette : « reconstruis la carte de ce chapitre ».

    ⚠️ **Aucun repli vers la matière**, et c'est délibéré à deux titres. Le bloc est *ancré* (§D2) :
    une mindmap d'un autre chapitre n'aide pas à préparer CETTE échéance, elle fait du bruit. Et
    descendre « matière → chapitre » exigerait de joindre `SchoolYearSubject`, ce qui **fait
    disparaître en silence les chapitres rattachés par thème** — `Chapter` a deux parents, tous
    deux nullables. Ce trou a déjà coûté l'ADR-0037 entier, puis `lessons_by_skill`, puis
    l'ADR-0042 : trois fois. Sans ancre, on retombe sur *n'importe quelle* mindmap, ce qui ne
    demande aucune jointure de matière.
    """
    stmt = _mindmaps_validees()
    if item is not None:
        if item.chapter_id is None:
            return None
        carte = db.scalars(
            stmt.where(Lesson.chapter_id == item.chapter_id)
            .order_by(Mindmap.id.desc())
            .limit(1)
        ).first()
        return None if carte is None else _geste("mindmap", mindmap_id=carte.id, detail=_titre(carte))
    return _geste("mindmap") if db.scalars(stmt.limit(1)).first() is not None else None


def _titre(carte: Mindmap) -> str | None:
    """Le titre d'une mindmap est le `center` de son arbre — `Mindmap` n'a **pas** de colonne
    `title`. Un accès direct à `carte.title` lèverait un `AttributeError` au premier appel."""
    arbre = carte.mindmap_json if isinstance(carte.mindmap_json, dict) else {}
    return arbre.get("center") or None


def _mindmaps_validees():
    """Les mindmaps qu'un élève peut ouvrir — le gate `validated` est DANS la requête (§5ter)."""
    return (
        select(Mindmap)
        .join(Lesson, Lesson.id == Mindmap.lesson_id)
        .where(Mindmap.validation_status == "validated", Lesson.status == "validated")
    )


def _geste_revision(db: Session, student: StudentProfile, item: AgendaItem | None) -> dict | None:
    """Revoir ses cartes — de ce chapitre si l'ancre en a un, sinon de n'importe lequel.

    🔴 On lit le **servable**, et seulement pour savoir s'il y en a. `due_count` est l'arriéré :
    `memory/schemas.py` dit lui-même que c'est le nombre à ne jamais montrer à Massimo. Ici on ne
    montre NI l'un NI l'autre — une porte, pas un compte.
    """
    if item is not None and item.chapter_id is not None:
        if memory_service.chapter_servable_count(db, student.id, item.chapter_id) > 0:
            return _geste("revision")
    return _geste("revision") if memory_service.servable_chapters(db, student.id) else None


def _geste_mission(db: Session, student: StudentProfile, item: AgendaItem | None) -> dict | None:
    """La mission qui touche cette notion — ou, à défaut d'ancre, celle du jour.

    ⚠️ **Ceci ne date rien.** Une mission proposée dans un bloc sans date n'est pas un
    rendez-vous : la frontière du §4 tient parce que ni la bande ni la grille ne la reçoivent.
    """
    missions = [m for m in missions_service.list_missions(db, student) if m["status"] != "done"]
    if not missions:
        return None
    if item is not None and item.chapter_id is not None:
        ciblees = [m for m in missions if m.get("chapter_id") == item.chapter_id]
        if ciblees:
            return _geste("mission", detail=ciblees[0]["title"])
    return _geste("mission", detail=missions[0]["title"])


def _geste_renforcer(db: Session, student: StudentProfile, item: AgendaItem | None) -> dict | None:
    """Une notion de ce chapitre encore fragile.

    🔴 **`to_reinforce` n'existe pas côté élève** — il vit derrière `require_parent`
    (`progress/analysis.py`), et il porte des champs (`severity`, `mastery_score`,
    `weak_quiz_signal`) dont aucun n'a le droit d'atteindre Massimo. On dérive donc du **statut**
    galaxy `weak`, seul signal de fragilité que l'ADR-0024 §5 laisse passer — et on rend le NOM de
    la notion, jamais son état chiffré.
    """
    if item is None or item.chapter_id is None:
        return None
    lignes = db.execute(
        select(Skill.id, Skill.name, SkillMastery.status)
        .join(LessonSkill, LessonSkill.skill_id == Skill.id)
        .join(Lesson, Lesson.id == LessonSkill.lesson_id)
        .outerjoin(
            SkillMastery,
            (SkillMastery.skill_id == Skill.id) & (SkillMastery.student_id == student.id),
        )
        .where(Lesson.chapter_id == item.chapter_id, Lesson.status == "validated")
        .order_by(Skill.id)
    ).all()
    for skill_id, nom, statut in lignes:
        if normalize_status(statut) == STATUT_FRAGILE:
            return _geste("renforcer", skill_id=skill_id, detail=nom)
    return None


#: Le registre — un geste, une fonction. Recopié du patron `NEWS_SOURCES` (`news/service.py`),
#: **jamais greffé dessus** : la doctrine de `news/summary` interdit d'y compter du DÛ (un témoin
#: de nouveauté meurt d'un regard, une dette grossit quand Massimo ne vient pas).
#:
#: L'ORDRE est celui du rendu, et il n'est pas neutre : le plan d'abord (c'est le seul geste que
#: ZETIS a déjà composé pour cette échéance), les activités ensuite, la notion fragile en dernier
#: — on propose de travailler avant de désigner ce qui manque.
GESTES = {
    "plan": _geste_plan,
    "mindmap": _geste_mindmap,
    "revision": _geste_revision,
    "mission": _geste_mission,
    "renforcer": _geste_renforcer,
}


def _echeance_a_signaler(
    db: Session, *, student: StudentProfile, today
) -> AgendaItem | None:
    """L'échéance que la fenêtre désigne — **une seule définition, deux appelants**.

    `late_alert()` la lit pour l'afficher ; `mark_late_alert_seen()` la rejoue quand le client
    n'a pas dit laquelle il a montrée. Deux requêtes séparées auraient divergé au premier réglage,
    et cette divergence-ci se serait payée en échéances perdues ou répétées.
    """
    return db.scalars(
        select(AgendaItem)
        .where(
            AgendaItem.student_id == student.id,
            AgendaItem.due_on < today,
            # ⚠️ **`>=` et non `>`** : une échéance due le jour même du plancher n'était pas encore
            # en retard ce jour-là (`due_on < today` était faux). L'exclure la rendrait invisible
            # pour toujours — un trou d'une journée dans le filet. Vérifié par un test de borne,
            # et confirmé par une relecture paire.
            AgendaItem.due_on >= student.agenda_late_alert_floor,
            AgendaItem.done_at.is_(None),
            AgendaItem.dismissed_at.is_(None),
        )
        # La plus ANCIENNE des nouvelles : c'est celle qu'on peut encore rattraper le plus tôt.
        .order_by(AgendaItem.due_on, AgendaItem.id)
        .limit(1)
    ).first()


def late_alert(db: Session, *, student: StudentProfile) -> dict | None:
    """L'échéance à signaler à l'ouverture de la page, ou `None` (Amdt 9 §D12).

    Deux conditions, et **chacune a sa date** — il en faut deux, pas une :

    1. **Du NOUVEAU retard** — une échéance dont la date est tombée *depuis* la dernière alerte.
       Une échéance déjà signalée ne revient jamais : un enfant qui n'arrive pas à rattraper ne
       verra pas le même toast tous les jours.
    2. **Pas deux fois le même jour.**

    🔴 **Rien n'est enregistré PAR ITEM, et c'est le cœur du dispositif.** Le commentaire
    d'`agenda_last_seen_at` interdit la marque par item : jointe à `done_at`, elle fabriquerait la
    donnée persistée « vu le 12, jamais fait », lisible côté Papa — la surveillance par la porte de
    service. *La granularité EST la protection.*

    🔴 **Aucun nombre ne sort d'ici** : UNE échéance, la plus ancienne des nouvelles. Le compteur
    d'arriéré du §7 est le seul interdit qui n'a pas bougé de la journée.

    ⚠️ Premier passage (`agenda_late_alert_on` à `NULL`) : **rien**. Sans plancher, toute l'histoire
    scolaire deviendrait « nouvelle » d'un coup, et l'alerte inaugurerait la fonctionnalité par
    l'arriéré complet — l'inverse exact de ce que le §D12 décide.
    """
    today = today_local()
    if student.agenda_late_alert_floor is None:
        # On pose le plancher SANS alerter : à partir de maintenant, seules les dates qui tombent
        # comptent. Le passé antérieur ne sera jamais signalé, et c'est voulu.
        student.agenda_late_alert_floor = today
        db.commit()
        return None
    # « Pas deux fois le même jour » — c'est l'AUTRE date, et les confondre coûtait des échéances.
    if student.agenda_late_alert_on is not None and student.agenda_late_alert_on >= today:
        return None

    item = _echeance_a_signaler(db, student=student, today=today)
    if item is None:
        return None

    # 🔴 **La lecture ne CONSOMME pas l'alerte.** Marquer ici, sur un GET, la perdrait à la
    # moindre requête qui n'aboutit pas à l'écran — et React réinvoque les effets en double en
    # développement, ce qui suffirait à l'escamoter. C'est le client qui accuse réception une fois
    # le toast RÉELLEMENT affiché (`POST /late-alert/seen`), sur le patron de `markAgendaSeen`.
    # Dégradation si l'accusé n'arrive pas : l'alerte se répète dans la même journée. C'est
    # gênant, ce n'est pas faux — l'inverse (une alerte avalée) serait faux.
    subjects = service.subjects_index(db)
    return {
        "item_id": item.id,
        "label": item.label,
        "kind": item.kind,
        "due_on": item.due_on,
        "subject": service._subject_ref(subjects, item.subject_id),
    }


def mark_late_alert_seen(
    db: Session, *, student: StudentProfile, item_id: int | None = None
) -> None:
    """Le toast a été montré : plus rien aujourd'hui, et le plancher avance — **juste ce qu'il
    faut**.

    🔴 **Le plancher s'arrête au LENDEMAIN de l'échéance montrée, jamais à aujourd'hui.** Il
    poussait à `today`, ce qui brûlait toute la fenêtre alors qu'**une seule** échéance en était
    sortie : quand deux tombaient en retard pendant une absence, la seconde n'était jamais montrée
    et ne pouvait plus l'être — le plancher n'avance que. Un contrôle tombait en silence derrière
    un devoir plus ancien. Trouvé par relecture paire le 2026-08-17, reproduit par un test.

    ⚠️ **L'item est REVALIDÉ côté serveur** : appartenance à l'élève vérifiée, jamais l'`id` du
    client pris pour argent comptant. Et le plancher ne RECULE jamais (`max`) — un accusé rejoué
    en retard ne doit pas rouvrir une fenêtre déjà close.

    ⚠️ **Sans `item_id`, le serveur REJOUE la requête** au lieu de ne rien avancer. Une première
    version se contentait de la règle du jour — et un accusé au corps vide laissait alors le
    plancher immobile, donc **le même toast chaque jour sans fin**. Le mode de dégradation avait
    changé de nature sans qu'on le voie : rater un accusé coûtait *une alerte de trop dans la
    journée* ; il coûtait désormais *la même, pour toujours*. Trouvé par relecture paire.

    Ne renvoie rien, et **échoue en silence côté client** : rater un accusé laisse une alerte de
    trop dans la journée, ce qui est sans gravité. Afficher une erreur technique sur l'écran d'un
    enfant ne l'est pas. Même contrat que `markAgendaSeen`.
    """
    today = today_local()
    item = db.get(AgendaItem, item_id) if item_id is not None else None
    if item is not None and item.student_id != student.id:
        item = None  # id étranger : on ne le croit pas, et on retombe sur le recalcul
    if item is None:
        # 🔴 **Le serveur RECALCULE plutôt que de ne rien faire.** Ne rien avancer laisserait le
        # plancher immobile, donc **le même toast tous les jours, indéfiniment** — exactement ce
        # que le §D12 écarte (*« un enfant qui n'arrive pas à rattraper ne verra pas le même toast
        # tous les jours »*). Ce n'est pas théorique : un bundle JS **en cache d'avant ce
        # correctif** n'envoie aucun `item_id`, et c'est le cas juste après une mise en ligne.
        item = _echeance_a_signaler(db, student=student, today=today)
    student.agenda_late_alert_on = today
    if item is not None:
        lendemain = item.due_on + timedelta(days=1)
        plancher = student.agenda_late_alert_floor
        if plancher is None or lendemain > plancher:
            student.agenda_late_alert_floor = lendemain
    db.commit()


def ahead(db: Session, *, student: StudentProfile) -> dict:
    """Le bloc « Prendre de l'avance » en UN appel.

    Sans agrégat, la page passerait de trois appels réseau à sept.

    🔴 **Sans échéance à venir, le bloc RÉPOND quand même** : `anchor: null`, et les gestes qui
    tiennent debout sans ancre (réviser, une mission, une mindmap). C'est la leçon du toast muet
    du 2026-08-17 — *un vide confirmé est une réponse, un silence n'en est pas une* — et ce n'est
    pas un réceptacle (§B1) : une phrase et des portes ne sont pas des cases en attente.
    """
    item = _anchor_item(db, student_id=student.id)
    subjects = service.subjects_index(db)
    gestes = [geste for source in GESTES.values() if (geste := source(db, student, item))]
    return {
        "anchor": (
            None
            if item is None
            else {
                "item_id": item.id,
                "label": item.label,
                "kind": item.kind,
                "due_on": item.due_on,
                "subject": service._subject_ref(subjects, item.subject_id),
                "chapter_id": item.chapter_id,
                "lesson_id": item.lesson_id,
            }
        ),
        "gestes": gestes,
    }
