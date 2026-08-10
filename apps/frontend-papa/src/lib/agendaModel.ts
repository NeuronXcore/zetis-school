// Projections PURES de la page Papa « Agenda » (ADR-0025) — aucun accès réseau, testées
// isolément. La page reste présentationnelle, le hook orchestre.
//
// Une règle traverse tout ce fichier : **on ne compte jamais ce qui n'est pas fait.**
// `agenda_item_missed` n'existe pas côté serveur (ADR-0025 §3) ; produire ici un
// « n en retard » contournerait l'invariant par l'affichage. Les compteurs retenus sont leurs
// inverses positifs.
import { type AgendaItemPilot, type AgendaKind } from "@zetis/types";

export type AgendaPeriod = "current" | "next" | "ahead" | "archived";

export const AGENDA_PERIODS: { key: AgendaPeriod; label: string }[] = [
  { key: "current", label: "Semaine en cours" },
  { key: "next", label: "Semaine suivante" },
  { key: "ahead", label: "Tout à venir" },
  { key: "archived", label: "Archivés" },
];

/** Jour au format `YYYY-MM-DD`, en heure LOCALE.
 *  `toISOString()` est proscrit : il convertit en UTC, et une échéance saisie le soir en
 *  France reculerait d'un jour. */
export function isoDay(day: Date): string {
  const month = `${day.getMonth() + 1}`.padStart(2, "0");
  const date = `${day.getDate()}`.padStart(2, "0");
  return `${day.getFullYear()}-${month}-${date}`;
}

export function addDays(day: Date, count: number): Date {
  const next = new Date(day);
  next.setDate(next.getDate() + count);
  return next;
}

/** Lundi de la semaine contenant `day` (semaine lun→dim, comme partout côté serveur). */
export function mondayOf(day: Date): Date {
  const monday = new Date(day);
  const shift = (monday.getDay() + 6) % 7; // dimanche = 6, lundi = 0
  monday.setDate(monday.getDate() - shift);
  return monday;
}

/** Fenêtre chargée en une fois. Toutes les vues et tous les compteurs en dérivent : une seule
 *  requête, donc aucune dérive possible entre un filtre et un KPI. */
export function loadedRange(today: Date): { from: string; to: string } {
  return { from: isoDay(addDays(mondayOf(today), -90)), to: isoDay(addDays(today, 90)) };
}

/** Bornes affichées d'une période. `archived` couvre tout : un item archivé n'a pas d'horizon. */
export function periodRange(period: AgendaPeriod, today: Date): { from: string; to: string } {
  const monday = mondayOf(today);
  if (period === "current") return { from: isoDay(monday), to: isoDay(addDays(monday, 6)) };
  if (period === "next") {
    const nextMonday = addDays(monday, 7);
    return { from: isoDay(nextMonday), to: isoDay(addDays(nextMonday, 6)) };
  }
  if (period === "ahead") return { from: isoDay(today), to: isoDay(addDays(today, 90)) };
  return loadedRange(today);
}

export interface AgendaFilter {
  period: AgendaPeriod;
  subjectId: number | null;
}

/** Items visibles pour un filtre donné.
 *
 * Un item archivé ne se mélange JAMAIS aux autres : il n'apparaît que sous « Archivés ».
 * Réciproquement, un item **masqué par Massimo** (`dismissed_at` posé par lui) reste ici —
 * atténué, jamais disparu : le parent voit tout, l'enfant voit ce qui le concerne. Les deux
 * cas partagent la colonne `dismissed_at`, ce filtre est donc le seul endroit qui les sépare
 * visuellement, pas sémantiquement. */
export function filterItems(
  items: AgendaItemPilot[],
  filter: AgendaFilter,
  today: Date,
): AgendaItemPilot[] {
  const { from, to } = periodRange(filter.period, today);
  return items.filter((item) => {
    if (filter.period === "archived" ? !item.dismissed_at : !!item.dismissed_at) return false;
    if (item.due_on < from || item.due_on > to) return false;
    if (filter.subjectId !== null && item.subject_id !== filter.subjectId) return false;
    return true;
  });
}

export interface AgendaColumn {
  date: string;
  weekdayLabel: string;
  dayNumber: number;
  isToday: boolean;
  items: AgendaItemPilot[];
}

const WEEKDAYS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];

/** Sept colonnes à partir d'un lundi. Les jours vides restent affichés : une semaine a sept
 *  jours, et une colonne vide dit « rien de prévu », pas « rien de fait ». */
export function weekColumns(
  items: AgendaItemPilot[],
  monday: Date,
  today: Date,
): AgendaColumn[] {
  const todayIso = isoDay(today);
  return Array.from({ length: 7 }, (_, index) => {
    const day = addDays(monday, index);
    const date = isoDay(day);
    return {
      date,
      weekdayLabel: WEEKDAYS[index],
      dayNumber: day.getDate(),
      isToday: date === todayIso,
      items: items.filter((item) => item.due_on === date),
    };
  });
}

export interface AgendaKpis {
  weekCount: number;
  upcomingControls: number;
  byStudent: number;
  byParent: number;
  checked: number;
}

/** Compteurs de la semaine en cours.
 *
 * **Aucun compteur d'items non faits** — c'est la métrique qu'un tableau de bord produirait
 * naturellement, et exactement celle que l'ADR interdit. `checked` en est l'inverse positif.
 * Les archivés sont exclus partout : un item retiré ne pèse plus sur rien. */
export function agendaKpis(items: AgendaItemPilot[], today: Date): AgendaKpis {
  const monday = mondayOf(today);
  const from = isoDay(monday);
  const to = isoDay(addDays(monday, 6));
  const todayIso = isoDay(today);
  const live = items.filter((item) => !item.dismissed_at);
  const week = live.filter((item) => item.due_on >= from && item.due_on <= to);
  return {
    weekCount: week.length,
    upcomingControls: live.filter(
      (item) => item.kind === "controle" && item.due_on >= todayIso && !item.done_at,
    ).length,
    byStudent: week.filter((item) => item.created_by === "student").length,
    byParent: week.filter((item) => item.created_by === "parent").length,
    checked: week.filter((item) => item.done_at).length,
  };
}

/** Trait de CHARGE : part de la journée la plus chargée de la semaine, en pourcentage.
 *  Une charge, jamais une performance — le trait dit « combien d'échéances », pas « comment
 *  ça s'est passé ». */
export function loadPercent(count: number, maxCount: number): number {
  if (maxCount <= 0) return 0;
  return Math.round((count / maxCount) * 100);
}

// « Leçon à apprendre » en toutes lettres, jamais « Leçon » : la formulation longue est LE geste
// de l'addendum §14 — c'est l'ambiguïté du mot « devoir » (exercices à faire ≠ cours à apprendre)
// qui a fait ajouter ce type.
const KIND_LABELS: Record<string, string> = {
  devoir: "Devoir",
  lecon: "Leçon à apprendre",
  controle: "Contrôle",
  rendu: "Rendu",
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

/** L'ordre des types dans les menus de saisie — miroir de `AGENDA_KINDS` côté serveur.
 *
 *  Les DEUX surfaces d'édition l'importent : la grille de saisie en lot et le panneau de détail
 *  avaient chacune leur liste, et la grille dupliquait en plus les libellés. Un `kind` ajouté à
 *  l'une et pas à l'autre serait saisissable à la création et invisible à la correction. */
export const AGENDA_KINDS: AgendaKind[] = ["devoir", "lecon", "controle", "rendu"];

/** Date lisible pour l'en-tête du panneau de détail (« jeudi 30 juillet »). */
export function longDayLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
