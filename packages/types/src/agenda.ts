// Agenda scolaire (ADR-0025) — première source EXOGÈNE du produit : les dates viennent du
// collège, jamais de ZETIS. Objet DÉCLARATIF, à ne pas confondre avec `Mission` (composée sur
// des preuves, complétion vérifiée serveur).
//
// **Deux schémas, jamais un seul filtré côté client** (miroir exact de
// `app/modules/agenda/schemas.py`) : `AgendaItemStudent` pour Massimo, `AgendaItemPilot` pour
// Papa. `parent_note` n'existe QUE sur le second — elle n'est jamais servie à l'élève, et le
// serveur en a un test-verrou sur le JSON sérialisé.

// `lecon` = « leçon à apprendre » (addendum §14). Miroir de `AGENDA_KINDS` — l'ordre est celui
// du tuple Python, et il est celui des menus de saisie.
export type AgendaKind = "devoir" | "lecon" | "controle" | "rendu";
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
  /** Où mène l'échéance (addendum §15) — la leçon d'abord, le chapitre en repli. Ce sont des
   *  ADRESSES de contenu, pas des données sur Massimo : `parent_note`, `dismissed_at` et les
   *  horodatages restent interdits ici, sans exception. */
  lesson_id: number | null;
  chapter_id: number | null;
  /** Combien de cartes le deck de révision de ce chapitre servirait, PLAFOND COMPRIS (ADR-0049).
   *
   *  🔴 `0` ⇒ la surface ne rend **AUCUNE** porte de révision : ni bouton grisé, ni bouton qui
   *  explique — rien. *« Un bouton mort se lit comme une panne »* (addendum ADR-0025 §14.6).
   *
   *  ⚠️ Ce nombre vient du serveur et **ne se recalcule jamais côté client** : le plafond vit
   *  côté serveur, et une surface qui le recopierait mentirait le jour où il bouge. */
  revisable_cards: number;
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
  /** Leçon pointée (addendum §15). Sert à POINTER, jamais à scoper une production : le
   *  déclencheur et le Commander restent scopés par `chapter_id`. */
  lesson_id: number | null;
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
  /** Renseigné quand l'intitulé a été choisi dans la liste des cours du chapitre (§13.1).
   *  ⚠️ Le serveur refuse en **422** une leçon étrangère au `chapter_id` envoyé. */
  lesson_id?: number | null;
  kind: AgendaKind;
  parent_note?: string | null;
}

export interface AgendaItemPatch {
  label?: string;
  due_on?: string;
  subject_id?: number | null;
  chapter_id?: number | null;
  lesson_id?: number | null;
  kind?: AgendaKind;
}

export interface AgendaSettings {
  /** Verrou de phase (ADR-0025 §10). Bascule par un geste explicite de Papa, jamais calculée. */
  student_entry_enabled: boolean;
}
