"""L'index des notions : 280 notions × (palier, dernière bascule, lacune, mission) en une passe.

Sert `GET /api/parent/progress/skills` (adr-0040 §11). **Aucun N+1, aucune pagination, aucun
paramètre de période** : filtres, tri, recherche et bascule de vue sont client, zéro requête —
patron `adr-0024-zetis-galaxy-progression` (Amendement 6). Le nombre de requêtes est CONSTANT,
indépendant du nombre de notions et de matières, et un test le verrouille.

⚠️ **Aucune ré-énumération de statuts.** `SkillMastery.status` a SIX valeurs, `in_progress` étant
écrit par `missions/service.py` hors de tout `_status_from_score()` — piège signalé par `adr-0024`
puis `adr-0028`. Ce module **importe** le regroupement canonique (`dashboard/projections`) et
`OPEN_GAP_STATUSES` (`progress/service`), il n'en recopie aucun.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    Gap,
    LearningEvent,
    QuizAttempt,
    QuizQuestion,
    Skill,
    SkillMastery,
    SkillMasteryHistory,
    SpacedReviewAttempt,
    SpacedReviewCard,
    Subject,
)
from app.modules.dashboard import projections as p
from app.modules.progress.service import OPEN_GAP_STATUSES, skills_with_active_mission

# La vue période propose 7 / 30 / 90 / 365 jours. La route sert la PLUS LARGE et le client filtre
# — patron « filtres client, zéro requête » du §11. Servir chaque fenêtre côté serveur rendrait la
# bascule de fenêtre coûteuse, et surtout empêcherait le §6 d'être tenu : les compteurs doivent se
# DÉRIVER du journal affiché, donc le client doit posséder le journal.
FACTS_WINDOW_DAYS = max(p.PERIODS)

# Palier affiché ← statut de `SkillMastery`. **Construit depuis les frozensets canoniques**, jamais
# réécrit. `unknown` est mappé EXPLICITEMENT : c'est une valeur réelle de la colonne, et la laisser
# tomber dans un `.get(...)` par défaut ferait exactement ce que le §7 interdit — glisser en
# silence dans « non abordée ».
PALIER_BY_STATUS: dict[str, str] = {
    **{s: "acquise" for s in p.CONSOLIDATED_STATUSES},
    **{s: "a_renforcer" for s in p.FRAGILE_STATUSES},
    **{s: "en_cours" for s in p.IN_PROGRESS_STATUSES},
    "unknown": "non_abordee",
}

# Les six valeurs réelles de la colonne (cf. `SkillMasteryHistory.status`). Le test-verrou compare
# cet ensemble à `PALIER_BY_STATUS` : une SEPTIÈME valeur ajoutée au modèle sans être mappée ici
# doit faire ÉCHOUER un test, pas glisser dans « non abordée ».
KNOWN_MASTERY_STATUSES = frozenset(
    {"mastered", "solid", "learning", "weak", "in_progress", "unknown"}
)

# Une notion sans ligne de maîtrise n'est pas « abordée puis oubliée » : elle n'a jamais été
# rencontrée. C'est le seul cas où `since` vaut `null` (§7).
PALIER_SANS_LIGNE = "non_abordee"


def _since_of(
    has_mastery: bool, status: str | None, mastered_at, last_change: datetime | None, today: datetime
) -> dict | None:
    """Les QUATRE états de « depuis », et les DEUX absences qui ne partagent pas un `null` (§7).

    Un `int | None` serait la faute que ce lot existe pour éviter : `null` dirait à la fois
    « jamais abordée », « bascule antérieure à la trace » et « date perdue à la migration », trois
    causes dont **une seule se comblera d'elle-même**.
    """
    if not has_mastery:
        return None  # non abordée — aucune ligne de maîtrise
    if last_change is not None:
        moment = last_change if last_change.tzinfo else last_change.replace(tzinfo=timezone.utc)
        return {"days": max(0, (today - moment).days)}
    # Une ligne de maîtrise sans aucune bascule tracée. Deux causes, deux libellés :
    if status in p.CONSOLIDATED_STATUSES and mastered_at is None:
        # Consolidée avant que `mastered_at` n'existe : la date est DÉFINITIVEMENT perdue.
        return {"unknown": "before_migration"}
    # Abordée, mais sa dernière bascule précède la mise en service de l'historique. Se comblera
    # d'elle-même à la prochaine bascule.
    return {"unknown": "before_history"}


def skills_index(db: Session, *, student_id: int) -> dict:
    """L'index ET le journal des faits datés, en un nombre CONSTANT de requêtes, quel que soit
    le volume — c'est le §11 en entier (« index des notions **+ faits datés** »).

    Le compte exact n'est pas gravé ici : il a déjà menti une fois (« cinq » alors qu'il y en avait
    sept). Ce qui est GARANTI et testé, c'est qu'il ne dépend ni du nombre de notions ni du nombre
    de matières.
    Le test `test_le_nombre_de_requetes_ne_depend_PAS_du_volume` compare deux volumes ; il chiffre
    l'écart quand il rougit (« 10 → 110 »), ce qui rend le N+1 lisible sans relire le code.
    """
    today = datetime.now(timezone.utc)
    facts_since = today - timedelta(days=FACTS_WINDOW_DAYS)

    # 1 — les notions et leur matière, dans l'ORDRE DE L'ANNÉE (jamais alphabétique, §4 bis) : le
    # client s'en sert tel quel pour le tri « matière », et un ordre divergent de la table matière
    # ferait deux vues du même écran se contredire.
    rows = db.execute(
        select(Skill.id, Skill.name, Subject.id, Subject.name, Subject.slug)
        .join(Subject, Subject.id == Skill.subject_id)
        .order_by(Subject.sort_order, Subject.name, Skill.name, Skill.id)
    ).all()

    # 2 — la maîtrise courante
    mastery = {
        m.skill_id: m
        for m in db.scalars(select(SkillMastery).where(SkillMastery.student_id == student_id))
    }

    # 3 — la DERNIÈRE bascule de chaque notion. C'est cette requête que l'index
    # `(student_id, skill_id, changed_at DESC)` de la migration sert : l'index existant
    # `(student_id, changed_at)` sert le balayage de fenêtre du dashboard, pas ce group-by.
    last_change = dict(
        db.execute(
            select(SkillMasteryHistory.skill_id, func.max(SkillMasteryHistory.changed_at))
            .where(SkillMasteryHistory.student_id == student_id)
            .group_by(SkillMasteryHistory.skill_id)
        ).all()
    )

    # 4 — les lacunes OUVERTES (définition importée, jamais recopiée)
    gaps = {
        g.skill_id: g
        for g in db.scalars(
            select(Gap).where(
                Gap.student_id == student_id, Gap.status.in_(OPEN_GAP_STATUSES)
            ).order_by(Gap.id)
        )
    }

    # 5 — les notions déjà couvertes par une mission `planned|active`
    covered = skills_with_active_mission(db, student_id=student_id)

    notions: list[dict] = []
    subjects_seen: dict[int, dict] = {}
    for skill_id, skill_name, subject_id, subject_name, subject_slug in rows:
        subjects_seen.setdefault(
            subject_id, {"subject_id": subject_id, "name": subject_name, "slug": subject_slug}
        )
        m = mastery.get(skill_id)
        status = m.status if m is not None else None
        gap = gaps.get(skill_id)
        notions.append(
            {
                "skill_id": skill_id,
                "skill_name": skill_name,
                "subject_id": subject_id,
                "subject_name": subject_name,
                "subject_slug": subject_slug,
                # ⚠️ Palier et lacune sont DEUX AXES INDÉPENDANTS (§4), jamais une colonne à trois
                # valeurs : une notion peut être « à renforcer » sans lacune, et porter une lacune
                # ouverte en étant « en cours ». Les fondre reproduirait le bug d'`analyse-par-matiere`.
                "palier": PALIER_BY_STATUS[status] if status is not None else PALIER_SANS_LIGNE,
                "mastery_score": round(m.mastery_score) if m is not None else None,
                "has_open_gap": gap is not None,
                "gap_severity": gap.severity if gap is not None else None,
                "has_active_mission": skill_id in covered,
                "since": _since_of(
                    m is not None,
                    status,
                    m.mastered_at if m is not None else None,
                    last_change.get(skill_id),
                    today,
                ),
            }
        )

    return {
        "notions": notions,
        "subjects": list(subjects_seen.values()),
        # Le JOURNAL des faits datés (§2) — la seconde moitié de ce que le §11 demande à cette
        # route. Servi sur la fenêtre la PLUS LARGE ; le client filtre à 7/30/90 sans requête, et
        # c'est ce qui permet au §6 d'être tenu : les compteurs se dérivent du journal AFFICHÉ.
        "facts": dated_facts(db, student_id=student_id, since=facts_since),
        "facts_since": facts_since.isoformat(),
        # Les trois débuts de trace, DÉCLARÉS (§6) : un compteur bas doit pouvoir dire « pas de
        # trace » plutôt que « pas de mouvement ». Les deux ne se corrigent pas l'un l'autre.
        #
        # ⚠️ TROIS natures, TROIS bornes — et la troisième est l'absence de borne. Les lacunes,
        # missions et quiz sont tracés depuis toujours : leur borne est `null`, ce qui veut dire
        # « complète », jamais « inconnue ». Servir une borne unique ferait porter à un compteur
        # l'avertissement d'un autre.
        "history_since": _history_since_iso(db, student_id),
        "reviews_since": _reviews_since_iso(db, student_id),
    }


def dated_facts(db: Session, *, student_id: int, since: datetime) -> list[dict]:
    """Les FAITS DATÉS de la vue période (§2) — cinq natures, récentes d'abord.

    Ce qui y figure, et **rien d'autre** : bascules de palier, lacunes ouvertes et résolues,
    missions terminées, quiz notés, révisions notées.

    ⚠️ **Ni XP ni production**, et les deux exclusions ont un motif distinct (§2). L'XP
    apparaîtrait sous le même mot que la colonne « depuis toujours » de la vue matière — deux
    nombres, un mot, la classe de bug déjà payée deux fois — et il est le **seul compteur que ce
    journal ne pourrait pas recomposer** (`XPEvent` n'a pas de `skill_id`), ce qui casserait
    l'invariant du §6 pour tous les autres. La production est datée, mais elle mesure le stock de
    CONTENU, pas la progression de Massimo : sa maison est Couverture.

    ⚠️ **Aucun palier, aucun stock, aucune barre** ici : une fenêtre posée sur un palier est un
    mensonge (les paliers sont des stocks sans reconstruction), posée sur un fait daté elle est
    exacte. C'est tout le point dur de l'ADR.

    Les bascules viennent de `evidence.mastery_transitions` — **LA** fonction de mesure du §10, que
    le Conseil consommera aussi au Lot 3. Les recalculer ici referait deux mesures sous un mot.
    """
    from app.modules.evidence import service as evidence

    facts: list[dict] = []

    for t in evidence.mastery_transitions(db, student_id=student_id, since=since):
        facts.append(
            {
                "kind": "mastery_transition",
                "at": t["changed_at"].isoformat(),
                "skill_id": t["skill_id"],
                "skill_name": t["skill_name"],
                "subject_id": t["subject_id"],
                "from_status": t["from_status"],
                "to_status": t["to_status"],
            }
        )

    # Lacunes : une ligne `gaps` porte UN cycle ouverture → résolution, donc deux faits possibles
    # pour la même ligne. Les deux sont servis : « ouverte » et « résolue » ne se déduisent pas
    # l'une de l'autre.
    for gap, skill in db.execute(
        select(Gap, Skill).outerjoin(Skill, Skill.id == Gap.skill_id).where(Gap.student_id == student_id)
    ).all():
        nom = skill.name if skill is not None else "Notion"
        for champ, kind in (("first_detected_at", "gap_opened"), ("resolved_at", "gap_resolved")):
            moment = getattr(gap, champ)
            if moment is None:
                continue
            moment = moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)
            if moment < since:
                continue
            facts.append(
                {
                    "kind": kind,
                    "at": moment.isoformat(),
                    "skill_id": gap.skill_id,
                    "skill_name": nom,
                    "subject_id": gap.subject_id,
                    "severity": gap.severity,
                }
            )

    # Missions terminées : le verdict d'acquisition, tracé dans `learning_events`. C'est la source
    # DATÉE — `missions` n'a pas de `completed_at`, et `updated_at` bougerait pour autre chose.
    for ev in db.scalars(
        select(LearningEvent).where(
            LearningEvent.student_id == student_id,
            LearningEvent.event_type == evidence.VERDICT_EVENT,
            LearningEvent.created_at >= since,
        )
    ):
        payload = dict(ev.payload_json or {})
        facts.append(
            {
                "kind": "mission_done",
                "at": ev.created_at.isoformat(),
                "skill_id": ev.skill_id,
                "skill_name": None,
                "subject_id": ev.subject_id,
                "verdict": payload.get("verdict"),
            }
        )

    for skill_id, nom, score, at in db.execute(
        select(QuizQuestion.skill_id, Skill.name, QuizAttempt.score_percent, QuizAttempt.completed_at)
        .join(QuizAttempt, QuizAttempt.quiz_id == QuizQuestion.quiz_id)
        .outerjoin(Skill, Skill.id == QuizQuestion.skill_id)
        .where(
            QuizAttempt.student_id == student_id,
            QuizAttempt.completed_at.is_not(None),
            QuizAttempt.completed_at >= since,
            QuizAttempt.score_percent.is_not(None),
        )
    ).all():
        facts.append(
            {
                "kind": "quiz_scored",
                "at": at.isoformat(),
                "skill_id": skill_id,
                "skill_name": nom,
                "subject_id": None,
                "score": round(float(score)),
            }
        )

    for skill_id, nom, rating, at in db.execute(
        select(SpacedReviewCard.skill_id, Skill.name, SpacedReviewAttempt.rating, SpacedReviewAttempt.reviewed_at)
        .join(SpacedReviewCard, SpacedReviewCard.id == SpacedReviewAttempt.card_id)
        .outerjoin(Skill, Skill.id == SpacedReviewCard.skill_id)
        .where(
            SpacedReviewAttempt.student_id == student_id,
            SpacedReviewAttempt.reviewed_at >= since,
        )
    ).all():
        facts.append(
            {
                "kind": "review_scored",
                "at": at.isoformat(),
                "skill_id": skill_id,
                "skill_name": nom,
                "subject_id": None,
                "rating": rating,
            }
        )

    # Récents d'abord, départagés par (kind, skill_id) : sans cette queue, deux faits du même
    # instant changeraient de place d'un rendu à l'autre — le journal de production a la même règle.
    facts.sort(key=lambda f: (f["at"], f["kind"], f["skill_id"] or 0), reverse=True)
    return facts


def _history_since_iso(db: Session, student_id: int) -> str | None:
    from app.modules.evidence import service as evidence

    when = evidence.history_since(db, student_id=student_id)
    return when.isoformat() if when else None


def _reviews_since_iso(db: Session, student_id: int) -> str | None:
    """Début de trace des révisions notées — la première `SpacedReviewAttempt`.

    Nature de fait DISTINCTE des bascules, donc borne distincte (§6). Les fondre en une seule
    « borne de trace » ferait porter à un compteur l'avertissement d'un autre.
    """
    from app.db.models import SpacedReviewAttempt
    from app.modules.activity.timeutils import local_day

    when = db.scalar(
        select(func.min(SpacedReviewAttempt.reviewed_at)).where(
            SpacedReviewAttempt.student_id == student_id
        )
    )
    return local_day(when).isoformat() if when else None


def skill_timeline(db: Session, *, student_id: int, skill_id: int) -> dict:
    """La frise d'UNE notion — paresseuse, chargée au dépliage.

    **Troisième exception assumée** au « zéro état de chargement » de l'`adr-0028 §4`, après le
    drill-down d'un jour et le panneau d'analyse. Même motif : une descente vers un détail non
    borné, pas un filtre.
    """
    skill = db.get(Skill, skill_id)
    rows = db.execute(
        select(SkillMasteryHistory.status, SkillMasteryHistory.mastery_score, SkillMasteryHistory.changed_at)
        .where(
            SkillMasteryHistory.student_id == student_id,
            SkillMasteryHistory.skill_id == skill_id,
        )
        .order_by(SkillMasteryHistory.changed_at.desc(), SkillMasteryHistory.id.desc())
    ).all()

    transitions = []
    # `from_status` se calcule en remontant : la ligne la plus ancienne n'en a pas, et l'inventer
    # serait une affirmation que la trace ne porte pas (même règle que `mastery_transitions`).
    ordered = list(reversed(rows))
    previous: str | None = None
    for status, score, changed_at in ordered:
        transitions.append(
            {
                "from_status": previous,
                "to_status": status,
                "mastery_score": round(score),
                "changed_at": changed_at.isoformat(),
            }
        )
        previous = status
    transitions.reverse()

    return {
        "skill_id": skill_id,
        "skill_name": skill.name if skill is not None else "Notion",
        "transitions": transitions,
        "history_since": _history_since_iso(db, student_id),
    }
