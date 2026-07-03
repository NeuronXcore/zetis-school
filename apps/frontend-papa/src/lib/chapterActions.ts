// Règle ADR-0009 §3 rendue visible : quelles actions pour quel état de chapitre
// ou de leçon. Fonctions pures (testées exhaustivement) — le JSX ne décide jamais lui-même.
import {
  type ChapterSource,
  type ChapterValidationStatus,
  type LessonCreatedBy,
  type LessonStatus,
} from "@zetis/types";

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
  /** « Proposer des leçons » (passe 2) — chapitre validé ou manuel uniquement :
   *  la même condition que le 409 backend (`generate_lessons`). */
  canProposeLessons: boolean;
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
    canProposeLessons: source === "manual" || validationStatus === "validated",
  };
}

export interface LessonActions {
  /** `archived` = hors du flux : jamais affichée (pas de badge « Rejeté » côté leçons). */
  visible: boolean;
  /** « Valider » — uniquement sur une leçon `draft`. */
  canValidate: boolean;
  /** « Rejeter » (→ `archived`) — uniquement sur une leçon `draft`. */
  canReject: boolean;
  /** Édition inline (titre/résumé) — toute leçon visible. */
  canEdit: boolean;
  /** Suppression (avec confirmation) — toute leçon visible. */
  canDelete: boolean;
}

/** Même règle pure que `chapterActions`, côté leçons. `created_by` ne change aucune
 *  action aujourd'hui (pas de « Régénérer » par leçon) mais reste dans la signature :
 *  c'est le couple d'état complet d'une leçon, verrouillé par le test exhaustif. */
export function lessonActions(
  _createdBy: LessonCreatedBy,
  status: LessonStatus,
): LessonActions {
  const visible = status !== "archived";
  return {
    visible,
    canValidate: status === "draft",
    canReject: status === "draft",
    canEdit: visible,
    canDelete: visible,
  };
}
