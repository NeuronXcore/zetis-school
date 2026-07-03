/**
 * Contrats API du référentiel de programme — Lots 1 et 2 Slice A (ADR-0009).
 * Miroir des schémas Pydantic `app/modules/curriculum/schemas.py` (règle CLAUDE.md n°8).
 * Consommés par la page Papa « Programme » (chapitres : étape 14 ; accordéon
 * leçons/notions : Slice B du Lot 2, étape 16).
 */

/** generated = passe 1 IA (validation Papa requise) · manual = écrit par Papa. */
export type ChapterSource = "generated" | "manual";

/** Statut de validation du référentiel — distinct de `status` (progression temporelle). */
export type ChapterValidationStatus = "pending" | "validated" | "rejected";

/** Progression temporelle du chapitre dans l'année (inchangée par l'ADR-0009). */
export type ChapterProgressStatus = "planned" | "active" | "completed" | "skipped";

/** Répartition par classe : conforme aux repères annuels 2019, ou interprétation indicative. */
export type ChapterRepartition = "officielle" | "interpretee";

/** Réponse des endpoints chapitres du référentiel (`/api/school-year-subjects/.../chapters`). */
export interface CurriculumChapter {
  id: number;
  school_year_subject_id: number | null;
  /** Texte humain librement éditable par Papa — jamais de métadonnées sérialisées (13-bis). */
  name: string;
  description: string | null;
  period: string | null;
  status: ChapterProgressStatus;
  sort_order: number;
  source: ChapterSource;
  validation_status: ChapterValidationStatus;
  /** Version déclarative du programme (ex. "2020"), null pour les chapitres manuels. */
  program_version: string | null;
  /** Métadonnées dépliées côté API (stockage `metadata_json` invisible du frontend). */
  themes: string[] | null;
  suggested_class: string | null;
  repartition: ChapterRepartition | null;
}

/** `POST /api/school-year-subjects/{id}/chapters` — création manuelle (validée d'office).
 *  Métadonnées optionnelles : omises → champs null en réponse. */
export interface ChapterManualCreateRequest {
  name: string;
  description?: string | null;
  period?: string | null;
  themes?: string[] | null;
  suggested_class?: string | null;
  repartition?: ChapterRepartition | null;
}

/** `PATCH /api/chapters/{id}` — édition partielle + action de validation optionnelle. */
export interface ChapterPatchRequest {
  name?: string;
  description?: string | null;
  period?: string | null;
  validation_action?: "validate" | "reject";
}

/** `POST /api/school-year-subjects/{id}/chapters/reorder` — liste ordonnée complète. */
export interface ChapterReorderRequest {
  chapter_ids: number[];
}

/** Réponse des endpoints `POST .../validate-all` (lot matière ou année). */
export interface BatchValidationResult {
  validated_count: number;
}

/** `status` d'une leçon ≈ validation (ADR-0009 §3) : draft = à valider, archived = rejetée. */
export type LessonStatus = "draft" | "validated" | "archived";

/** `created_by` d'une leçon ≈ source : parent = manuelle (validée d'office), ai = passe 2. */
export type LessonCreatedBy = "parent" | "ai" | "imported";

/** Notion dépliée d'une leçon (intitulé + `skill_id`) — jamais la table de liaison brute. */
export interface LessonNotion {
  skill_id: number;
  name: string;
}

/** Réponse des endpoints leçons (`/api/chapters/{id}/lessons`, `/api/lessons/{id}`). */
export interface CurriculumLesson {
  id: number;
  chapter_id: number;
  title: string;
  summary: string | null;
  /** Cours complet (markdown), rempli par `POST /lessons/{id}/generate-content`
   *  (moteur local) — null tant que Papa n'a pas demandé la rédaction. */
  content: string | null;
  status: LessonStatus;
  created_by: LessonCreatedBy;
  sort_order: number;
  /** Version déclarative du programme (ex. "2020"), null pour les leçons manuelles. */
  program_version: string | null;
  notions: LessonNotion[];
}

/** `POST /api/chapters/{id}/lessons` — création manuelle (validée d'office).
 *  Chaque notion upserte une `Skill` (dédup par nom normalisé). */
export interface LessonManualCreateRequest {
  title: string;
  summary?: string | null;
  notions?: string[];
}

/** `PATCH /api/lessons/{id}` — édition partielle ; `notions` fournie = remplace le
 *  rattachement (les `Skill` ne sont jamais supprimées). Validation via les endpoints
 *  dédiés `POST /api/lessons/{id}/validate` et `.../reject` (draft uniquement). */
export interface LessonPatchRequest {
  title?: string;
  summary?: string | null;
  notions?: string[];
}

/** `POST /api/chapters/{id}/lessons/reorder` — liste ordonnée complète. */
export interface LessonReorderRequest {
  lesson_ids: number[];
}

/** Matière de l'année active — `id` = school_year_subject_id (clé des routes chapitres). */
export interface SchoolYearSubjectRef {
  id: number;
  subject_id: number;
  subject_name: string;
  subject_slug: string;
  status: string;
}

/** `GET /api/school-years/active/subjects` — lecture seule pour la page Programme (Slice B). */
export interface ActiveSchoolYear {
  id: number;
  label: string;
  level: string;
  subjects: SchoolYearSubjectRef[];
}
