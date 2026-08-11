"""Schémas de sortie de ZETIS Galaxy (ADR-0024) — surface ÉLÈVE.

Rien de ce qui relève du pilotage Papa n'entre ici : ni `validated_by`, ni fraîcheur,
ni `severity`, ni lacune. `intensity` est la seule valeur numérique exposée, et elle ne
s'affiche jamais telle quelle (elle module une luminosité).
"""

from typing import Literal

from pydantic import BaseModel

GalaxyStatus = Literal["unknown", "weak", "learning", "solid", "mastered"]
ActionKind = Literal["cours", "eli5", "fiche", "quiz", "mindmap", "revision", "capsule"]


class SubjectXPOut(BaseModel):
    """Ce que Massimo a GAGNÉ dans cette matière — jamais ce qu'il y vaut.

    Autorisé depuis l'addendum ADR-0024 « page matière onglets » (2026-08-11), qui **révise une
    lecture** du §5 sans le rouvrir : le §5 interdit de *noter Massimo* et de *mettre ses matières
    en concurrence*. Un XP ne fait ni l'un ni l'autre — il compte ce qui a été **fait**, il ne peut
    que **monter**, et sur la page d'UNE matière il n'y a rien à côté de quoi se comparer.

    ⚠️ **C'est la juxtaposition qui est interdite, pas le nombre** : sur `/matieres`, ces valeurs
    ne doivent jamais ORDONNER ni DÉSIGNER (aucun tri par XP, aucune « meilleure matière »).
    Rien ici ne l'empêche techniquement — seul l'ADR le tient.

    ⚠️ **Toujours pas de pourcentage, toujours pas de `mastery_score`.** Ce bloc dit l'effort ;
    la maîtrise reste un `status` par notion, et rien d'autre.
    """

    total: int
    level: int
    into_level: int
    for_next: int


class GalaxySubjectOut(BaseModel):
    """Une constellation en vue d'ensemble.

    `lit` est un COMPTE d'étoiles allumées, jamais un pourcentage : la page répond à
    « où j'en suis », elle ne note pas Massimo et ne classe pas ses matières (ADR-0024 §5).

    ⚠️ **L'ordre de cette liste est celui du RÉFÉRENTIEL** (`Subject.sort_order`), et le rester
    est une décision, pas un détail d'implémentation : trier par `xp`, `lit` ou `mastered`
    transformerait la liste en podium — la mise en concurrence des matières que le §5 interdit.
    Le client ne réordonne pas non plus.
    """

    subject_id: int
    name: str
    slug: str
    lit: int
    total: int
    # Ajoutés le 2026-08-11 (addendum ADR-0024 « page matière onglets ») pour débrancher la
    # grille `/matieres` de ses données mockées. Aucune requête supplémentaire : `mastered` se
    # tire de la maîtrise déjà chargée, `xp` d'un seul agrégat pour toutes les matières.
    xp: SubjectXPOut
    # Combien de notions Massimo **tient** dans cette matière. Un COMPTE, jamais un ratio — et
    # surtout aucun pendant « à renforcer » : le §5 interdit de classer les matières, et
    # désigner les faibles est la forme la plus directe de ce classement. Ce qu'il y a à
    # travailler se dit ailleurs, en MISSION — un geste, pas un verdict.
    mastered: int


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


class PanoplyNotionOut(BaseModel):
    """Une notion dans l'index de matière : son état, et ce que ZETIS sait en faire.

    ⚠️ **Aucun `mastery_score`, aucun `intensity`, aucun pourcentage.** `status` seul
    (ADR-0024 §5). Une valeur numérique servie ici finirait affichée : la page matière ne note
    pas Massimo, elle décrit le catalogue.
    """

    skill_id: int
    name: str
    status: GalaxyStatus
    actions: list[GalaxyAction]


class PanoplyChapterOut(BaseModel):
    """Un chapitre de l'index — dans l'ordre du référentiel, jamais un classement."""

    chapter_id: int
    title: str
    notions: list[PanoplyNotionOut]


class SubjectPanoplyOut(BaseModel):
    """`GET /api/student/subjects/{subject_slug}/panoply` — l'index de notions d'une matière.

    Même modèle que la constellation, rendu en liste : c'est le repli sans WebGL de
    `zetis-galaxy.md §11`. `chapters: []` si la matière n'a encore rien de validé — un état
    positif, pas une erreur.
    """

    subject: GalaxySubjectRef
    # ⚠️ Servi MÊME quand `chapters` est vide : Massimo peut avoir gagné du XP dans une matière
    # dont plus aucun chapitre n'est validé aujourd'hui. Taire son effort parce que le catalogue
    # de Papa a bougé effacerait du travail réel.
    subject_xp: SubjectXPOut
    chapters: list[PanoplyChapterOut]


class ResumeItemOut(BaseModel):
    """Un contenu que Massimo peut ROUVRIR tel quel.

    🔴 **`kind` ne vaut que `cours` ou `quiz`**, et ce n'est pas une restriction temporaire :
    ce sont les deux seules surfaces adressables par identifiant. `fiche` ouvre son deck,
    `revision` LANCE une session — nommer un contenu précis pour atterrir ailleurs serait la
    dette « le libellé sur-promet » déjà consignée sur `capsule_id`.

    ⚠️ **`title` est résolu SERVEUR**, jamais lu depuis le payload du journal : celui-ci fige le
    titre à l'instant du clic, donc il est périmé dès que Papa renomme.
    """

    kind: Literal["cours", "quiz"]
    title: str

    target_id: int
    at: str | None


class SubjectResumeOut(BaseModel):
    """`GET /api/student/subjects/{subject_slug}/resume`.

    `items: []` quand rien n'est réouvrable — un état normal, jamais une erreur. La carte ne se
    rend pas dans ce cas : un « Reprendre » vide serait un réceptacle vide.
    """

    subject: GalaxySubjectRef
    items: list[ResumeItemOut]
