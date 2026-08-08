"""Lecture de la progression pédagogique : lacunes ouvertes et notions consolidées.

Deux STOCKS (« où en est Massimo aujourd'hui »), à distinguer des flux hebdomadaires du module
`activity` (« qu'a-t-il fait cette semaine »). C'est pourquoi ils sont servis SANS delta : voir
`dashboard_kpis`.

Vocabulaire figé ici, faute de définition dans le glossaire :

- **lacune ouverte** = `Gap.status ∈ (open, in_progress)`, la même définition que celle
  qu'utilise le générateur de missions de remédiation (`missions._OPEN_GAP_STATUSES`) — deux
  comptages divergents de « lacune ouverte » dans la même app seraient un piège ;
- **notion consolidée** = `SkillMastery.status == "mastered"`, soit un score ≥ 90 selon les
  paliers partagés par le diagnostic et le quiz (`_status_from_score`). `solid` (≥ 70) n'est
  volontairement PAS compté : « consolidé » doit vouloir dire acquis, pas « presque ».

Lecture seule : aucune écriture, aucun effet de bord.
"""

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Gap, Skill, SkillMastery, Subject
from app.modules.activity.timeutils import range_bounds_utc
from app.modules.content_state import CONTENU_OK, etat_et_lecon

# SOURCE UNIQUE de « lacune ouverte ». Cette définition vivait en quatre exemplaires (constante
# dans `missions`, constante ici, deux tuples écrits en dur dans `pilot` et `evidence`) : quatre
# comptages qui pouvaient diverger silencieusement. Les trois autres importent désormais celui-ci.
OPEN_GAP_STATUSES = ("open", "in_progress")
RESOLVED_GAP_STATUS = "resolved"
MASTERED_STATUS = "mastered"

# Ordre de gravité décroissante : ce qui est le plus urgent se lit en premier.
SEVERITY_RANK = {"high": 0, "medium": 1, "low": 2}


def active_missions(db: Session, *, student_id: int, subject_id: int | None = None) -> list:
    """Missions `planned|active`, TOUS types confondus. Optionnellement bornées à une matière.

    SOURCE UNIQUE de « une mission couvre déjà cette notion » : `skills_with_active_mission` en
    dérive, et le panneau d'analyse d'une matière (`adr-0028-addendum-analyse-par-matiere`) affiche
    exactement ces lignes.

    ⚠️ **Aucun filtre `validation_status`**, contrairement à `missions.pilot.pilot_list` qui exige
    `validated`. Ce n'est pas un oubli : si le panneau listait les missions validées seules, une
    notion marquée « déjà couverte » pourrait n'afficher aucune mission en regard — le drapeau et
    la liste doivent porter sur la MÊME population, sans quoi Papa lit une contradiction.

    Import local : `missions` importe déjà `progress`, une dépendance en tête de module la rendrait
    circulaire.
    """
    from app.db.models import Mission

    query = select(Mission).where(
        Mission.student_id == student_id,
        Mission.status.in_(("planned", "active")),
    )
    if subject_id is not None:
        query = query.where(Mission.subject_id == subject_id)
    return list(db.scalars(query.order_by(Mission.priority.desc(), Mission.id)))


def skills_with_active_mission(db: Session, *, student_id: int) -> set[int]:
    """Notions couvertes par une mission `planned|active`, TOUS types confondus.

    Volontairement plus large que `missions._has_active_remediation` (qui ne regarde que les
    missions de remédiation) : ici la question de Papa est « ai-je encore quelque chose à décider
    pour cette notion ? ». Une mission de révision en cours y répond tout autant — c'est même le
    relais que l'`adr-0017 §5bis` désigne après un verdict « à revoir ».
    """
    return set(missions_by_skill(db, student_id=student_id))


def missions_by_skill(db: Session, *, student_id: int) -> dict[int, int]:
    """Notion → **la** mission `planned|active` qui la couvre (ADR-0047 Décision 5).

    ⚠️ **Le critère n'est pas réinventé ici.** `active_missions` trie déjà
    `priority DESC, id` : quand plusieurs missions couvrent la même notion, on garde la
    **première de cet ordre** — la plus prioritaire. Poser un second critère de « la mission qui
    couvre » aurait mis deux réponses à la même question dans le même module.

    🔴 **`skills_with_active_mission` en DÉRIVE désormais**, et c'est ce qui garantit le coût :
    `progress.open_gaps` appelle cette fonction-ci **seule** et tire l'ensemble de ses clés, au lieu
    d'appeler deux fonctions qui interrogeraient `active_missions` chacune de leur côté. L'invariant
    `set(missions_by_skill) == skills_with_active_mission` est verrouillé par un test : s'il tombe,
    c'est que les quatre autres lecteurs de l'ensemble comptent autre chose que cette page.
    """
    par_notion: dict[int, int] = {}
    for mission in active_missions(db, student_id=student_id):
        if mission.skill_id is not None:
            par_notion.setdefault(mission.skill_id, mission.id)
    return par_notion


def open_gaps(db: Session, *, student_id: int) -> list[dict]:
    """Lacunes ouvertes de l'élève, les plus sévères d'abord.

    Formulation bienveillante côté client (CLAUDE.md) : ce sont des « notions à renforcer ».
    Le service sert la donnée brute, l'UI choisit les mots."""
    rows = db.execute(
        select(Gap, Skill, Subject)
        .outerjoin(Skill, Skill.id == Gap.skill_id)
        .outerjoin(Subject, Subject.id == Gap.subject_id)
        .where(Gap.student_id == student_id, Gap.status.in_(OPEN_GAP_STATUSES))
    ).all()
    # 🔴 **UNE seule fonction, pas deux.** `missions_by_skill` porte l'ensemble ET l'identifiant :
    # appeler aussi `skills_with_active_mission` interrogerait `active_missions` une seconde fois,
    # et `open_gap_count` paierait le tout une troisième — il appelle cette fonction-ci (ADR-0047).
    missions = missions_by_skill(db, student_id=student_id)
    covered = missions.keys()
    # 🔴 **`source` et `content_state` servent les RENVOIS des jauges du Diagnostic** (adr-0045).
    # Sans eux, « dont 4 sans contenu → » mène à une page qui en montre 10 : un nombre cliquable
    # qui conduit à un autre nombre est pire que le nombre invisible qu'il remplace.
    #
    # ⚠️ `source` est GRATUIT — la requête sélectionne déjà `Gap`, le champ était sur la ligne et
    # n'était simplement pas rendu. `content_state` coûte UNE requête, en lot, quel que soit le
    # nombre de lacunes.
    #
    # 🔴 **`etat_et_lecon`, PAS `etat_contenu` puis `lecons_visees`** (ADR-0047) : la leçon visée
    # sort de la même passe sur `lessons_by_skill` que l'état. Les appeler séparément doublerait la
    # requête pour rendre deux moitiés du même parcours.
    etats = etat_et_lecon(db, [gap.skill_id for gap, _skill, _subject in rows])

    gaps = [
        {
            "skill_id": gap.skill_id,
            "skill_name": skill.name if skill is not None else "Notion",
            "subject_slug": subject.slug if subject is not None else None,
            "subject_name": subject.name if subject is not None else None,
            "severity": gap.severity,
            "status": gap.status,
            "first_detected_at": (
                gap.first_detected_at.isoformat() if gap.first_detected_at else None
            ),
            "has_active_mission": gap.skill_id in covered,
            # D'où vient la lacune : `diagnostic`, `mission`… Elle n'était servie nulle part, et la
            # page ne pouvait donc pas distinguer ce qu'une mesure a ouvert de ce qu'un exercice a
            # révélé.
            "source": gap.source,
            "content_state": etats.get(gap.skill_id, (CONTENU_OK, None))[0],
            # La leçon que le geste de la ligne doit ouvrir, et la mission qu'il doit montrer
            # (ADR-0047 Décisions 3-5). Les deux étaient DÉJÀ calculés puis jetés — c'est le motif
            # exact de `source` ci-dessus, deux chantiers plus tard, dans la même fonction.
            "lesson_id": (
                lecon.id if (lecon := etats.get(gap.skill_id, (CONTENU_OK, None))[1]) else None
            ),
            "mission_id": missions.get(gap.skill_id),
        }
        for gap, skill, subject in rows
    ]
    gaps.sort(key=lambda g: (SEVERITY_RANK.get(g["severity"], 3), g["skill_name"]))
    return gaps


def consolidated_skills(db: Session, *, student_id: int) -> list[dict]:
    """Notions consolidées (`mastered`), la maîtrise la plus haute d'abord."""
    rows = db.execute(
        select(SkillMastery, Skill, Subject)
        .outerjoin(Skill, Skill.id == SkillMastery.skill_id)
        .outerjoin(Subject, Subject.id == Skill.subject_id)
        .where(
            SkillMastery.student_id == student_id,
            SkillMastery.status == MASTERED_STATUS,
        )
    ).all()

    skills = [
        {
            "skill_id": mastery.skill_id,
            "skill_name": skill.name if skill is not None else "Notion",
            "subject_slug": subject.slug if subject is not None else None,
            "subject_name": subject.name if subject is not None else None,
            "mastery_score": round(mastery.mastery_score),
            "last_seen_at": mastery.last_seen_at.isoformat() if mastery.last_seen_at else None,
        }
        for mastery, skill, subject in rows
    ]
    skills.sort(key=lambda s: (-s["mastery_score"], s["skill_name"]))
    return skills


def open_gap_count(db: Session, *, student_id: int) -> int:
    return len(open_gaps(db, student_id=student_id))


def consolidated_count(db: Session, *, student_id: int) -> int:
    return len(consolidated_skills(db, student_id=student_id))


# --- Flux hebdomadaires (ce que les horodatages de bascule rendent calculable) -----------------
# À distinguer des STOCKS ci-dessus. Un stock répond « où en est Massimo aujourd'hui », un flux
# « qu'a-t-il gagné cette semaine ». Seul le second est honnêtement calculable : effacer
# `mastered_at` à la sortie de `mastered` interdit de reconstituer le stock d'il y a sept jours.


def _week_bounds(monday: date):
    """Bornes UTC de la semaine lundi→dimanche — les jours sont des jours Europe/Paris, les
    colonnes sont stockées en UTC. Aucune conversion côté SQL."""
    return range_bounds_utc(monday, monday + timedelta(days=6))


def consolidated_this_week(db: Session, *, student_id: int, monday: date) -> int:
    """Notions passées à « consolidée » pendant la semaine.

    Les lignes héritées (`mastered` sans `mastered_at`) ne comptent dans AUCUNE semaine : une
    notion acquise il y a six mois ne doit pas gonfler la première semaine affichée."""
    start, end = _week_bounds(monday)
    return int(
        db.scalar(
            select(func.count())
            .select_from(SkillMastery)
            .where(
                SkillMastery.student_id == student_id,
                SkillMastery.status == MASTERED_STATUS,
                SkillMastery.mastered_at.is_not(None),
                SkillMastery.mastered_at >= start,
                SkillMastery.mastered_at < end,
            )
        )
        or 0
    )


def gaps_closed_this_week(db: Session, *, student_id: int, monday: date) -> int:
    """Notions dont une lacune a été refermée pendant la semaine.

    Compte des NOTIONS distinctes, pas des lignes : `_upsert_gap` (diagnostics) ne déduplique que
    sur `status == "open"`, donc une notion re-ratée alors qu'elle était `in_progress` reçoit une
    seconde ligne. Sans `DISTINCT`, une seule notion refermée compterait deux fois."""
    start, end = _week_bounds(monday)
    return int(
        db.scalar(
            select(func.count(func.distinct(Gap.skill_id))).where(
                Gap.student_id == student_id,
                Gap.status == RESOLVED_GAP_STATUS,
                Gap.resolved_at.is_not(None),
                Gap.resolved_at >= start,
                Gap.resolved_at < end,
            )
        )
        or 0
    )
