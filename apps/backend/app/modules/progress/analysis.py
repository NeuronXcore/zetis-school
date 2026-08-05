"""Analyse d'UNE matière — l'évidence nommée derrière les compteurs du dashboard.

Sert le panneau qui se déplie sous la carte « Où agir » (`adr-0028-addendum-analyse-par-matiere`).
L'agrégat du dashboard sait dire « 8 notions à renforcer » ; il ne sait pas dire **lesquelles**.
C'est le seul manque que ce module comble.

**L'analyse est l'ÉVIDENCE, le Conseil est la NARRATION.** Ici : aucun LLM, aucune écriture,
aucune trace. Le Conseil (`reports/`), lui, appelle un modèle et fige un rapport.

⚠️ **Rien n'est recalculé.** Chaque chiffre vient de la fonction qui fait déjà autorité ailleurs —
`open_gaps` (qui EST la source de la page `/lacunes`), `skills_with_active_mission`, l'évidence du
Conseil, les statuts de `dashboard.projections`. Une seconde façon de compter est exactement le bug
que ce chantier corrige.

⚠️ **Fichier séparé de `service.py` pour éviter un cycle** : `evidence/service.py` importe déjà
`progress.service.OPEN_GAP_STATUSES`. Ce module-ci importe les deux ; `progress.service` reste
intact et ne connaît pas `evidence`.
"""

from datetime import datetime, timezone

from fastapi import HTTPException, status as http_status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Skill, SkillMastery, Subject
from app.modules.dashboard import projections as p
from app.modules.evidence import service as evidence
from app.modules.progress.service import (
    SEVERITY_RANK,
    active_missions,
    open_gaps,
    skills_with_active_mission,
)

# Rang des notions sans lacune : après toutes celles qui en portent une. `SEVERITY_RANK` s'arrête
# à 2 (`low`) ; 3 est déjà la valeur de repli d'un `severity` inconnu dans `open_gaps`.
_NO_GAP_RANK = 3


def subject_analysis(db: Session, *, student_id: int, subject_id: int) -> dict:
    """Tout ce que l'agrégat ne peut pas porter, pour une matière : des NOMS."""
    subject = db.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, detail="Matière introuvable.")

    skills = {
        skill_id: name
        for skill_id, name in db.execute(
            select(Skill.id, Skill.name).where(Skill.subject_id == subject_id)
        ).all()
    }

    totals = _coverage_totals(db, subject_id)

    return {
        "subject_id": subject.id,
        "slug": subject.slug,
        "name": subject.name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        **_to_reinforce(db, student_id=student_id, subject=subject, skills=skills),
        # ⚠️ UN seul appel à `coverage()`, dont les deux blocs dérivent : il construit l'arbre
        # chapitre → leçon complet de la matière pour n'en garder que les totaux, l'appeler deux
        # fois le construirait deux fois.
        "in_progress": _in_progress(
            db, student_id=student_id, subject=subject, skills=skills, totals=totals
        ),
        "referentiel": _referentiel(totals),
    }


def _to_reinforce(db: Session, *, student_id: int, subject: Subject, skills: dict[int, str]) -> dict:
    """Notions fragiles **∪** lacunes ouvertes — l'union, jamais l'intersection.

    Les deux populations sont disjointes en droit : une notion peut être `weak` sans avoir jamais
    produit de `Gap` (mauvais score à un quiz de fin de cours, sans diagnostic), et une `Gap` peut
    rester ouverte alors que la maîtrise est repassée à `solid`. Le constat « N notions à
    renforcer » du dashboard compte les FRAGILES ; c'est `fragile_count` qui doit lui répondre.

    **Sans plafond** : celui de 8 du Conseil borne un prompt envoyé à un modèle, pas une liste que
    Papa lit à l'écran.
    """
    # Les lacunes viennent de la MÊME fonction que la page `/lacunes`, filtrées sur le slug — donc
    # attribuées par `Gap.subject_id`, comme `SubjectOut.gaps_open`. (Le Conseil, lui, groupe par
    # `Skill.subject_id` : les deux conventions peuvent diverger, l'écriture ne les contraint pas.
    # L'écart est BORNÉ par un test, il n'est pas résolu ici.)
    gaps = {
        g["skill_id"]: g
        for g in open_gaps(db, student_id=student_id)
        if g["subject_slug"] == subject.slug and g["skill_id"] is not None
    }

    # Hors boucle : une notion fragile sans lacune interroge cet ensemble, et le calculer par
    # notion aurait fait une requête par ligne de la liste.
    covered = skills_with_active_mission(db, student_id=student_id)
    mastery = evidence.mastery_by_skill(db, student_id=student_id)
    quiz_signal = evidence.weighted_quiz_signal(db, student_id=student_id)
    fragile_ids = {
        skill_id
        for skill_id in skills
        if (mastery.get(skill_id) or {}).get("status") in p.FRAGILE_STATUSES
    }

    notions = []
    for skill_id in fragile_ids | set(gaps):
        gap = gaps.get(skill_id)
        row = mastery.get(skill_id) or {}
        score = row.get("mastery")
        notions.append(
            {
                "skill_id": skill_id,
                "skill_name": skills.get(skill_id) or (gap or {}).get("skill_name") or "Notion",
                "is_fragile": skill_id in fragile_ids,
                "has_open_gap": gap is not None,
                "severity": gap["severity"] if gap else None,
                "gap_status": gap["status"] if gap else None,
                "first_detected_at": gap["first_detected_at"] if gap else None,
                "mastery_status": row.get("status"),
                "mastery_score": round(score) if score is not None else None,
                "weak_quiz_signal": quiz_signal.get(skill_id),
                "last_seen_at": _iso(row.get("last_seen_at")),
                # ⚠️ Le drapeau vient de `open_gaps` quand la notion porte une lacune — sinon la
                # page `/lacunes` et le panneau pourraient se contredire sur la MÊME notion.
                "has_active_mission": (
                    gap["has_active_mission"] if gap else skill_id in covered
                ),
            }
        )

    # Le plus urgent d'abord : lacune la plus grave, puis maîtrise la plus basse, puis le nom pour
    # que l'ordre soit stable d'un appel à l'autre.
    notions.sort(
        key=lambda n: (
            SEVERITY_RANK.get(n["severity"], _NO_GAP_RANK),
            n["mastery_score"] if n["mastery_score"] is not None else 0,
            n["skill_name"],
        )
    )

    return {
        "to_reinforce": notions,
        "fragile_count": sum(1 for n in notions if n["is_fragile"]),
        "open_gap_count": sum(1 for n in notions if n["has_open_gap"]),
        "without_mission_count": sum(1 for n in notions if not n["has_active_mission"]),
    }


def _in_progress(
    db: Session, *, student_id: int, subject: Subject, skills: dict[int, str], totals: dict
) -> dict:
    """Ce qui tourne déjà sur la matière — pour ne pas commander deux fois la même chose."""
    missions = [
        {
            "id": m.id,
            "title": m.title,
            "mission_type": m.mission_type,
            "status": m.status,
            "validation_status": m.validation_status,
            "skill_id": m.skill_id,
            "skill_name": skills.get(m.skill_id) if m.skill_id else None,
        }
        for m in active_missions(db, student_id=student_id, subject_id=subject.id)
    ]

    # `srs_pressure` est indexé par `Skill.subject_id` — c'est le RETARD, pas la charge à venir.
    pressure = evidence.srs_pressure(db, student_id=student_id).get(subject.id) or {}

    return {
        "missions": missions,
        "pending_content": totals["pending_count"],
        "stale_content": totals["stale_count"],
        "review_overdue": pressure.get("due", 0),
        "review_max_overdue_days": pressure.get("max_overdue_days", 0),
    }


def _referentiel(totals: dict) -> dict:
    return {
        # `false` = aucune leçon dans l'année active pour cette matière. Lancer un conseil dessus
        # n'aurait rien à narrer.
        "has_referentiel": totals["lessons"] > 0,
        "lessons": totals["lessons"],
        "lessons_validated": totals["lessons_validated"],
        "courses_written": totals["courses_written"],
        "derivatives_percent": totals["derivatives_percent"],
    }


def _coverage_totals(db: Session, subject_id: int) -> dict:
    """Totaux de production de la matière, tels que la page « Couverture » les compte.

    ⚠️ `coverage()` construit l'arbre chapitre → leçon COMPLET pour n'en garder que `totals`. Coût
    accepté pour UNE matière ; si le panneau ralentit, extraire un `coverage_totals` — mais en le
    faisant consommer par `coverage()` lui-même, pour ne pas créer une seconde façon de compter les
    leçons validées.
    """
    from app.modules.production.coverage import coverage

    return coverage(db, subject_id=subject_id)["totals"]


def _iso(value) -> str | None:
    return value.isoformat() if value is not None else None
