// Règle ADR-0009 §3 rendue visible : quelles actions pour quel état de chapitre.
// Fonction pure (testée exhaustivement) — le JSX ne décide jamais lui-même.
import { type ChapterSource, type ChapterValidationStatus } from "@zetis/types";

export interface ChapterActions {
  /** « Valider » — uniquement sur un chapitre `pending`. */
  canValidate: boolean;
  /** « Rejeter » — uniquement sur un chapitre `pending`. */
  canReject: boolean;
  /** « Régénérer » — uniquement sur un chapitre IA `rejected`. */
  canRegenerate: boolean;
  /** Édition inline — partout. */
  canEdit: boolean;
  /** Suppression (avec confirmation) — partout. */
  canDelete: boolean;
  /** Jamais touché par une régénération (manuel ou validé — le backend le garantit). */
  untouchedByRegeneration: boolean;
}

export function chapterActions(
  source: ChapterSource,
  validationStatus: ChapterValidationStatus,
): ChapterActions {
  return {
    canValidate: validationStatus === "pending",
    canReject: validationStatus === "pending",
    canRegenerate: source === "generated" && validationStatus === "rejected",
    canEdit: true,
    canDelete: true,
    untouchedByRegeneration: source === "manual" || validationStatus === "validated",
  };
}
