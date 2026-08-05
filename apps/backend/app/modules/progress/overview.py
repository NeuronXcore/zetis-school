"""Avancement du programme, matière par matière — le contrat de la page « Progression » (ADR-0038).

Cette lecture remplace un écran **entièrement en mock** : `/progression` rendait un pourcentage,
un XP et un compte de lacunes qui ne venaient d'aucune mesure, alors qu'elle est la cible d'un
constat cliquable du dashboard qui se dit adossé à une trace comptée.

**La barre mesure l'AVANCEMENT, pas l'acquisition** (ADR-0038 §1) : `engaged / notions.total`, où
« engagée » = toute notion portant une ligne de maîtrise (consolidée ∪ fragile ∪ en cours). Sur les
données réelles il y a **1 notion consolidée sur 280** — une barre `mastered / total` afficherait
zéro pour sept matières sur huit pendant des mois, soit un écran vrai et sans pouvoir
discriminant. Les acquis restent servis **à part** (`notions.consolidated`), jamais fondus dans
l'avancement : « où en est-on » et « qu'est-ce qui est acquis » sont deux questions.

⚠️ **Rien n'est recalculé ici** — même règle que `analysis.py`, et pour le même motif. Chaque
nombre vient de la fonction qui fait déjà autorité ailleurs :

| Nombre | Autorité |
|---|---|
| statuts des notions | `evidence.mastery_by_skill` + la projection PURE `p.notions_breakdown` |
| référentiel | `dashboard.service._referentiel_subjects` — la définition du constat qui pointe ici |
| lacunes ouvertes | `progress.service.open_gaps` — la source de la page `/lacunes` |
| XP par matière | `gamification.xp_by_subject` |

Une seconde façon de compter est exactement le défaut que ce chantier corrige : un constat qui
annonce N et une cible qui en montre un autre.

⚠️ **Aucune fenêtre temporelle, aucune série, aucune action** (ADR-0038 §6). Tout est un stock, lu
« à aujourd'hui ». L'historique de la maîtrise existe déjà, borné, dans « Évolution de la mémoire »
du dashboard ; agir se fait depuis « Où agir », les missions ou le Conseil.

⚠️ **Fichier séparé de `service.py`**, comme `analysis.py` : `evidence/service.py` importe déjà
`progress.service.OPEN_GAP_STATUSES`. Ce module-ci importe les deux ; `progress.service` reste
intact et ne connaît ni `evidence` ni `dashboard`.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Skill, StudentProfile, Subject
from app.modules.dashboard import projections as p

# ⚠️ Deux fonctions PRIVÉES du dashboard, importées volontairement plutôt que réécrites.
# `_referentiel_subjects` porte LA définition qu'affiche le constat dont cette page est la cible :
# « la matière a au moins un chapitre dans l'année active ». Le dépôt en héberge une seconde —
# `analysis._referentiel`, qui exige au moins une LEÇON — et les deux ne disent pas la même chose.
# Deux écrans reliés par un lien qui se contrediraient sur la même matière feraient mentir la
# preuve une fois de plus : c'est celle du dashboard qui fait foi ici, pas la plus exigeante.
# (Précédent d'import inter-module d'un privé : `galaxy/service.py` → `curriculum._active_year_or_404`.)
from app.modules.dashboard.service import _active_year, _referentiel_subjects
from app.modules.evidence import service as evidence
from app.modules.gamification.service import xp_by_subject
from app.modules.progress.service import open_gaps


def progression_overview(db: Session, *, student_id: int) -> dict:
    """L'avancement du programme pour TOUTES les matières, en une seule lecture.

    Une seule requête au montage de la page : les quatre colonnes (avancement, acquis, XP, à
    renforcer) sortent d'ici, et rien en aval n'a de second appel à faire.
    """
    student = db.get(StudentProfile, student_id)
    year = _active_year(db, student_id)
    with_referentiel = _referentiel_subjects(db, year.id if year else None)

    mastery = evidence.mastery_by_skill(db, student_id=student_id)
    xp = xp_by_subject(db, student).by_subject if student is not None else {}

    skills_by_subject: dict[int, list[int]] = {}
    for subject_id, skill_id in db.execute(select(Skill.subject_id, Skill.id)).all():
        skills_by_subject.setdefault(subject_id, []).append(skill_id)

    # Attribuées par `Gap.subject_id` (via le slug que sert `open_gaps`) — la MÊME convention que
    # `SubjectOut.gaps_open` du dashboard et que la page `/lacunes` vers laquelle cette colonne
    # renvoie. Le Conseil, lui, groupe par `Skill.subject_id` : l'écart entre les deux conventions
    # est borné par un test ailleurs, il n'est pas résolu ici.
    gaps_by_slug: dict[str, int] = {}
    for gap in open_gaps(db, student_id=student_id):
        slug = gap.get("subject_slug")
        if slug:
            gaps_by_slug[slug] = gaps_by_slug.get(slug, 0) + 1

    subjects = []
    # Même ordre que le dashboard, et TOUTES les matières : une matière masquée se lirait « elle
    # n'existe pas » alors qu'elle veut dire « rien n'y a encore commencé ».
    for subject in db.scalars(select(Subject).order_by(Subject.sort_order, Subject.name)):
        skill_ids = skills_by_subject.get(subject.id, [])
        statuses = [
            mastery[skill_id]["status"] for skill_id in skill_ids if skill_id in mastery
        ]
        notions = p.notions_breakdown(statuses, len(skill_ids))

        subjects.append(
            {
                "subject_id": subject.id,
                "slug": subject.slug,
                "name": subject.name,
                "color": subject.color,
                "icon": subject.icon,
                "notions": notions,
                # Les TROIS segments engagés, jamais deux. `in_progress` est celui que tout
                # mapping écrit à la main oublie — et l'oublier ferait une barre qui recule quand
                # une notion consolidée redevient fragile puis « en cours ».
                "engaged": notions["consolidated"] + notions["fragile"] + notions["in_progress"],
                "xp": xp.get(subject.id, 0),
                "gaps_open": gaps_by_slug.get(subject.slug, 0),
                # ⚠️ Distinct de `notions.total == 0` : une matière peut avoir ses chapitres sans
                # qu'aucune notion y soit rattachée. Confondre les deux ferait écrire
                # « référentiel non généré » sur un référentiel qui existe mais reste vide.
                "has_referentiel": subject.id in with_referentiel,
            }
        )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "school_year": {"label": year.label, "level": year.level} if year else None,
        "subjects": subjects,
    }
