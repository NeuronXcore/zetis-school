// Placement de jours sur une grille calendrier — semaines en colonnes, jours en lignes.
//
// Fonctions PURES, sans React ni DOM. Partagées par les deux apps depuis le 2026-07-31 : la
// heatmap de Papa et « Mon ciel » de Massimo faisaient le même calcul de dates, et deux
// implémentations de `startOfWeek` dans un même dépôt finissent toujours par diverger sur les
// bords de semaine.
//
// ⚠️ Ce qui n'est PAS partagé, et ne doit pas l'être : la reconstruction des jours vides.
// Papa la fait (l'absence d'activité est une information de pilotage) ; Massimo ne la fait
// JAMAIS — `buildSparseCalendar` ne produit que les jours qui ont eu lieu. Cf. l'addendum
// ADR-0024 « Accueil vivant ».

const MONTHS = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

/** Colonnes minimales entre deux libellés de mois, pour qu'ils ne se chevauchent pas. */
const MIN_LABEL_GAP = 3;

/** `AAAA-MM-JJ` d'une date, en heure LOCALE (jamais `toISOString`, qui bascule en UTC et
 *  décalerait tout d'un jour en soirée française). */
export function toLocalIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Lundi de la semaine contenant `date` (semaines lun→dim, comme côté serveur). */
export function startOfWeek(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const isoDow = (copy.getDay() + 6) % 7; // 0 = lundi
  copy.setDate(copy.getDate() - isoDow);
  return copy;
}

/** Un jour qui a eu lieu, placé sur la grille. `week` = colonne, `dow` = ligne (0 = lundi). */
export interface CalendarSlot {
  date: string;
  week: number;
  dow: number;
}

export interface SparseCalendar {
  slots: CalendarSlot[];
  /** Nombre de colonnes de la grille — de la semaine du premier jour à celle d'aujourd'hui. */
  weeks: number;
  /** Libellé de mois, posé sur la colonne où le mois change. */
  months: { week: number; label: string }[];
}

/**
 * Place des dates sur une grille calendrier **sans jamais fabriquer de jour vide**.
 *
 * C'est toute la différence avec `buildHeatmapGrid` (Papa), qui reconstruit les jours manquants à
 * zéro pour les dessiner en gris. Ici on ne rend QUE les coordonnées des jours reçus : le
 * consommateur place ses cases en `grid-column` / `grid-row` explicites, et aucune case vide
 * n'existe — ni dans les données, ni dans le DOM.
 *
 * La grille commence au lundi de la semaine du PREMIER jour reçu : on ne montre jamais une
 * période antérieure à l'histoire de l'élève. Elle se termine à la semaine d'aujourd'hui.
 *
 * Les dates hors de la fenêtre (postérieures à aujourd'hui) sont ignorées.
 */
export function buildSparseCalendar(dates: string[], today: Date): SparseCalendar {
  if (dates.length === 0) return { slots: [], weeks: 0, months: [] };

  const sorted = [...dates].sort();
  const todayIso = toLocalIso(today);
  const firstMonday = startOfWeek(new Date(`${sorted[0]}T00:00:00`));
  const lastMonday = startOfWeek(today);
  const weeks = Math.floor((lastMonday.getTime() - firstMonday.getTime()) / 604_800_000) + 1;

  const slots: CalendarSlot[] = [];
  for (const date of sorted) {
    if (date > todayIso) continue;
    const day = new Date(`${date}T00:00:00`);
    const monday = startOfWeek(day);
    const week = Math.floor((monday.getTime() - firstMonday.getTime()) / 604_800_000);
    if (week < 0 || week >= weeks) continue;
    slots.push({ date, week, dow: (day.getDay() + 6) % 7 });
  }

  // Un libellé seulement quand le mois change — sinon « juil. » se répéterait sur chaque semaine.
  //
  // ⚠️ Et seulement s'il reste de la place : deux mois séparés d'une seule colonne (11 px) se
  // CHEVAUCHENT à l'affichage — constaté en vrai, « juin » et « juil. » écrits l'un sur l'autre.
  // On saute alors le second : mieux vaut un repère de moins qu'un repère illisible.
  const months: { week: number; label: string }[] = [];
  let previousMonth = -1;
  let lastLabelWeek = -MIN_LABEL_GAP;
  for (let week = 0; week < weeks; week += 1) {
    const column = new Date(firstMonday);
    column.setDate(firstMonday.getDate() + week * 7);
    if (column.getMonth() === previousMonth) continue;
    previousMonth = column.getMonth();
    if (week - lastLabelWeek < MIN_LABEL_GAP) continue;
    lastLabelWeek = week;
    months.push({ week, label: MONTHS[previousMonth] });
  }

  return { slots, weeks, months };
}
