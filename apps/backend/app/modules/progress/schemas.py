"""Schémas HTTP de la progression (lacunes ouvertes, notions consolidées).

Miroir Pydantic de `packages/types/src/activity.ts` (section progression).
"""

from pydantic import BaseModel


class OpenGapOut(BaseModel):
    skill_id: int
    skill_name: str
    subject_slug: str | None = None
    subject_name: str | None = None
    severity: str  # low | medium | high
    status: str  # open | in_progress
    first_detected_at: str | None = None
    # Une mission `planned|active` couvre-t-elle déjà cette notion ? C'est ce qui sépare, dans la
    # page Lacunes, ce qui ATTEND une décision de Papa de ce qui est déjà en route. Calculé
    # serveur : le client ne recroise pas deux listes.
    has_active_mission: bool = False


class ConsolidatedSkillOut(BaseModel):
    skill_id: int
    skill_name: str
    subject_slug: str | None = None
    subject_name: str | None = None
    mastery_score: int
    last_seen_at: str | None = None


# --- Panneau d'analyse d'une matière (adr-0028-addendum-analyse-par-matiere) ---------------------
#
# ⚠️ Ce contrat ne sert QUE ce que l'agrégat du dashboard ne peut pas porter : des NOMS. Les
# compteurs de notions, les minutes, le calendrier, les créneaux et la charge SRS des 14 jours sont
# déjà dans `SubjectOut` — donc déjà en mémoire côté client. Les re-servir ici fabriquerait une
# seconde source pour une mesure affichée dans la bulle juste au-dessus, ce qui est précisément le
# bug que ce chantier corrige.
#
# Corollaire : rien ici ne dépend d'une PÉRIODE. C'est ce qui garantit que changer de période avec
# le panneau ouvert ne déclenche aucune requête.


class AnalysisNotionOut(BaseModel):
    """Une notion à renforcer, NOMMÉE.

    ⚠️ `is_fragile` et `has_open_gap` sont DEUX mesures distinctes, jamais additionnées :
    « fragile » est un statut de `SkillMastery` (`weak`/`learning`), « lacune ouverte » est une
    ligne `Gap`. Une notion peut être l'un sans l'autre. Les confondre a déjà coûté un bug.
    """

    skill_id: int
    skill_name: str
    is_fragile: bool
    has_open_gap: bool
    # Renseignés seulement si `has_open_gap` : une notion fragile n'a pas de sévérité.
    severity: str | None = None
    gap_status: str | None = None
    first_detected_at: str | None = None
    # Renseignés seulement si une ligne de maîtrise existe.
    mastery_status: str | None = None
    mastery_score: int | None = None
    # Signal quiz pondéré (ADR-0014), `None` si aucune tentative.
    weak_quiz_signal: float | None = None
    last_seen_at: str | None = None
    # MÊME source que la page `/lacunes` (`skills_with_active_mission`) : les deux surfaces ne
    # peuvent pas se contredire sur « est-ce déjà pris en charge ».
    has_active_mission: bool


class AnalysisMissionOut(BaseModel):
    id: int
    title: str
    mission_type: str
    status: str  # planned | active
    validation_status: str
    skill_id: int | None = None
    skill_name: str | None = None


class AnalysisInProgressOut(BaseModel):
    """Ce qui tourne déjà — pour ne pas commander deux fois la même chose."""

    missions: list[AnalysisMissionOut]
    pending_content: int
    stale_content: int
    # ⚠️ RETARD accumulé (`due_at <= maintenant`), à ne pas confondre avec `SubjectOut.review_load`,
    # qui est la charge À VENIR sur 14 jours. Deux mesures, deux noms — `srs_pressure` ne filtre
    # d'ailleurs pas les cartes suspendues, là où `review_load` le fait.
    review_overdue: int
    review_max_overdue_days: int


class AnalysisReferentielOut(BaseModel):
    """Y a-t-il seulement de quoi travailler ? Évite de lancer un conseil sur un programme vide."""

    has_referentiel: bool
    lessons: int
    lessons_validated: int
    courses_written: int
    derivatives_percent: int


class SubjectAnalysisOut(BaseModel):
    subject_id: int
    slug: str
    name: str
    generated_at: str
    # Fragiles ∪ lacunes ouvertes, les plus graves d'abord. NON PLAFONNÉ : le plafond de 8 du
    # Conseil borne un PROMPT, pas un panneau.
    to_reinforce: list[AnalysisNotionOut]
    # Redondants avec la liste, et c'est VOULU : ils rendent la cohérence vérifiable dans une seule
    # charge utile — par un test comme par un humain. C'est ce qui ferme le motif « un constat
    # annonce un nombre que sa preuve ne sert pas ».
    fragile_count: int
    open_gap_count: int
    without_mission_count: int
    in_progress: AnalysisInProgressOut
    referentiel: AnalysisReferentielOut
