"""Missions croisées « champion » (ADR-0022) — UNE mission multi-matières, multi-outils.

Deux temps, patron preview/confirm sans état (ADR-0010/0018) :
- `resolve_champion_notions` : Papa fournit un scope (matières) + une **saveur** ∈
  {boss, consolidation, mix} ; ZETIS résout les notions travaillées de ces matières, les classe
  selon la saveur et en **propose** un sous-ensemble cochable (≥ 2 matières) — **rien en base** ;
- `create_champion_mission` : pour chaque notion cochée, ZETIS **équipe** le kit pédagogique
  (ADR-0021, réutilisé) **puis** compose UNE mission `champion` dont les étapes (mini-parcours
  `[mindmap] → [quiz] → eli5 → vocal_explain` par notion) sont **taggées `skill_id`** — le verdict
  d'acquisition PAR NOTION (ADR-0022) en dépend.

La champion est `validated` par construction (le clic Papa vaut approbation, ADR-0018/0021) et
**exclue du sélecteur quotidien** (jamais « mission du jour » — invariant ADR-0017 §6). Elle
dépasse volontairement le budget 15 min : c'est un défi, plafonné par `MISSION_CHAMPION_MAX_SKILLS`.
"""

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Mission, MissionStep, Skill, Subject, StudentProfile
from app.modules.ai.provider import EmbeddingProvider, LLMProvider
from app.modules.evidence import service as evidence
from app.modules.missions import pilot
from app.modules.missions import service as msvc

_FLAVORS = ("boss", "consolidation", "mix")

# Libellés de saveur (affichage Papa + description de mission — vocabulaire bienveillant CLAUDE.md).
_FLAVOR_LABEL = {
    "boss": "boss (notions bien maîtrisées)",
    "consolidation": "consolidation (notions à renforcer)",
    "mix": "mix (socle solide + défi)",
}


def _interleave(a: list[dict], b: list[dict]) -> list[dict]:
    """Fusionne deux classements en alternant, sans doublon (par `skill_id`) — ordre `mix`."""
    out: list[dict] = []
    seen: set[int] = set()
    for x, y in zip(a, b):
        for n in (x, y):
            if n["skill_id"] not in seen:
                seen.add(n["skill_id"])
                out.append(n)
    for n in a + b:  # complète si les listes sont de tailles différentes
        if n["skill_id"] not in seen:
            seen.add(n["skill_id"])
            out.append(n)
    return out


def _rank(notions: list[dict], flavor: str) -> list[dict]:
    """Classe les notions d'une matière selon la saveur (déterministe, `skill_id` en tie-break).
    boss → mieux maîtrisées d'abord ; consolidation → plus fragiles d'abord ; mix → alternance."""
    by_mastery = sorted(notions, key=lambda n: (-n["mastery"], n["skill_id"]))
    by_fragility = sorted(notions, key=lambda n: (-n["fragility"], n["skill_id"]))
    if flavor == "boss":
        return by_mastery
    if flavor == "consolidation":
        return by_fragility
    return _interleave(by_mastery, by_fragility)


def _worked_notions_by_subject(
    db: Session, student: StudentProfile, subject_ids: list[int]
) -> dict[int, list[dict]]:
    """Notions TRAVAILLÉES (avec une trace de maîtrise) des matières demandées, groupées par
    matière. Une champion se compose de notions déjà rencontrées (défi, pas découverte)."""
    mastery = evidence.mastery_by_skill(db, student_id=student.id)
    wanted = set(subject_ids)
    by_subject: dict[int, list[dict]] = {}
    for skill_id, info in mastery.items():
        skill = db.get(Skill, skill_id)
        if skill is None or skill.subject_id not in wanted:
            continue
        m = float(info.get("mastery", 0.0))
        by_subject.setdefault(skill.subject_id, []).append(
            {
                "skill_id": skill_id,
                "name": skill.name,
                "subject_id": skill.subject_id,
                "level": skill.level,
                "mastery": round(m, 2),
                "fragility": round(1.0 - m, 2),
                "status": info.get("status"),
            }
        )
    return by_subject


def _propose_checked(ranked_by_subject: dict[int, list[dict]], max_skills: int) -> set[int]:
    """Sélection proposée : round-robin sur les matières (une notion par matière avant la seconde)
    → garantit ≥ 2 matières dès que 2 matières ont des candidates. Déterministe."""
    subjects = sorted(ranked_by_subject.keys())
    picked: set[int] = set()
    depth = 0
    while len(picked) < max_skills and any(
        len(ranked_by_subject[s]) > depth for s in subjects
    ):
        for subject_id in subjects:
            if len(picked) >= max_skills:
                break
            lst = ranked_by_subject[subject_id]
            if len(lst) > depth:
                picked.add(lst[depth]["skill_id"])
        depth += 1
    return picked


def resolve_champion_notions(
    db: Session, student: StudentProfile, *, subject_ids: list[int], flavor: str
) -> dict:
    """Preview d'un défi champion : notions résolues + proposées cochées, sans rien écrire."""
    if flavor not in _FLAVORS:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Saveur inconnue : {flavor} (attendu : {', '.join(_FLAVORS)}).",
        )
    unique_subjects = list(dict.fromkeys(subject_ids))
    if len(unique_subjects) < 2:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Un défi champion croise au moins 2 matières — sélectionne-en 2.",
        )

    by_subject = _worked_notions_by_subject(db, student, unique_subjects)
    ranked_by_subject = {sid: _rank(lst, flavor) for sid, lst in by_subject.items()}
    max_skills = settings.mission_champion_max_skills
    checked = _propose_checked(ranked_by_subject, max_skills)

    # Liste plate ordonnée matière → rang de saveur, avec l'état coché.
    notions: list[dict] = []
    for subject_id in sorted(ranked_by_subject.keys()):
        subject = db.get(Subject, subject_id)
        for n in ranked_by_subject[subject_id]:
            notions.append(
                {
                    **n,
                    "subject_name": subject.name if subject is not None else "",
                    "checked": n["skill_id"] in checked,
                }
            )

    subjects_covered = len({n["subject_id"] for n in notions if n["checked"]})
    if subjects_covered < 2:
        compose_note = (
            "Pas assez de notions travaillées dans 2 matières pour composer un défi croisé. "
            "Fais quelques activités dans une autre matière, puis reviens."
        )
    else:
        n_checked = sum(1 for n in notions if n["checked"])
        compose_note = (
            f"ZETIS composera 1 défi champion sur {n_checked} notions "
            f"de {subjects_covered} matières — saveur {_FLAVOR_LABEL[flavor]}."
        )
    return {
        "flavor": flavor,
        "scope_label": "Défi champion 🏆",
        "notions": notions,
        "compose_note": compose_note,
    }


def _subjects_of(db: Session, skill_ids: list[int]) -> dict[int, Skill]:
    """{skill_id: Skill} pour les notions demandées ; 404 si une notion est introuvable."""
    out: dict[int, Skill] = {}
    for skill_id in skill_ids:
        skill = db.get(Skill, skill_id)
        if skill is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, detail=f"Notion {skill_id} introuvable."
            )
        out[skill_id] = skill
    return out


def _validate_champion(
    db: Session, skill_ids: list[int], flavor: str
) -> tuple[list[int], dict[int, Skill]]:
    """Garde-fous d'un défi champion (partagés par les deux entrées : modale Missions ET Conseil) :
    saveur connue, ≥ 1 notion, ≤ plafond, ≥ 2 matières distinctes. Renvoie (ids dédupliqués, skills)."""
    if flavor not in _FLAVORS:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Saveur inconnue : {flavor}."
        )
    unique_ids = list(dict.fromkeys(skill_ids))
    max_skills = settings.mission_champion_max_skills
    if not unique_ids:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Aucune notion cochée.")
    if len(unique_ids) > max_skills:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Au plus {max_skills} notions par défi champion.",
        )
    skills = _subjects_of(db, unique_ids)
    if len({s.subject_id for s in skills.values()}) < 2:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Un défi champion croise au moins 2 matières — coche des notions de 2 matières.",
        )
    return unique_ids, skills


def compose_champion_mission(
    db: Session, student: StudentProfile, *, skill_ids: list[int], flavor: str
) -> Mission:
    """Compose UNE mission `champion` croisée à partir de notions **déjà équipées** (SANS équiper).

    Cœur partagé : la modale Missions équipe puis appelle ceci ; le Conseil de classe (ADR-0022 §8)
    équipe chaque notion via le flux ADR-0021 puis appelle ceci. `subject_id`/`skill_id` NULL — la
    matière vit dans les étapes, taggées `skill_id` (verdict par notion). `validated` par construction."""
    unique_ids, skills = _validate_champion(db, skill_ids, flavor)
    subject_names = list(dict.fromkeys(_subject_name(db, s.subject_id) for s in skills.values()))
    mission = Mission(
        student_id=student.id,
        subject_id=None,
        skill_id=None,
        title="Défi champion 🏆",
        description=f"Défi croisé — {' × '.join(subject_names)}. Saveur : {_FLAVOR_LABEL[flavor]}.",
        mission_type="champion",
        status="planned",
        # Validée PAR CONSTRUCTION (ADR-0018/0021) : le clic Papa vaut approbation.
        validation_status="validated",
        priority=2,
        created_by="parent",
    )
    db.add(mission)
    db.flush()

    sort_order = 0
    for sid in unique_ids:
        skill_name = skills[sid].name
        # Rappel d'abord (notions déjà vues) : [mindmap] → [quiz] → eli5 → vocal_explain.
        for step_type, instruction, resource_id in msvc._build_steps(
            db, sid, skill_name, mission_type="remediation"
        ):
            db.add(
                MissionStep(
                    mission_id=mission.id,
                    step_type=step_type,
                    instruction=instruction,
                    resource_id=resource_id,
                    skill_id=sid,  # ADR-0022 : chaque étape porte SA notion
                    sort_order=sort_order,
                    status="pending",
                )
            )
            sort_order += 1

    db.commit()
    return mission


def create_champion_mission(
    db: Session,
    student: StudentProfile,
    *,
    skill_ids: list[int],
    flavor: str,
    llm: LLMProvider,
    embedder: EmbeddingProvider,
) -> dict:
    """Confirm (modale Missions) : équipe chaque notion (ADR-0021) PUIS compose la mission croisée.

    Retourne la mission (schéma pilot) + le résumé d'équipement par notion."""
    unique_ids, _skills = _validate_champion(db, skill_ids, flavor)  # valider AVANT d'équiper
    # Équiper chaque notion AVANT de composer (ADR-0021 déc. 4). Import paresseux → pas de cycle.
    from app.modules.reports.service import equip_notion

    equipment = [
        equip_notion(db, skill_id=sid, llm=llm, embedder=embedder) for sid in unique_ids
    ]
    mission = compose_champion_mission(db, student, skill_ids=unique_ids, flavor=flavor)
    return {"mission": pilot._to_pilot_out(db, mission), "equipment": equipment}


def _subject_name(db: Session, subject_id: int | None) -> str:
    if subject_id is None:
        return ""
    subject = db.get(Subject, subject_id)
    return subject.name if subject is not None else ""
