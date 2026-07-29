// Agenda scolaire (ADR-0025) — première source EXOGÈNE du produit : les dates viennent du
// collège, jamais de ZETIS. Objet DÉCLARATIF, à ne pas confondre avec `Mission` (composée sur
// des preuves, complétion vérifiée serveur).
//
// **Deux schémas, jamais un seul filtré côté client** (miroir exact de
// `app/modules/agenda/schemas.py`) : `AgendaItemStudent` pour Massimo, `AgendaItemPilot` pour
// Papa. `parent_note` n'existe QUE sur le second — elle n'est jamais servie à l'élève, et le
// serveur en a un test-verrou sur le JSON sérialisé.

export type AgendaKind = "devoir" | "controle" | "rendu";
export type AgendaCreator = "student" | "parent";

export interface AgendaSubjectRef {
  id: number;
  slug: string;
  name: string;
  color: string | null;
}

// ── Frontière Massimo ──────────────────────────────────────────────────────────

export interface AgendaItemStudent {
  id: number;
  label: string;
  subject: AgendaSubjectRef | null;
  due_on: string; // YYYY-MM-DD — une échéance est un JOUR
  kind: AgendaKind;
  done: boolean;
  created_by: AgendaCreator;
  /** Marqueur « complété par papa » : booléen dérivé. L'horodatage exact reste Papa-only. */
  edited_by_parent: boolean;
}

export interface AgendaDay {
  date: string;
  /** −3 … +3 par rapport à l'ancre : le client n'a aucun calcul de date à faire. */
  offset: number;
  /** Jours passés SEULEMENT ; `null` sur un jour à venir — jamais `0` (un jour qui n'est pas
   *  encore arrivé n'a pas de case vide, ADR-0024 §5). */
  traces: number | null;
  /** Jours à venir SEULEMENT ; `[]` sur un jour passé. L'asymétrie est calculée SERVEUR. */
  fixed_items: AgendaItemStudent[];
  /** Toujours `[]` en Lot 1 — emplacement du plan de préparation (Lot 2). */
  plan_steps: unknown[];
}

export interface AgendaWeek {
  anchor: string;
  days: AgendaDay[];
}

export interface AgendaUpcomingItem {
  id: number;
  label: string;
  subject: AgendaSubjectRef | null;
  due_on: string;
  /** Décompte SUBI (l'échéance existe déjà dans le monde de Massimo), jamais fabriqué. */
  days_left: number;
  has_plan: boolean; // `false` en Lot 1
}

// ── Frontière Papa ─────────────────────────────────────────────────────────────

export interface AgendaItemPilot {
  id: number;
  label: string;
  subject: AgendaSubjectRef | null;
  subject_id: number | null;
  /** Scope pédagogique choisi dans le référentiel — clé de l'analyse du Lot 3 (ADR-0025 §11). */
  chapter_id: number | null;
  due_on: string;
  kind: AgendaKind;
  created_by: AgendaCreator;
  /** JAMAIS servie à Massimo. */
  parent_note: string | null;
  /** Écrit uniquement par une route élève : la page Papa l'affiche, ne l'écrit jamais. */
  done_at: string | null;
  dismissed_at: string | null;
  edited_by_parent_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AgendaItemDraft {
  label: string;
  due_on: string;
  subject_id?: number | null;
  chapter_id?: number | null;
  kind: AgendaKind;
  parent_note?: string | null;
}

export interface AgendaItemPatch {
  label?: string;
  due_on?: string;
  subject_id?: number | null;
  chapter_id?: number | null;
  kind?: AgendaKind;
}

export interface AgendaSettings {
  /** Verrou de phase (ADR-0025 §10). Bascule par un geste explicite de Papa, jamais calculée. */
  student_entry_enabled: boolean;
}
