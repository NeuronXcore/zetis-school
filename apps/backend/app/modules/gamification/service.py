"""Service gamification : crédit d'XP et synthèse (niveau, badges).

Gamification au service de l'apprentissage (CLAUDE.md) : XP, niveaux et badges pédagogiques —
pas de mécanique addictive. Le crédit d'XP passe par `award_xp`, appelé aux moments clés
(mission, verbalisation, diagnostic).

**Le streak a été retiré** (chantier « auto-motivation ») : il tombait à zéro dès un jour entier
manqué et se calculait en UTC alors que tout le reste bucketise en Europe/Paris. Il est remplacé
par la régularité douce du module `motivation`, un compte hebdomadaire qui ne peut pas casser.
La composition de `regularity` dans la réponse vit dans le ROUTEUR — ce service reste le grand
livre de l'économie XP et n'a pas à connaître un module de plus haut niveau."""

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import StudentProfile, Subject, XPEvent
from app.modules.activity.timeutils import local_day

XP_PER_LEVEL = 100

# Fenêtre de `xp_history`. Bornée SERVEUR : le client choisit une fenêtre, pas l'ampleur du scan
# (même règle que `/activity/sessions`).
XP_HISTORY_DEFAULT_DAYS = 90
XP_HISTORY_MAX_DAYS = 365

# Récompenses par action (le crédit mission vit dans le module missions : +20).
XP_ELI5_REVERSE = 10
XP_DIAGNOSTIC = 15
# Quiz de fin de cours (ADR-0014) : base d'effort + bonus proportionnel au score.
XP_QUIZ_BASE = 10  # forfait « terminé » — l'effort est récompensé, jamais 0 (CLAUDE.md)
XP_QUIZ_MAX = 30  # atteint sur un score parfait (100 %)
# Reconstruction de mindmap (ADR-0016) : même barème d'effort + performance que le quiz.
XP_MINDMAP_BASE = 10
XP_MINDMAP_MAX = 30


def quiz_xp(score_percent: int) -> int:
    """XP d'un quiz terminé : base d'effort + bonus selon le score. 0 % → 10, 100 % → 30.

    Récompense l'engagement ET la performance sans jamais punir (aucun 0 après un quiz joué
    jusqu'au bout). Fonction pure, testée."""
    clamped = max(0, min(100, score_percent))
    bonus = round((XP_QUIZ_MAX - XP_QUIZ_BASE) * clamped / 100)
    return XP_QUIZ_BASE + bonus


XP_MINDMAP_FAIL_PENALTY = 5  # XP retirés par tentative ratée pendant une séance de reconstruction


def mindmap_xp(score_percent: int) -> int:
    """XP d'une reconstruction de mindmap : base d'effort + bonus selon le score. 0 % → 10, 100 % → 30.

    Même esprit que `quiz_xp` (jamais 0 après une tentative jouée). Fonction pure, testée."""
    clamped = max(0, min(100, score_percent))
    bonus = round((XP_MINDMAP_MAX - XP_MINDMAP_BASE) * clamped / 100)
    return XP_MINDMAP_BASE + bonus


def mindmap_reconstruction_xp(score_percent: int, failed_attempts: int = 0) -> int:
    """XP d'une reconstruction RÉUSSIE, réduit par le nombre d'échecs de la séance.

    L'effort reste récompensé (plancher = base) : chaque tentative ratée retire un forfait, mais on
    ne descend jamais sous `XP_MINDMAP_BASE`. Déterministe (mêmes score + échecs → même XP)."""
    base = mindmap_xp(score_percent)
    return max(XP_MINDMAP_BASE, base - XP_MINDMAP_FAIL_PENALTY * max(0, failed_attempts))


def award_xp(
    db: Session, *, student_id: int, subject_id: int | None, amount: int, reason: str
) -> None:
    """Ajoute un événement XP à la session (le commit est laissé à l'appelant)."""
    db.add(
        XPEvent(
            student_id=student_id,
            subject_id=subject_id,
            amount=amount,
            reason=reason,
            created_at=datetime.now(timezone.utc),
        )
    )


def _level_from_xp(total_xp: int) -> tuple[int, int]:
    """(niveau, xp acquis dans le niveau). Niveau 1 = 0–99 XP, etc."""
    level = total_xp // XP_PER_LEVEL + 1
    into = total_xp % XP_PER_LEVEL
    return level, into


def _badges(
    *,
    total_xp: int,
    mission_count: int,
    diag_done: bool,
    eli5_count: int,
    champion_count: int = 0,
) -> list[dict]:
    earned: list[dict] = []

    def add(code: str, label: str, icon: str) -> None:
        earned.append({"code": code, "label": label, "icon": icon})

    if mission_count >= 1:
        add("first_mission", "Première mission", "🎯")
    if mission_count >= 5:
        add("persevering", "Persévérant", "🏅")
    if champion_count >= 1:  # ADR-0022 : un défi croisé relevé
        add("champion", "Champion", "🏆")
    if eli5_count >= 1:
        add("explainer", "Petit prof", "🗣️")
    if diag_done:
        add("diagnostic", "Diagnostic passé", "🧭")
    if total_xp >= 100:
        add("xp_100", "100 XP", "⭐")
    if total_xp >= 500:
        add("xp_500", "500 XP", "🌟")
    return earned


def xp_history(
    db: Session,
    student: StudentProfile,
    *,
    days: int = XP_HISTORY_DEFAULT_DAYS,
    subject_id: int | None = None,
) -> dict:
    """Les jours où Massimo a GAGNÉ du XP, du plus ancien au plus récent.

    `subject_id` restreint à une matière (addendum ADR-0024 « page matière onglets »). Le contrat
    ci-dessous **ne change pas** avec le filtre : une matière sans aucun gain rend `days: []`, et
    surtout pas une suite de zéros. Le garde-fou vaut d'autant plus filtré — une matière travaillée
    un jour sur dix aurait, en série dense, neuf creux sur dix à lire comme des manques.

    **Les jours sans gain sont ABSENTS du résultat** — jamais à zéro. C'est le garde-fou de
    l'addendum ADR-0024 « Accueil vivant » §A : la donnée d'absence n'existe pas, donc rien en
    aval ne peut en dessiner une. Cf. le docstring de `XpHistoryOut`.

    Pourquoi c'est ici et pas dans `activity` : ce module est le grand livre des RÉCOMPENSES.
    `activity` porte une doctrine inverse — rien de son tracking ne descend chez Massimo, « un
    enfant chronométré travaille pour le chronomètre ». Aucune minute, aucune session, aucun
    `event_type` ne sort d'ici. Et **jamais d'UNION `xp_events`/`learning_events`** : ce serait
    un double comptage (cf. `LearningEvent`).

    Le regroupement se fait en **Europe/Paris** via `local_day`, pas en UTC. C'est exactement le
    défaut qui avait été relevé sur le streak retiré : bucketiser en UTC décalait un travail de
    23h30 sur la veille.
    """
    window = max(1, min(days, XP_HISTORY_MAX_DAYS))
    since = datetime.now(timezone.utc) - timedelta(days=window)

    query = select(XPEvent).where(XPEvent.student_id == student.id, XPEvent.created_at >= since)
    if subject_id is not None:
        # ⚠️ Filtre STRICT : l'XP non imputé à une matière (`subject_id IS NULL` — connexion, chat)
        # n'entre dans aucune courbe de matière. L'y verser gonflerait toutes les matières du même
        # montant et rendrait la somme des courbes supérieure au total.
        query = query.where(XPEvent.subject_id == subject_id)

    per_day: dict[date, int] = {}
    for event in db.scalars(query):
        day = local_day(event.created_at)
        per_day[day] = per_day.get(day, 0) + event.amount

    # `> 0` et non `!= 0` : une journée dont le solde retombe à zéro n'a pas d'étoile à allumer,
    # et surtout ne doit pas apparaître comme un jour « à zéro » — ce serait la case vide qu'on
    # vient d'interdire, réintroduite par la porte de derrière.
    return {
        "days": [
            {"date": day.isoformat(), "xp": total}
            for day, total in sorted(per_day.items())
            if total > 0
        ]
    }


@dataclass(frozen=True)
class SubjectXP:
    """Le cumul d'XP réparti par matière — et ce qui n'appartient à aucune (ADR-0038 §3).

    Deux champs, jamais un seul : `by_subject` et `unattributed_xp` s'additionnent pour valoir
    l'XP total de l'élève. Les taire ferait mentir la page qui les affiche — c'est exactement le
    défaut payé sur le dashboard, où le donut « Répartition du temps » totalisait 42 min à côté
    d'un KPI qui en affichait 425 (cf. `unattributed_minutes`, `dashboard/service.py`).

    **Aucun total ici, volontairement.** Le total a déjà une maison — `summary()` — et en servir
    une seconde façon de le compter serait la dette que ce chantier vient précisément solder.
    """

    by_subject: dict[int, int]
    # XP crédité sans matière (`XPEvent.subject_id` est nullable) : connexion, chat, toute
    # récompense non imputable. Nommé plutôt que tu.
    unattributed_xp: int


def xp_by_subject(db: Session, student: StudentProfile) -> SubjectXP:
    """Cumul d'`XPEvent.amount` par matière, sur TOUTE l'histoire de l'élève.

    **Aucune fenêtre temporelle** (ADR-0038 §3) : un cumul d'XP est un stock, pas un flux, et la
    page Progression ne porte aucun sélecteur de période. Un événement d'il y a un an compte
    autant que celui d'hier. C'est aussi pourquoi l'agrégation se fait en SQL et non en Python
    comme `xp_history` : sans fenêtre, il n'y a aucun jour à bucketiser en Europe/Paris.

    **Toutes les matières sont présentes**, y compris celles qui n'ont jamais rapporté un seul XP
    — à `0`, jamais absentes. Une matière absente et une matière à zéro se lisent pareil dans un
    tableau, mais seule la seconde est une mesure ; la première est un trou que l'appelant devra
    combler en devinant.

    Rappel de frontière : ce service reste le grand livre de l'économie XP. Il ne sait rien des
    années scolaires — c'est à l'appelant de décider quelles matières il affiche.
    """
    rows = db.execute(
        select(XPEvent.subject_id, func.sum(XPEvent.amount))
        .where(XPEvent.student_id == student.id)
        .group_by(XPEvent.subject_id)
    ).all()

    by_subject = {sid: int(total or 0) for sid, total in rows if sid is not None}
    unattributed = sum(int(total or 0) for sid, total in rows if sid is None)

    # Les matières sans aucun événement n'ont pas de ligne à grouper : on les pose à zéro. Le
    # sens de lecture compte — on complète après coup, sans jamais écraser un cumul mesuré.
    for subject_id in db.scalars(select(Subject.id)):
        by_subject.setdefault(subject_id, 0)

    return SubjectXP(by_subject=by_subject, unattributed_xp=unattributed)


def xp_block(total: int) -> dict:
    """`{total, level, into_level, for_next}` à partir d'un cumul déjà connu.

    Sert les appelants qui agrègent **plusieurs** matières d'un coup (la vue d'ensemble de la
    galaxie) : ils lisent `xp_by_subject` UNE fois, puis appellent ceci par matière. Passer par
    `subject_xp_summary` en boucle rejouerait l'agrégat à chaque tour — un N+1 sur la page qui
    liste justement toutes les matières.

    Le barème reste **privé à ce module** : l'appelant reçoit un niveau, il ne le calcule pas.
    """
    level, into = _level_from_xp(total)
    return {"total": total, "level": level, "into_level": into, "for_next": XP_PER_LEVEL}


def subject_xp_summary(db: Session, student: StudentProfile, *, subject_id: int) -> dict:
    """L'effort de Massimo dans UNE matière : `{total, level, into_level, for_next}`.

    Sert l'en-tête de la page matière (addendum ADR-0024 « page matière onglets »). Le barème de
    niveau reste **privé à ce module** : l'appelant reçoit un niveau déjà calculé, il n'a pas à
    connaître `XP_PER_LEVEL` ni à le reproduire. C'est ce qui garantit qu'un futur barème non
    linéaire ne se rediscutera qu'ici.

    Le cumul délègue à `xp_by_subject` — **seul endroit du dépôt** qui répond à « combien d'XP dans
    cette matière » (ADR-0038 §3). Coût assumé : il agrège toutes les matières là où une seule est
    demandée. Un `SUM(...)` ciblé serait moins cher et créerait un second chemin de comptage, donc
    une divergence garantie au premier correctif — c'est le troc que fait `SubjectXP`, pas un oubli.

    ⚠️ **Ce que cette fonction ne dit PAS** : ce que Massimo vaut. Aucun pourcentage, aucun
    `mastery_score`. Un XP monte quand on travaille et ne redescend jamais ; c'est précisément ce
    qui le distingue d'un score, et ce qui l'autorise sur une surface enfant (ADR-0024 §5 révisé).
    """
    total = xp_by_subject(db, student).by_subject.get(subject_id, 0)
    level, into = _level_from_xp(total)
    return {"total": total, "level": level, "into_level": into, "for_next": XP_PER_LEVEL}


def xp_by_reason(db: Session, student: StudentProfile, *, subject_id: int) -> list[dict]:
    """Par quels GESTES une matière a rapporté son XP — `[{reason, count, amount}]`, plus fort d'abord.

    ⚠️ **Par motif, jamais par notion** (addendum ADR-0038 §3). `XPEvent` porte `student_id`,
    `subject_id`, `amount`, `reason` et `created_at` — **pas de `skill_id`**. La question « quelles
    notions ont rapporté ces 367 XP ? » n'a aucune réponse en base et n'en aura pas sans migration.
    Ce n'est donc pas une approximation de mieux : c'est le plafond de ce que la donnée permet, et
    il est écrit ici pour que personne ne le prenne pour un oubli.

    **Aucune fenêtre**, comme `xp_by_subject` : un cumul d'XP est un stock. La somme des `amount`
    rendus ici vaut exactement l'XP de cette matière — c'est ce qui rend le détail vérifiable.
    """
    rows = db.execute(
        select(XPEvent.reason, func.count(XPEvent.id), func.sum(XPEvent.amount))
        .where(XPEvent.student_id == student.id, XPEvent.subject_id == subject_id)
        .group_by(XPEvent.reason)
    ).all()

    return sorted(
        ({"reason": reason, "count": count, "amount": int(total or 0)} for reason, count, total in rows),
        # Le plus gros contributeur d'abord ; le motif départage pour que l'ordre soit stable d'un
        # appel à l'autre — deux motifs à égalité ne doivent pas permuter entre deux dépliages.
        key=lambda row: (-row["amount"], row["reason"]),
    )


def summary(db: Session, student: StudentProfile) -> dict:
    events = list(
        db.scalars(
            select(XPEvent)
            .where(XPEvent.student_id == student.id)
            .order_by(XPEvent.created_at.desc(), XPEvent.id.desc())
        )
    )
    total_xp = sum(e.amount for e in events)
    level, into = _level_from_xp(total_xp)

    # Les défis champion (ADR-0022) comptent aussi comme missions accomplies (badges génériques).
    champion_count = sum(1 for e in events if e.reason == "mission_champion")
    mission_count = (
        sum(1 for e in events if e.reason == "mission_remediation") + champion_count
    )
    eli5_count = sum(1 for e in events if e.reason == "eli5_reverse")
    diag_done = any(e.reason == "diagnostic" for e in events)

    return {
        "total_xp": total_xp,
        "level": level,
        "xp_into_level": into,
        "xp_for_next": XP_PER_LEVEL,
        "badges": _badges(
            total_xp=total_xp,
            mission_count=mission_count,
            diag_done=diag_done,
            eli5_count=eli5_count,
            champion_count=champion_count,
        ),
        "recent": [
            {
                "amount": e.amount,
                "reason": e.reason,
                "created_at": e.created_at.isoformat() if e.created_at is not None else None,
            }
            for e in events[:5]
        ],
    }
