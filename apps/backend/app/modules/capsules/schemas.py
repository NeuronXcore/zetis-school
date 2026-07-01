"""Miroir Pydantic **strict** du type partagé `CapsuleSpec` (`packages/types/src/capsule.ts`).

Couche de garantie dure (ADR-0007) : `model_validate` rejette toute sortie LLM hors des
bornes. Rien d'invalide n'est jamais persisté ni renvoyé — le code ne « répare » pas
silencieusement une valeur hors bornes. `extra="forbid"` partout : aucun champ en trop toléré.
"""

from datetime import datetime
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator

# Contraintes de format (fixées par l'ADR-0007 ; le rendu Remotion suppose ces valeurs).
FPS = 30
WIDTH = 1280
HEIGHT = 720
MIN_SCENES = 4
MAX_SCENES = 7
MIN_DURATION = 60
# Plafond haut : une scène peut être allongée pour tenir toute sa narration vocale
# (« la voix pilote la durée »). Le prompt continue de viser des scènes courtes.
MAX_DURATION = 600


class _SceneBase(BaseModel):
    """Champs communs à toutes les scènes (durée bornée + refus des champs inconnus)."""

    model_config = ConfigDict(extra="forbid")
    durationInFrames: int = Field(ge=MIN_DURATION, le=MAX_DURATION)
    # `narration` : texte parlé écrit par le LLM. `audioUrl` : piste TTS remplie par le serveur.
    narration: str | None = None
    audioUrl: str | None = None


class TitleScene(_SceneBase):
    kind: Literal["title"]
    title: str
    subtitle: str | None = None


class BulletScene(_SceneBase):
    kind: Literal["bullet"]
    heading: str
    points: list[str]


class DefinitionScene(_SceneBase):
    kind: Literal["definition"]
    term: str
    body: str
    example: str | None = None


class Mark(BaseModel):
    """Une marque sur la droite graduée. `value` entier ; `color` = hex optionnel."""

    model_config = ConfigDict(extra="forbid")
    value: int
    label: str | None = None
    color: str | None = None


class NumberlineScene(_SceneBase):
    kind: Literal["numberline"]
    min: int
    max: int
    marks: list[Mark]

    @model_validator(mode="after")
    def _check_bounds(self) -> "NumberlineScene":
        if self.min >= self.max:
            raise ValueError("numberline : min doit être strictement inférieur à max.")
        return self


class BarmodelScene(_SceneBase):
    """Barre découpée en `parts` cellules égales dont `filled` sont remplies
    (fractions, proportions, pourcentages)."""

    kind: Literal["barmodel"]
    heading: str | None = None
    parts: int = Field(ge=2, le=12)
    filled: int = Field(ge=0)
    caption: str | None = None

    @model_validator(mode="after")
    def _check_filled(self) -> "BarmodelScene":
        if self.filled > self.parts:
            raise ValueError("barmodel : filled ne peut pas dépasser parts.")
        return self


# Union discriminée sur `kind` : le validateur choisit le bon modèle sans ambiguïté.
CapsuleSceneModel = Annotated[
    Union[TitleScene, BulletScene, DefinitionScene, NumberlineScene, BarmodelScene],
    Field(discriminator="kind"),
]


class CapsuleSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    subject: str
    skill: str | None = None
    level: str
    fps: int
    width: int
    height: int
    scenes: list[CapsuleSceneModel]

    @model_validator(mode="after")
    def _check(self) -> "CapsuleSpec":
        if self.fps != FPS:
            raise ValueError(f"fps doit valoir {FPS} (reçu {self.fps}).")
        if self.width != WIDTH:
            raise ValueError(f"width doit valoir {WIDTH} (reçu {self.width}).")
        if self.height != HEIGHT:
            raise ValueError(f"height doit valoir {HEIGHT} (reçu {self.height}).")
        n = len(self.scenes)
        if not (MIN_SCENES <= n <= MAX_SCENES):
            raise ValueError(f"scenes : entre {MIN_SCENES} et {MAX_SCENES} scènes (reçu {n}).")
        # Sûr après le contrôle de cardinalité : n >= MIN_SCENES >= 1.
        if self.scenes[0].kind != "title":
            raise ValueError("La première scène doit être de type 'title'.")
        return self


def generation_schema() -> dict:
    """Schéma JSON pour la sortie structurée ollama : identique à `CapsuleSpec` mais avec
    `narration` REQUISE (chaîne non vide) sur chaque scène. Le grammar contraint force ainsi
    le LLM à écrire la narration, alors que le stockage/affichage la garde optionnelle (les
    capsules d'avant la voix restent valides). `audioUrl` reste facultatif (rempli côté serveur).
    """
    schema = CapsuleSpec.model_json_schema()
    for defn in schema.get("$defs", {}).values():
        props = defn.get("properties", {})
        if "narration" in props:
            props["narration"] = {"type": "string", "minLength": 1}
            required = defn.setdefault("required", [])
            if "narration" not in required:
                required.append("narration")
    return schema


# ---------------------------------------------------------------------------
# Lot 1 (ADR-0007) : requêtes/réponses CRUD Papa (capsules persistées).
# ---------------------------------------------------------------------------


# Choix Papa au moment de la génération (facultatifs → « auto »).
VisualChoice = Literal["auto", "numberline", "barmodel"]
DurationChoice = Literal["courte", "moyenne", "longue"]


class CapsuleCreateRequest(BaseModel):
    """`POST /api/capsules/generate` : génère + persiste une capsule (statut pending)."""

    model_config = ConfigDict(extra="forbid")

    subject_id: int
    instruction: str = Field(min_length=3)
    level: str | None = None
    skill_id: int | None = None
    visual: VisualChoice = "auto"
    duration: DurationChoice = "moyenne"


class CapsuleRegenerateRequest(BaseModel):
    """`POST /api/capsules/{id}/regenerate` : réinstruit (optionnel) et régénère."""

    model_config = ConfigDict(extra="forbid")

    instruction: str | None = None
    visual: VisualChoice = "auto"
    duration: DurationChoice = "moyenne"


class CapsuleUpdateSpecRequest(BaseModel):
    """`PUT /api/capsules/{id}/spec` : remplace le spec (revalidé, repasse en pending)."""

    model_config = ConfigDict(extra="forbid")

    spec: CapsuleSpec


class CapsuleListItem(BaseModel):
    id: int
    title: str
    subject: str
    validation_status: str
    scenes_count: int
    updated_at: datetime | None = None


class CapsuleOut(BaseModel):
    id: int
    subject_id: int
    subject: str
    skill_id: int | None = None
    title: str
    instruction: str | None = None
    validation_status: str
    spec: CapsuleSpec
    created_at: datetime | None = None
    updated_at: datetime | None = None
