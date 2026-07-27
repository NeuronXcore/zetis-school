"""Miroir Pydantic **strict** du type partagé `FicheSpec` (`packages/types/src/fiche.ts`) +
schémas d'E/S des routes (ADR-0015 §2).

Couche de garantie dure (patron ADR-0007) : `model_validate` rejette toute sortie LLM hors des
bornes ; rien d'invalide n'est jamais persisté ni renvoyé. `extra="forbid"` partout : aucun champ
en trop toléré. Les **bornes de listes** (`definitions` ≤ 4, `points_cles` ≤ 5, `erreurs_a_eviter`
≤ 3) et les **gardes de longueur** (`essentiel`, `mini_exemple`) SONT le budget structurel qui
garantit « 1 leçon = 1 page » — pas une consigne de prompt.
"""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

# --- Budget structurel (ADR-0015 §2). Modifier ces bornes = changer le contrat « 1 page ». ---
MAX_DEFINITIONS = 4
MAX_POINTS_CLES = 5
MAX_ERREURS = 3
MAX_ESSENTIEL_LEN = 600  # ~2-3 phrases
MAX_MINI_EXEMPLE_LEN = 400  # 0-1 court exemple
_MAX_TERME = 80
_MAX_DEFINITION = 300
_MAX_LIGNE = 160  # une puce / une erreur : courte

# Une ligne courte non vide (puce clé, erreur à éviter).
_Ligne = Annotated[str, Field(min_length=1, max_length=_MAX_LIGNE)]


class FicheDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    terme: str = Field(min_length=1, max_length=_MAX_TERME)
    definition: str = Field(min_length=1, max_length=_MAX_DEFINITION)


class FicheSpec(BaseModel):
    """Fiche de révision d'UNE leçon — vocabulaire fermé, sections à budget (ADR-0015 §2)."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=160)
    subject: str = Field(min_length=1, max_length=80)
    level: str = Field(min_length=1, max_length=20)
    chapter: str | None = Field(default=None, max_length=160)
    essentiel: str = Field(min_length=1, max_length=MAX_ESSENTIEL_LEN)
    definitions: list[FicheDefinition] = Field(default_factory=list, max_length=MAX_DEFINITIONS)
    points_cles: list[_Ligne] = Field(default_factory=list, max_length=MAX_POINTS_CLES)
    erreurs_a_eviter: list[_Ligne] = Field(default_factory=list, max_length=MAX_ERREURS)
    mini_exemple: str | None = Field(default=None, max_length=MAX_MINI_EXEMPLE_LEN)


# ---------------------------------------------------------------------------
# E/S des routes Papa + Massimo (fiches persistées).
# ---------------------------------------------------------------------------


class FicheGenerateRequest(BaseModel):
    """`POST /api/fiches/generate` : génère + persiste une fiche (statut `pending`)."""

    model_config = ConfigDict(extra="forbid")

    lesson_id: int


class FicheUpdateRequest(BaseModel):
    """`PUT /api/fiches/{id}` : remplace le spec (revalidé par le schéma → repasse `pending`)."""

    model_config = ConfigDict(extra="forbid")

    spec: FicheSpec


class FicheOut(BaseModel):
    """Fiche détaillée (éditeur Papa, viewer Massimo)."""

    id: int
    lesson_id: int
    title: str
    chapter: str | None = None
    subject_slug: str = ""
    validation_status: str
    spec: FicheSpec
    seen: bool = False


class FicheListItem(BaseModel):
    """Item de deck (grille matière) — sans le spec complet."""

    id: int
    lesson_id: int
    title: str
    chapter: str | None = None
    subject_slug: str = ""
    seen: bool = False


class FichePilotageLesson(BaseModel):
    """Une leçon validée d'une matière + ses fiches (toutes statuts) — pilotage Papa."""

    lesson_id: int
    title: str
    chapter: str | None = None
    has_content: bool
    fiches: list[FicheOut]


class FichePilotageSubject(BaseModel):
    id: int
    slug: str
    name: str


class FichePilotageTree(BaseModel):
    """Arbre de pilotage Papa d'une matière : ses leçons validées + leurs fiches (1 appel)."""

    subject: FichePilotageSubject
    lessons: list[FichePilotageLesson]


class FichesSummarySubject(BaseModel):
    """Une matière de l'année active + son compteur de fiches validées (grille de decks)."""

    slug: str
    name: str
    fiche_count: int
    new_count: int  # fiches validées jamais ouvertes (badge « Nouveau »)


class FichesSummaryOut(BaseModel):
    """Résumé des decks fiches (écran d'accueil Massimo) — matières de l'année active."""

    subjects: list[FichesSummarySubject]
