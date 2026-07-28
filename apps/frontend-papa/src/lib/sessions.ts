// Fonctions pures de la vue Sessions du cahier de bord.
//
// Frontière assumée, comme pour la heatmap : le SERVEUR reconstruit les sessions, calcule les
// minutes actives et agrège les révisions. Le client borne une période et SOMME ce qui est déjà
// affiché — rien de plus. Aucun chiffre n'est inventé ni recalculé depuis les événements bruts.
import type { ActivitySessionDay } from "@zetis/types";
import { startOfWeek, toLocalIso } from "./heatmap";

export interface PeriodRange {
  from: string;
  to: string;
}

export interface PeriodTotals {
  sessions: number;
  activeMinutes: number;
  /** Moyenne par session, arrondie. `0` s'il n'y a aucune session (pas de division par zéro). */
  averageMinutes: number;
}

/** Totaux de la période, sommés depuis les jours SERVIS (somme d'affichage, pas de ré-agrégation). */
export function periodTotals(days: ActivitySessionDay[]): PeriodTotals {
  let sessions = 0;
  let activeMinutes = 0;
  for (const day of days) {
    for (const session of day.sessions) {
      sessions += 1;
      activeMinutes += session.active_minutes;
    }
  }
  return {
    sessions,
    activeMinutes,
    averageMinutes: sessions > 0 ? Math.round(activeMinutes / sessions) : 0,
  };
}

/** Minutes actives d'un jour = somme de ses sessions (le serveur ne sert pas ce total par jour). */
export function dayActiveMinutes(day: ActivitySessionDay): number {
  return day.sessions.reduce((total, session) => total + session.active_minutes, 0);
}

// ── Calendrier mensuel ────────────────────────────────────────────────────────────────────────
// La navigation du cahier se fait par MOIS : on ouvre une page du cahier, on clique une date.
// Granularité volontairement différente de la heatmap du dashboard (26 semaines, vue macro de la
// régularité) — ici on lit le détail d'un mois.

/** Fenêtre `from`/`to` couvrant le mois contenant `anchor` (du 1er au dernier jour). */
export function monthRange(anchor: Date): PeriodRange {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { from: toLocalIso(first), to: toLocalIso(last) };
}

/** Mois décalé de `offset` (±1…), ancré au 1er pour ne jamais déborder (31 janvier − 1 mois). */
export function shiftMonth(anchor: Date, offset: number): Date {
  return new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1);
}

const MONTH_NAMES = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** « juillet 2026 » — titre du calendrier. */
export function monthLabel(anchor: Date): string {
  return `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;
}

export interface MonthCell {
  date: string;
  dayOfMonth: number;
  /** `false` pour les jours de remplissage des mois voisins (grille alignée sur les semaines). */
  inMonth: boolean;
  future: boolean;
  sessions: number;
  activeMinutes: number;
}

/**
 * Grille du mois : semaines en lignes, lundi en première colonne.
 *
 * La grille commence au lundi de la semaine du 1er et finit au dimanche de la semaine du dernier
 * jour : les cases de remplissage (`inMonth: false`) gardent l'alignement des colonnes sur les
 * jours de la semaine, ce qu'une grille tronquée au mois perdrait.
 */
export function buildMonthGrid(
  days: ActivitySessionDay[],
  anchor: Date,
  today: Date = new Date(),
): MonthCell[][] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const todayIso = toLocalIso(today);
  const month = anchor.getMonth();

  const first = new Date(anchor.getFullYear(), month, 1);
  const last = new Date(anchor.getFullYear(), month + 1, 0);
  const cursor = startOfWeek(first);
  const end = startOfWeek(last);
  end.setDate(end.getDate() + 6);

  const weeks: MonthCell[][] = [];
  while (cursor <= end) {
    const week: MonthCell[] = [];
    for (let dow = 0; dow < 7; dow += 1) {
      const iso = toLocalIso(cursor);
      const day = byDate.get(iso);
      week.push({
        date: iso,
        dayOfMonth: cursor.getDate(),
        inMonth: cursor.getMonth() === month,
        future: iso > todayIso,
        sessions: day?.sessions.length ?? 0,
        activeMinutes: day ? dayActiveMinutes(day) : 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Jour le plus récent du mois portant au moins une session — sélection par défaut à l'ouverture
 *  (arriver sur un calendrier vide de tout détail n'apprend rien). `null` si le mois est vide. */
export function latestDayWithSessions(days: ActivitySessionDay[]): string | null {
  const withSessions = days.filter((day) => day.sessions.length > 0).map((day) => day.date);
  return withSessions.length > 0 ? withSessions.sort().at(-1)! : null;
}
