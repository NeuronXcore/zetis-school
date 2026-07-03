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

/** Réponse des endpoints chapitres du référentiel (`/api/school-year-subjects/.../chapters`). */
export interface CurriculumChapter {
  id: number;
  school_year_subject_id: number | null;
  name: string;
  description: string | null;
  period: string | null;
  status: ChapterProgressStatus;
  sort_order: number;
  source: ChapterSource;
  validation_status: ChapterValidationStatus;
  /** Version déclarative du programme (ex. "2020"), null pour les chapitres manuels. */
  program_version: string | null;
}

/** `POST /api/school-year-subjects/{id}/chapters` — création manuelle (validée d'office). */
export interface ChapterManualCreateRequest {
  name: string;
  description?: string | null;
  period?: string | null;
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
