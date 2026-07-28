// Construction de la grille de heatmap et paliers de couleur.
//
// Frontière assumée : le SERVEUR fournit les minutes actives, le XP et le décrochage ; le client
// ne fait ici que de la PRÉSENTATION — placer les jours dans une grille et choisir un palier de
// couleur. Aucun chiffre n'est inventé, rien n'est ré-agrégé.
//
// Fonctions pures, sans React ni DOM : testables directement.
import type { ActivityHeatmapDay } from "@zetis/types";

/** 0 = aucune activité, 1→4 = intensité croissante. Paliers de la spec : <10 / 10–20 / 20–40 / 40+. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export function heatLevel(activeMinutes: number): HeatLevel {
  if (activeMinutes <= 0) return 0;
  if (activeMinutes < 10) return 1;
  if (activeMinutes < 20) return 2;
  if (activeMinutes < 40) return 3;
  return 4;
}

/** Classes Tailwind par palier. Le 0 garde une bordure : une case vide reste visible (l'absence
 *  d'activité est une information), là où un jour futur est totalement transparent.
 *
 *  L'échelle va du SOMBRE au LUMINEUX, à l'inverse de la maquette : celle-ci est sur fond clair
 *  (vert pâle → vert foncé), alors que l'interface Papa est un thème sombre (`--color-papa-bg`
 *  #0a0f1a) où un vert pâle serait le plus criant et inverserait la lecture de l'intensité. */
export const HEAT_CLASSES: Record<HeatLevel, string> = {
  0: "bg-papa-surface-2 border border-papa-border",
  1: "bg-emerald-900",
  2: "bg-emerald-700",
  3: "bg-emerald-500",
  4: "bg-emerald-300",
};

export interface HeatmapCell {
  /** `AAAA-MM-JJ` en heure locale. */
  date: string;
  activeMinutes: number;
  events: number;
  xp: number;
  /** Jour postérieur à aujourd'hui : case transparente, non cliquable. */
  future: boolean;
  level: HeatLevel;
}

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

/**
 * Grille de `weeks` semaines × 7 jours, colonne = semaine, ligne = jour (lundi en haut).
 *
 * Le serveur OMET les jours vides (payload compact) : c'est ici qu'ils sont reconstruits, à 0
 * minute. La grille se termine sur le dimanche de la semaine courante, de sorte que la dernière
 * colonne contienne toujours aujourd'hui.
 */
export function buildHeatmapGrid(
  days: ActivityHeatmapDay[],
  today: Date,
  weeks = 26,
): HeatmapCell[][] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const todayIso = toLocalIso(today);
  const firstMonday = startOfWeek(today);
  firstMonday.setDate(firstMonday.getDate() - (weeks - 1) * 7);

  const grid: HeatmapCell[][] = [];
  for (let week = 0; week < weeks; week += 1) {
    const column: HeatmapCell[] = [];
    for (let dow = 0; dow < 7; dow += 1) {
      const date = new Date(firstMonday);
      date.setDate(firstMonday.getDate() + week * 7 + dow);
      const iso = toLocalIso(date);
      const found = byDate.get(iso);
      const activeMinutes = found?.active_minutes ?? 0;
      column.push({
        date: iso,
        activeMinutes,
        events: found?.events ?? 0,
        xp: found?.xp ?? 0,
        future: iso > todayIso,
        level: heatLevel(activeMinutes),
      });
    }
    grid.push(column);
  }
  return grid;
}

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Libellé de mois au-dessus de chaque colonne : affiché seulement quand le mois change,
 *  pour ne pas répéter « juil. » vingt fois. */
export function monthLabels(grid: HeatmapCell[][]): string[] {
  let previous = -1;
  return grid.map((column) => {
    const month = new Date(`${column[0].date}T00:00:00`).getMonth();
    if (month === previous) return "";
    previous = month;
    return MONTHS[month];
  });
}

/** « 1h12 » / « 45 min » — format des durées côté Papa. */
export function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  return `${hours}h${String(total % 60).padStart(2, "0")}`;
}

/** Delta d'un KPI, signé et jamais affiché à 0 (le vide vaut mieux qu'un « +0 » qui n'informe pas). */
export function formatDelta(delta: number, unit = ""): string | null {
  if (delta === 0) return null;
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${Math.abs(delta)}${unit ? ` ${unit}` : ""}`;
}

/** Date longue en français : « mercredi 15 juillet ». */
export function formatLongDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${iso}T00:00:00`));
}
