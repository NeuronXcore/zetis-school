"""Schémas de sortie de ZETIS Galaxy (ADR-0024) — surface ÉLÈVE.

Rien de ce qui relève du pilotage Papa n'entre ici : ni `validated_by`, ni fraîcheur,
ni `severity`, ni lacune. `intensity` est la seule valeur numérique exposée, et elle ne
s'affiche jamais telle quelle (elle module une luminosité).
"""

from typing import Literal

from pydantic import BaseModel

GalaxyStatus = Literal["unknown", "weak", "learning", "solid", "mastered"]
ActionKind = Literal["cours", "eli5", "fiche", "quiz", "mindmap", "revision", "capsule"]


class GalaxySubjectOut(BaseModel):
    """Une constellation en vue d'ensemble.

    `lit` est un COMPTE d'étoiles allumées, jamais un pourcentage : la page répond à
    « où j'en suis », elle ne note pas Massimo et ne classe pas ses matières (ADR-0024 §5).
    """

    subject_id: int
    name: str
    slug: str
    lit: int
    total: int


class GalaxyOverviewOut(BaseModel):
    """`GET /api/student/galaxy`."""

    subjects: list[GalaxySubjectOut]


class GalaxySubjectRef(BaseModel):
    subject_id: int
    name: str
    slug: str


class GalaxyNode(BaseModel):
    """Nœud du graphe — `subject` (cœur), `chapter` (amas) ou `skill` (étoile).

    Le nœud `subject` n'est pas décoratif : sans lui, chaque chapitre formerait une
    composante ISOLÉE que le moteur de forces éloignerait des autres — la constellation
    se disloquerait à l'écran.

    `skill_id`, `chapter_id`, `status` et `intensity` ne sont renseignés que pour une étoile.
    """

    id: str
    kind: Literal["root", "subject", "chapter", "skill"]
    label: str
    skill_id: int | None = None
    chapter_id: int | None = None
    status: GalaxyStatus | None = None
    intensity: int | None = None
    # Renseigné dans le GRAPHE GLOBAL uniquement : sans lui, un clic sur une étoile ne saurait
    # pas vers quelle constellation ouvrir. Inutile (et absent) dans une constellation, où la
    # matière est déjà connue.
    subject_slug: str | None = None


class GalaxyEdge(BaseModel):
    """Arête de STRUCTURE, la seule qui existe réellement (ADR-0024 §2).

    Aucun prérequis : `Skill.prerequisite_skill_ids` n'existe pas et `parent_skill_id`
    est NULL partout — ne pas en inventer.
    """

    source: str
    target: str
    type: Literal["structure"] = "structure"


class GalaxyConstellationOut(BaseModel):
    """`GET /api/student/galaxy/{subject_slug}`."""

    subject: GalaxySubjectRef
    nodes: list[GalaxyNode]
    edges: list[GalaxyEdge]


class GalaxyFullGraphOut(BaseModel):
    """`GET /api/student/galaxy/all` — TOUTES les matières dans un seul graphe.

    Porte un nœud `root` : sans lui, chaque matière formerait une composante isolée que le
    moteur de forces éloignerait, et la galaxie se disloquerait (même raison que le nœud
    `subject` dans une constellation).
    """

    nodes: list[GalaxyNode]
    edges: list[GalaxyEdge]


class GalaxyTimelinePoint(BaseModel):
    """Un jour de la frise. `lit` est CUMULÉ et ne décroît jamais."""

    date: str
    lit: int


class GalaxyTimelineOut(BaseModel):
    """`GET /api/student/galaxy/timeline` — le chemin parcouru, jamais un recul.

    Construite sur la PREMIÈRE fois où chaque notion a été travaillée (`learning_events`,
    append-only), et non sur l'état courant de `SkillMastery`, qui lui peut régresser.
    """

    points: list[GalaxyTimelinePoint]
    total: int
    # Renseigné SEULEMENT avec `?with_skills=true` (ADR-0029) : le rejeu animé a besoin de savoir
    # QUELLE étoile s'allume à quelle date, là où la frise ne veut qu'un compte. Opt-in pour ne
    # pas alourdir la charge utile des consommateurs existants.
    skills: list["GalaxySkillFirstLit"] | None = None


class GalaxySkillFirstLit(BaseModel):
    """Le jour où une notion a été travaillée pour la PREMIÈRE fois (ADR-0029 §2).

    Deux états seulement dans le rejeu : pas encore née, et allumée. On ne sert JAMAIS l'état de
    maîtrise à une date passée — il existe (`skill_mastery_history`) mais il est Papa-only et il
    RÉGRESSE : un rejeu bâti dessus montrerait des étoiles s'éteindre.
    """

    skill_id: int
    date: str


class GalaxyAction(BaseModel):
    """Une activité de ZETIS pour cette notion, disponible ou non.

    La panoplie complète est TOUJOURS renvoyée, chaque entrée portant sa disponibilité
    (décision du 2026-07-28, qui révise l'ADR-0024 §4). Massimo voit ainsi tout ce que
    ZETIS sait faire d'une notion, et ce qui n'existe pas encore est grisé.

    Ce n'est pas un manque de l'enfant : c'est du contenu que Papa n'a pas encore produit.
    Le libellé côté client ne doit jamais le formuler comme un échec.
    """

    kind: ActionKind
    available: bool
    lesson_id: int | None = None
    fiche_id: int | None = None
    quiz_id: int | None = None
    mindmap_id: int | None = None
    capsule_id: int | None = None


class GalaxyNotionOut(BaseModel):
    """`GET /api/student/galaxy/notion/{skill_id}` — contenu du panneau d'actions."""

    skill_id: int
    name: str
    status: GalaxyStatus
    chapter_title: str
    subject_slug: str
    subject_name: str
    actions: list[GalaxyAction]
