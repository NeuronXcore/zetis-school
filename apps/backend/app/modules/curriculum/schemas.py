"""Schémas du référentiel de programme — passes 1 (chapitres) et 2 (leçons), ADR-0009.

`GeneratedChapters` / `GeneratedLessons` = miroirs Pydantic **stricts** de la sortie LLM
(couche de garantie dure, pattern CapsuleSpec) : `extra="forbid"` partout, rien
d'invalide n'est persisté. Bornes larges côté schéma (leçon du bench T4 : la borne 15 du
schéma jetable était fausse), granularité fine pilotée côté prompt.
"""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

MIN_CHAPTERS = 3
MAX_CHAPTERS = 25
# Passe 2 : bornes larges (le prompt cadre ≈ 2-8 leçons, 1-4 notions).
MIN_LESSONS = 2
MAX_LESSONS = 12
MIN_NOTIONS = 1
MAX_NOTIONS = 6


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


class GeneratedLesson(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=160)
    summary: str  # 1-2 phrases (cadré par le prompt)
    # Intitulés courts, factuels, réutilisables comme `Skill` (borne 160 par notion =
    # colonne `skills.name` VARCHAR(160) : une notion verbeuse passe par la réparation
    # au lieu de casser l'INSERT — même leçon que `program_version` en passe 1).
    notions: list[Annotated[str, Field(min_length=1, max_length=160)]] = Field(
        min_length=MIN_NOTIONS, max_length=MAX_NOTIONS
    )


class GeneratedLessons(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lessons: list[GeneratedLesson] = Field(min_length=MIN_LESSONS, max_length=MAX_LESSONS)


def lessons_generation_schema() -> dict:
    """Schéma JSON de sortie structurée de la passe 2 (`LLMRequest.fmt`)."""
    return GeneratedLessons.model_json_schema()


# Rédaction du cours d'une leçon (moteur LOCAL — pas de dérogation curriculum_*).
# Bornes larges : le prompt cadre 400-800 mots.
MIN_CONTENT_CHARS = 300
MAX_CONTENT_CHARS = 20000


class GeneratedLessonContent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Markdown complet du cours (titre, explication, méthode, mini-exercices, récap).
    content: str = Field(min_length=MIN_CONTENT_CHARS, max_length=MAX_CONTENT_CHARS)


def lesson_content_schema() -> dict:
    """Schéma JSON de sortie structurée de la rédaction de cours (`LLMRequest.fmt`).

    Les bornes de longueur sont RETIRÉES du schéma envoyé : llama.cpp ne sait pas
    convertir `minLength`/`maxLength` d'une string en grammaire (400 « failed to parse
    grammar », vérifié en réel sur qwen3.6). Elles restent tenues par la validation
    Pydantic + la réparation.
    """
    schema = GeneratedLessonContent.model_json_schema()
    schema["properties"]["content"].pop("minLength", None)
    schema["properties"]["content"].pop("maxLength", None)
    return schema


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


class BatchValidationResult(BaseModel):
    """Réponse des endpoints `validate-all` : nombre de chapitres passés en `validated`."""

    validated_count: int


class LessonNotionOut(BaseModel):
    """Notion dépliée d'une leçon (intitulé + `skill_id`) — jamais la liaison brute."""

    skill_id: int
    name: str


class CurriculumLessonOut(BaseModel):
    id: int
    chapter_id: int
    title: str
    summary: str | None
    # Cours complet (markdown), rempli par `POST /lessons/{id}/generate-content`
    # (moteur local) — null tant que Papa n'a pas demandé la rédaction.
    content: str | None
    # `status` ≈ validation (draft|validated|archived), `created_by` ≈ source
    # (parent|ai|imported) — sémantique co-construction ADR-0009 §3.
    status: str
    created_by: str
    sort_order: int
    program_version: str | None
    # Provenance du COURS (≠ ligne leçon) : null tant qu'aucun cours n'a été écrit.
    # `*_by` ∈ ('ai', 'parent') — affiché « IA » / « admin » côté Papa.
    content_created_at: datetime | None
    content_created_by: str | None
    content_updated_at: datetime | None
    content_updated_by: str | None
    notions: list[LessonNotionOut]


class LessonManualCreate(BaseModel):
    """Création manuelle par Papa → `created_by='parent'`, `status='validated'` d'office
    (ADR-0009 §3 : *écrire* = validé). Notions optionnelles (upsert `Skill` identique)."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=160)
    summary: str | None = None
    notions: list[Annotated[str, Field(min_length=1, max_length=160)]] = Field(
        default_factory=list, max_length=MAX_NOTIONS
    )


class NotionRequestAddToProgram(BaseModel):
    """Pont « Ajouter au programme » (addendum ADR-0027) : Papa choisit la matière d'accueil
    d'une notion hors-programme demandée par Massimo (le niveau vient de l'année active)."""

    model_config = ConfigDict(extra="forbid")

    subject_id: int


class NotionRequestCreateLesson(BaseModel):
    """Pont « Créer la leçon » (addendum ADR-0027) : Papa choisit le chapitre d'accueil (matière +
    niveau en découlent) ; `generate_course` rédige le cours dans la foulée (moteur local)."""

    model_config = ConfigDict(extra="forbid")

    chapter_id: int
    generate_course: bool = False


class LessonPatch(BaseModel):
    """Édition partielle : `notions` fournie = remplace le rattachement (upsert des
    nouvelles ; les `Skill` elles-mêmes ne sont jamais supprimées — référentiel).
    `content` fourni = écriture/édition manuelle du cours (markdown, provenance
    'parent') ; absent = cours intact — pas d'effacement possible par ce canal."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=160)
    summary: str | None = None
    notions: list[Annotated[str, Field(min_length=1, max_length=160)]] | None = Field(
        default=None, max_length=MAX_NOTIONS
    )
    content: str | None = Field(default=None, min_length=1)


class LessonReorderRequest(BaseModel):
    """Liste ORDONNÉE et complète des ids de leçons du chapitre → `sort_order`."""

    model_config = ConfigDict(extra="forbid")

    lesson_ids: list[int] = Field(min_length=1)


# ---------------------------------------------------------------------------
# Contrats ÉLÈVE (page Cours de Massimo) — lecture seule, validé uniquement.
# Le filtrage est fait côté serveur : rien de `pending`/`draft` ne sort d'ici
# (ADR-0009 §9). Pas de badges source/validation dans le contrat : Massimo voit
# des cours, pas l'atelier.
# ---------------------------------------------------------------------------


class StudentLessonRef(BaseModel):
    id: int
    title: str
    summary: str | None
    # Le markdown complet ne voyage jamais dans la liste (payload léger) :
    # il se lit via `GET /api/student/lessons/{id}/cours`.
    has_content: bool


class StudentChapterOut(BaseModel):
    id: int
    name: str
    description: str | None
    lessons: list[StudentLessonRef]


class StudentCoursOut(BaseModel):
    """`GET /api/student/cours/{subject_slug}` — chapitres validés de l'année active."""

    subject_id: int
    subject_name: str
    subject_slug: str
    level: str
    chapters: list[StudentChapterOut]


class StudentLessonContentOut(BaseModel):
    """`GET /api/student/lessons/{id}/cours` — 404 si non validée ou sans cours."""

    id: int
    title: str
    summary: str | None
    content: str


class LessonSuggestionOut(BaseModel):
    """`GET /api/student/lesson-suggestions` — une notion des leçons en cours (chip ELI5)."""

    skill_id: int
    name: str
    lesson_id: int
    lesson_title: str


# ---------------------------------------------------------------------------
# Decks de notions validées (ELI5 v2, entrée par matière) — lecture seule.
# Route NEUTRE (pas de préfixe /eli5/) : d'autres dérivés la consommeront.
# ---------------------------------------------------------------------------


class NotionSummarySubject(BaseModel):
    slug: str
    name: str
    # Nombre de notions (`Skill`) distinctes atteignables via chapitres+leçons validés.
    # 0 = matière encore vide côté validé (front : « bientôt »), jamais filtrée.
    notion_count: int
    # Notions fraîchement ajoutées (leçon validée porteuse créée récemment) → deck « ✨ new ».
    new_count: int


class StudentNotionsSummaryOut(BaseModel):
    """`GET /api/student/notions/summary` — compteurs par matière de l'année active."""

    subjects: list[NotionSummarySubject]


class SubjectNotionRef(BaseModel):
    skill_id: int
    name: str
    # Chapitre de la leçon validée la plus récente qui enseigne cette notion.
    chapter_title: str


class SubjectNotionsSubject(BaseModel):
    slug: str
    name: str


class SubjectNotionsOut(BaseModel):
    """`GET /api/student/subjects/{subject_slug}/notions` — notions validées dédupliquées."""

    subject: SubjectNotionsSubject
    notions: list[SubjectNotionRef]


class SchoolYearSubjectOut(BaseModel):
    """Matière de l'année active — `id` = school_year_subject_id (clé des routes chapitres)."""

    id: int
    subject_id: int
    subject_name: str
    subject_slug: str
    # Emoji de la matière (seed `subjects.icon`) — affiché devant le nom (pills Programme).
    subject_icon: str | None
    status: str


class ActiveSchoolYearOut(BaseModel):
    """`GET /api/school-years/active/subjects` — lecture seule pour la page Programme (Slice B)."""

    id: int
    label: str
    level: str
    subjects: list[SchoolYearSubjectOut]


# ---------------------------------------------------------------------------
# Génération « skills-only » pour un niveau antérieur (rattrapage) — ADR-0010.
# Flux stateless en deux temps : generate (prévisualisation en mémoire, rien de
# persisté) → confirm (upsert des `Skill` au niveau cible). Aucun chapitre, aucune
# leçon, aucune liaison `lesson_skills` ne sont créés par ce chemin (décision 1).
# ---------------------------------------------------------------------------


class SkillsBackfillGenerateRequest(BaseModel):
    """`POST /api/curriculum/skills-backfill/generate` — corps { subject_id, level }.

    `level` est validé côté service contre les niveaux du cycle 4 (5e|4e|3e) → 400
    sinon (le lycée est différé, ADR-0009 §8) ; un `Literal` renverrait 422, on veut 400.
    """

    model_config = ConfigDict(extra="forbid")

    subject_id: int
    level: str = Field(min_length=1, max_length=20)


class SkillsBackfillGroup(BaseModel):
    """Notions d'un chapitre d'échafaudage (jeté après génération), dédupliquées."""

    scaffold_chapter: str
    notions: list[str]


class SkillsBackfillPreview(BaseModel):
    """Réponse de `generate` : prévisualisation revue par Papa avant confirmation.

    `failed_scaffolds` = intitulés des chapitres d'échafaudage dont la passe 2 a échoué
    (après réparation) — la génération n'avorte pas pour autant : liste partielle plutôt
    que rien (ADR-0010, décision 4)."""

    subject_id: int
    subject_name: str
    level: str
    cycle: str
    program_version: str
    groups: list[SkillsBackfillGroup]
    failed_scaffolds: list[str]


class SkillsBackfillNotion(BaseModel):
    """Notion revue par Papa (possiblement éditée/élaguée côté client, décision 2).

    `scaffold_chapter` est conservé en entrée (contexte de la notion) même si l'upsert
    actuel ne le persiste pas — l'upsert réutilisé ne pose que (subject_id, level, nom)."""

    model_config = ConfigDict(extra="forbid")

    scaffold_chapter: str
    name: str = Field(min_length=1, max_length=160)


class SkillsBackfillConfirmRequest(BaseModel):
    """`POST /api/curriculum/skills-backfill/confirm` — le client porte la liste revue
    (flux stateless : aucun brouillon serveur entre generate et confirm, décision 2)."""

    model_config = ConfigDict(extra="forbid")

    subject_id: int
    level: str = Field(min_length=1, max_length=20)
    notions: list[SkillsBackfillNotion] = Field(min_length=1)


class SkillsBackfillConfirmResult(BaseModel):
    """Réponse de `confirm` : notions créées vs déjà présentes (idempotence, décision 4)."""

    created: int
    existing: int
