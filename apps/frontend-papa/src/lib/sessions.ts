// Fonctions pures de la vue Sessions du cahier de bord.
//
// Frontière assumée, comme pour la heatmap : le SERVEUR reconstruit les sessions, calcule les
// minutes actives et agrège les révisions. Le client borne une période et SOMME ce qui est déjà
// affiché — rien de plus. Aucun chiffre n'est inventé ni recalculé depuis les événements bruts.
import type { ActivitySessionDay } from "@zetis/types";
import { toLocalIso } from "./heatmap";

/** Périodes proposées par les pastilles de filtre (spec : 7 / 14 / 30 jours). */
export const PERIOD_DAYS = [7, 14, 30] as const;
export type PeriodDays = (typeof PERIOD_DAYS)[number];

export interface PeriodRange {
  from: string;
  to: string;
}

/**
 * Fenêtre `from`/`to` d'une période de N jours se terminant à `anchor` (aujourd'hui par défaut).
 *
 * `anchor` INCLUS : « 7 jours » couvre aujourd'hui et les six jours précédents, pas huit dates.
 */
export function periodRange(days: PeriodDays, anchor: Date = new Date()): PeriodRange {
  const to = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const from = new Date(to);
  from.setDate(to.getDate() - (days - 1));
  return { from: toLocalIso(from), to: toLocalIso(to) };
}

/**
 * Période à charger pour qu'une date CIBLE soit visible (pont depuis le dashboard).
 *
 * La fenêtre se termine à la date ciblée quand celle-ci est passée : on montre le jour demandé
 * et son contexte antérieur. Si la cible est aujourd'hui (ou plus tard, cas d'un lien bricolé),
 * on retombe sur la période standard finissant aujourd'hui.
 */
export function periodRangeForDate(
  target: string,
  days: PeriodDays,
  today: Date = new Date(),
): PeriodRange {
  const todayIso = toLocalIso(today);
  if (target >= todayIso) return periodRange(days, today);
  return periodRange(days, new Date(`${target}T00:00:00`));
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
