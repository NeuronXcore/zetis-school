/**
 * Contrats API du référentiel de programme — Lot 1 Slice A (ADR-0009).
 * Miroir des schémas Pydantic `app/modules/curriculum/schemas.py` (règle CLAUDE.md n°8).
 * Consommés par la page Papa « Programme » (Slice B, étape 14).
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
