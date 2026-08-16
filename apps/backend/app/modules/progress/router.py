"""Routes de progression (Papa) : détail des lacunes ouvertes et des notions consolidées.

Ces deux lectures servent le DÉTAIL des KPI correspondants du dashboard, dont les compteurs
vivent dans le payload `/api/parent/dashboard`. Réservées à Papa : ce sont des analyses
parentales, jamais servies à Massimo (CLAUDE.md §séparation des domaines).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import require_parent
from app.modules.eli5.service import get_default_student
from app.modules.progress import analysis, overview, service
from app.modules.progress import skills as skills_index_service
from app.modules.progress.schemas import (
    ConsolidatedSkillOut,
    OpenGapOut,
    ProgressionOverviewOut,
    SkillIndexOut,
    SkillTimelineOut,
    SubjectAnalysisOut,
)

router = APIRouter(
    prefix="/api/parent/progress", tags=["progress"], dependencies=[Depends(require_parent)]
)


@router.get("/gaps", response_model=list[OpenGapOut])
def open_gaps(db: Session = Depends(get_db)) -> list[dict]:
    """Lacunes ouvertes, les plus sévères d'abord (« notions à renforcer » côté UI)."""
    return service.open_gaps(db, student_id=get_default_student(db).id)


@router.get("/consolidated", response_model=list[ConsolidatedSkillOut])
def consolidated_skills(db: Session = Depends(get_db)) -> list[dict]:
    """Notions consolidées (`mastered`, score ≥ 90), la maîtrise la plus haute d'abord."""
    return service.consolidated_skills(db, student_id=get_default_student(db).id)


@router.get("/overview", response_model=ProgressionOverviewOut)
def progression_overview(db: Session = Depends(get_db)) -> dict:
    """L'avancement du programme, matière par matière — la page « Progression » (ADR-0038).

    **Une seule requête au montage** : les quatre colonnes sortent d'ici. Elle remplace un écran
    entièrement en mock, alors qu'il est la cible d'un constat cliquable du dashboard.

    ⚠️ **Aucun paramètre de période**, et ce n'est pas un oubli : tout ce que sert cette route est
    un stock (ADR-0038 §6). L'historique de la maîtrise vit déjà, borné, dans « Évolution de la
    mémoire » du dashboard ; en servir une seconde vue ici en ferait deux à tenir d'accord.
    """
    return overview.progression_overview(db, student_id=get_default_student(db).id)


@router.get("/skills", response_model=SkillIndexOut)
def skills_index(db: Session = Depends(get_db)) -> dict:
    """L'index des notions — la vue « Par notion » de Progression (adr-0040 §11).

    **Une passe agrégée**, un nombre de requêtes CONSTANT (sept), aucun N+1, aucune pagination et
    **aucun paramètre de période** : filtres, tri, recherche et bascule de vue sont client, zéro
    requête. Patron `adr-0024-zetis-galaxy-progression` (Amendement 6).

    ⚠️ Cette route était documentée dans `API_SPEC.md` sous un avertissement « JAMAIS
    implémentée » ; elle en sort en étant écrite. Les trois autres de cette section n'existent
    toujours pas et l'avertissement reste, borné à elles.
    """
    return skills_index_service.skills_index(db, student_id=get_default_student(db).id)


# ⚠️ Segment PARAMÉTRÉ, donc à déclarer APRÈS le `/skills` littéral ci-dessus — même piège que
# `/subjects/{subject_id}/analysis` plus bas.
@router.get("/skills/{skill_id}/timeline", response_model=SkillTimelineOut)
def skill_timeline(skill_id: int, db: Session = Depends(get_db)) -> dict:
    """La frise d'UNE notion, chargée au dépliage — PARESSEUSE.

    **Troisième exception assumée** au « zéro état de chargement » de l'`adr-0028 §4`, après le
    drill-down d'un jour et le panneau d'analyse d'une matière. Même motif : une descente vers un
    détail non borné, pas un filtre.
    """
    return skills_index_service.skill_timeline(
        db, student_id=get_default_student(db).id, skill_id=skill_id
    )


# ⚠️ Segment PARAMÉTRÉ, donc à déclarer APRÈS tout chemin littéral commençant par `/subjects`.
# Le module `reports` a déjà ce piège désamorcé de la même façon : `/class-council/equip-notion`
# est déclaré avant `/class-council/{report_id}`. Un futur `/subjects/summary` capté comme
# `subject_id` rendrait un 422 au lieu de sa réponse.
@router.get("/subjects/{subject_id}/analysis", response_model=SubjectAnalysisOut)
def subject_analysis(subject_id: int, db: Session = Depends(get_db)) -> dict:
    """Ce que l'agrégat du dashboard ne peut pas porter, pour UNE matière : les notions NOMMÉES.

    Chargée paresseusement au dépliage du panneau « Où agir » — **seconde exception** au « zéro
    état de chargement » de l'ADR-0028 §4, après le drill-down d'un jour, et pour le même motif :
    une liste nommée est non bornée, la précharger pour huit matières annulerait le bénéfice de
    l'agrégat unique.

    ⚠️ **Aucun paramètre de période**, volontairement : tout ce qui est fenêtré vit déjà dans
    `SubjectOut`. C'est ce qui garantit que changer de période avec le panneau ouvert ne déclenche
    aucune requête.

    Lecture seule, sans LLM — *l'analyse est l'évidence, le Conseil est la narration.*
    """
    return analysis.subject_analysis(
        db, student_id=get_default_student(db).id, subject_id=subject_id
    )
