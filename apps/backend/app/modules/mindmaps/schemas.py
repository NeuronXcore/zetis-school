"""Miroir Pydantic **strict** du type partagé `MindmapJson` (`packages/types/src/mindmap.ts`) +
schémas d'E/S des routes (ADR-0016).

Couche de garantie dure (patron ADR-0007) : `model_validate` rejette toute sortie LLM hors des
bornes ; rien d'invalide n'est jamais persisté ni renvoyé. `extra="forbid"` partout.

ARBRE STRICT (décision ADR-0016) : les nœuds sont reliés par `parent` (None = racine). Le
validateur vérifie l'**intégrité de l'arbre** — ids uniques, chaque `parent` référence un id
existant ou None, **aucun cycle** — et que `required_nodes`/`optional_nodes` (+ `edges`) ne
pointent que vers des nœuds existants. **Aucune position** ici : le layout est client (Slice B).
"""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

# --- Bornes structurelles (une carte reste lisible pour un enfant ; borne anti-emballement LLM). ---
MAX_NODES = 60
_MAX_CENTER = 160
_MAX_ID = 40
_MAX_LABEL = 120


class MindmapNode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=_MAX_ID)
    label: str = Field(min_length=1, max_length=_MAX_LABEL)
    parent: str | None = None  # None → racine (branche de premier niveau, accrochée au centre)


class MindmapEdge(BaseModel):
    # `from` est un mot-clé Python → champ `from_` avec alias JSON `from` (populate_by_name pour
    # accepter aussi `from_` en interne).
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    from_: str = Field(min_length=1, max_length=_MAX_ID, alias="from")
    to: str = Field(min_length=1, max_length=_MAX_ID)


_NodeId = Annotated[str, Field(min_length=1, max_length=_MAX_ID)]


class MindmapJson(BaseModel):
    """Carte mentale d'UNE leçon — arbre strict, SANS positions (ADR-0016)."""

    model_config = ConfigDict(extra="forbid")

    center: str = Field(min_length=1, max_length=_MAX_CENTER)
    nodes: list[MindmapNode] = Field(min_length=1, max_length=MAX_NODES)
    edges: list[MindmapEdge] | None = None
    required_nodes: list[_NodeId] | None = None
    optional_nodes: list[_NodeId] | None = None

    @model_validator(mode="after")
    def _validate_tree_integrity(self) -> "MindmapJson":
        ids = [n.id for n in self.nodes]
        id_set = set(ids)
        if len(id_set) != len(ids):
            raise ValueError("ids de nœuds non uniques")

        # Chaque parent référence un id existant ou None.
        parent_of: dict[str, str | None] = {n.id: n.parent for n in self.nodes}
        for node in self.nodes:
            if node.parent is not None and node.parent not in id_set:
                raise ValueError(f"parent inconnu pour le nœud « {node.id} » : {node.parent}")

        # Aucun cycle : la remontée des parents doit atteindre None sans revisiter un nœud.
        for node in self.nodes:
            seen: set[str] = set()
            current: str | None = node.id
            while current is not None:
                if current in seen:
                    raise ValueError(f"cycle détecté sur le nœud « {node.id} »")
                seen.add(current)
                current = parent_of.get(current)

        # edges (optionnels) : extrémités = des nœuds existants.
        for edge in self.edges or []:
            if edge.from_ not in id_set or edge.to not in id_set:
                raise ValueError(f"arête vers un nœud inconnu : {edge.from_} → {edge.to}")

        # required / optional : sous-ensembles des ids, disjoints.
        req = set(self.required_nodes or [])
        opt = set(self.optional_nodes or [])
        unknown = (req | opt) - id_set
        if unknown:
            raise ValueError(f"required/optional pointent vers des nœuds inconnus : {unknown}")
        if req & opt:
            raise ValueError(f"nœuds à la fois requis et optionnels : {req & opt}")
        return self


# ---------------------------------------------------------------------------
# E/S des routes Papa + Massimo (mindmaps persistées).
# ---------------------------------------------------------------------------


class MindmapGenerateRequest(BaseModel):
    """`POST /api/mindmaps/generate` : génère + persiste une mindmap (statut `pending`)."""

    model_config = ConfigDict(extra="forbid")

    lesson_id: int


class MindmapUpdateRequest(BaseModel):
    """`PUT /api/mindmaps/{id}` : remplace le `mindmap_json` (revalidé → repasse `pending`)."""

    model_config = ConfigDict(extra="forbid")

    mindmap_json: MindmapJson


class MindmapOut(BaseModel):
    """Mindmap détaillée (éditeur Papa, viewer Massimo)."""

    id: int
    lesson_id: int
    title: str  # = mindmap_json.center
    chapter: str | None = None
    subject_slug: str = ""
    validation_status: str
    mindmap_json: MindmapJson


class MindmapListItem(BaseModel):
    """Item de deck (grille matière) — sans le `mindmap_json` complet."""

    id: int
    lesson_id: int
    title: str
    chapter: str | None = None
    subject_slug: str = ""


class MindmapPilotageLesson(BaseModel):
    """Une leçon validée d'une matière + ses mindmaps (tous statuts) — pilotage Papa."""

    lesson_id: int
    title: str
    chapter: str | None = None
    has_content: bool
    mindmaps: list[MindmapOut]


class MindmapPilotageSubject(BaseModel):
    id: int
    slug: str
    name: str


class MindmapPilotageTree(BaseModel):
    """Arbre de pilotage Papa d'une matière : ses leçons validées + leurs mindmaps (1 appel)."""

    subject: MindmapPilotageSubject
    lessons: list[MindmapPilotageLesson]


# --- Reconstruction (mode `student_reconstruction`) : évaluation SERVEUR, déterministe. ---


class MindmapsSummarySubject(BaseModel):
    """Une matière de l'année active + son compteur de cartes validées (grille de decks)."""

    slug: str
    name: str
    mindmap_count: int


class MindmapsSummaryOut(BaseModel):
    """Résumé des decks mindmaps (écran d'accueil Massimo) — matières de l'année active."""

    subjects: list[MindmapsSummarySubject]


class MindmapNodePlacement(BaseModel):
    """Un nœud placé par l'élève : le nœud `node_id` est accroché sous `parent_id` (None = centre).

    Aucune position (x/y) : la structure seule est notée — le placement visuel est client (ADR-0016).
    """

    model_config = ConfigDict(extra="forbid")

    node_id: str = Field(min_length=1, max_length=_MAX_ID)
    parent_id: str | None = None


class MindmapReconstructionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    placements: list[MindmapNodePlacement] = Field(default_factory=list, max_length=MAX_NODES)
    # Nombre de tentatives ratées de la séance (mode reconstruction) — réduit l'XP à la réussite.
    # Ignoré par `/evaluate` (pur). Borné pour éviter tout abus.
    failed_attempts: int = Field(default=0, ge=0, le=100)


class MindmapNodeEval(BaseModel):
    """Détail juste/faux d'UN nœud attendu (sortie de l'évaluation serveur)."""

    node_id: str
    label: str
    expected_parent: str | None
    placed_parent: str | None
    placed: bool
    correct: bool
    optional: bool


class MindmapReconstructionResult(BaseModel):
    """Résultat pur d'une évaluation (`/evaluate` — sans persistance ni XP)."""

    score: int
    correct_count: int
    expected_count: int
    details: list[MindmapNodeEval]


class MindmapAttemptResult(MindmapReconstructionResult):
    """Résultat d'une tentative persistée (`/attempts` — score + XP serveur)."""

    attempt_id: int
    xp_awarded: int
