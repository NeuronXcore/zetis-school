/**
 * Contrats API du cadre temporel « Années scolaires » (ADR-0009 §9, Lot E).
 * Miroir des schémas Pydantic `app/modules/school/schemas.py` (règle CLAUDE.md n°8).
 * `mode` (déprécié, ADR-0009 §4) n'apparaît nulle part — ni en lecture ni en écriture.
 */

/** Une seule année `active` à la fois — l'activation archive l'ancienne (règle backend). */
export type SchoolYearStatus = "draft" | "active" | "archived";

/** Réponse du CRUD `/api/school-years`. */
export interface SchoolYear {
  id: number;
  label: string;
  level: string;
  /** Dates ISO (`YYYY-MM-DD`), null si non renseignées. */
  starts_on: string | null;
  ends_on: string | null;
  status: SchoolYearStatus;
  /** Version de programme portée par les chapitres générés de l'année (ADR-0009 §5) —
   *  dérivée en lecture, null tant qu'aucun chapitre généré n'existe. Affichage
   *  informatif uniquement, jamais un paramétrage. */
  program_version: string | null;
}

/** `POST /api/school-years` — création en `draft` (l'activation passe par le PATCH). */
export interface SchoolYearCreateRequest {
  label: string;
  level: string;
  starts_on?: string | null;
  ends_on?: string | null;
}

/** `PATCH /api/school-years/{id}` — libellé, dates, statut. `level` est immuable :
 *  absent du contrat, rejeté en 422 par le backend si envoyé. */
export interface SchoolYearPatchRequest {
  label?: string;
  starts_on?: string | null;
  ends_on?: string | null;
  status?: SchoolYearStatus;
}
