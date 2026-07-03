"""Schémas du référentiel de programme — passe 1 : chapitres (ADR-0009).

`GeneratedChapters` = miroir Pydantic **strict** de la sortie LLM (couche de garantie
dure, pattern CapsuleSpec) : `extra="forbid"` partout, rien d'invalide n'est persisté.
Bornes 3-25 chapitres — leçon du bench T4 : la borne 15 du schéma jetable était fausse
(Sonnet produit ~20 chapitres à la granularité « chapitre de manuel » que ZETIS vise).
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MIN_CHAPTERS = 3
MAX_CHAPTERS = 25


class GeneratedChapter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=160)
    description: str
    themes: list[str]
    suggested_class: str  # ex: "5e", "4e", "3e"
    # "officielle" = conforme aux repères annuels de progression 2019 (français, maths,
    # EMC) ; "interpretee" = répartition indicative (autres matières). Cf. ADR-0009 §5.
    repartition: Literal["officielle", "interpretee"]


class GeneratedChapters(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject: str
    cycle: str
    # Déclarative (ex: "2020"), fiabilisée par validation Papa. Borne 20 = colonne
    # `chapters.program_version` VARCHAR(20) : une sortie verbeuse ("2020 (BO du 30
    # juillet 2020)", vue en réel sur SVT) casserait l'INSERT — la borne la fait
    # passer par la réparation au lieu de tronquer silencieusement.
    program_version: str = Field(max_length=20)
    chapters: list[GeneratedChapter] = Field(min_length=MIN_CHAPTERS, max_length=MAX_CHAPTERS)


def generation_schema() -> dict:
    """Schéma JSON de sortie structurée (`LLMRequest.fmt`)."""
    return GeneratedChapters.model_json_schema()


# ---------------------------------------------------------------------------
# Contrats API (CRUD chapitres du référentiel, Papa uniquement).
# Miroir TypeScript : `packages/types/src/curriculum.ts` (règle CLAUDE.md n°8).
# ---------------------------------------------------------------------------


class CurriculumChapterOut(BaseModel):
    id: int
    school_year_subject_id: int | None
    name: str
    description: str | None  # texte humain uniquement (13-bis : jamais de sérialisation)
    period: str | None
    status: str  # progression temporelle (planned|active|completed|skipped)
    sort_order: int
    source: str  # generated | manual
    validation_status: str  # pending | validated | rejected
    program_version: str | None
    # Métadonnées dépliées depuis `metadata_json` (13-bis) : le frontend ne voit jamais
    # la structure de stockage. Null pour un chapitre manuel sans métadonnées.
    themes: list[str] | None
    suggested_class: str | None
    repartition: str | None  # officielle | interpretee | null


class ChapterManualCreate(BaseModel):
    """Création manuelle par Papa → `source='manual'`, validé d'office (ADR-0009 §3).

    Les métadonnées sont optionnelles : sans elles, `metadata_json` reste null (13-bis).
    """

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=160)
    description: str | None = None
    period: str | None = Field(default=None, max_length=40)
    themes: list[str] | None = None
    suggested_class: str | None = None
    repartition: Literal["officielle", "interpretee"] | None = None


class ChapterPatch(BaseModel):
    """Édition partielle + action de validation optionnelle (`validate`/`reject`)."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = None
    period: str | None = Field(default=None, max_length=40)
    validation_action: Literal["validate", "reject"] | None = None


class ChapterReorderRequest(BaseModel):
    """Liste ORDONNÉE et complète des ids de chapitres de la matière → `sort_order`."""

    model_config = ConfigDict(extra="forbid")

    chapter_ids: list[int] = Field(min_length=1)


class SchoolYearSubjectOut(BaseModel):
    """Matière de l'année active — `id` = school_year_subject_id (clé des routes chapitres)."""

    id: int
    subject_id: int
    subject_name: str
    subject_slug: str
    status: str


class ActiveSchoolYearOut(BaseModel):
    """`GET /api/school-years/active/subjects` — lecture seule pour la page Programme (Slice B)."""

    id: int
    label: str
    level: str
    subjects: list[SchoolYearSubjectOut]
