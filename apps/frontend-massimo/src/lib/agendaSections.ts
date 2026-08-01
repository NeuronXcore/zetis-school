// Découpage PUR de l'agenda de Massimo en sections (ADR-0025 §6-7) — aucun accès réseau,
// testé isolément.
//
// Deux règles traversent ce fichier, et elles ne sont pas décoratives :
//
// 1. **« À reprendre » ne grossit jamais** — 3 items au maximum, quel qu'en soit le nombre
//    réel, et surtout **aucun « et 7 autres »**. C'est le mécanisme anti-dette : une section
//    qui s'allonge à l'écran est un compteur d'arriéré déguisé.
// 2. **Aucun total, aucun compteur de retard** n'est calculé ici. Ce qui n'est pas fait ne se
//    compte pas.
import { type AgendaItemStudent, type AgendaUpcomingItem } from "@zetis/types";

/** Plafond d'affichage de « À reprendre » (ADR-0025 §7). Les autres sont omis EN SILENCE. */
export const RESUME_MAX = 3;

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

export interface AgendaSections {
  today: AgendaItemStudent[];
  tomorrow: AgendaItemStudent[];
  /** Le reste de la bande à venir (J+2 → J+3), replié par défaut côté page. */
  later: AgendaItemStudent[];
  /** Passés non faits, plafonnés. Ambre doux côté rendu, jamais rouge. */
  resume: AgendaItemStudent[];
}

export function splitSections(items: AgendaItemStudent[], today: Date): AgendaSections {
  const todayIso = isoDay(today);
  const tomorrowIso = isoDay(addDays(today, 1));
  const byDate = [...items].sort((a, b) => a.due_on.localeCompare(b.due_on));
  return {
    today: byDate.filter((item) => item.due_on === todayIso),
    tomorrow: byDate.filter((item) => item.due_on === tomorrowIso),
    later: byDate.filter((item) => item.due_on > tomorrowIso),
    // Un item passé DÉJÀ FAIT ne revient pas : il n'y a rien à reprendre.
    resume: byDate
      .filter((item) => item.due_on < todayIso && !item.done)
      .slice(-RESUME_MAX)
      .reverse(),
  };
}

/** Étiquette d'origine affichée sous un item, ou `null` s'il n'y a rien à dire.
 *
 * « complété par papa » prime sur « ajouté par papa » : quand Papa a corrigé un item de
 * Massimo, l'information neuve est la CORRECTION — c'est elle qui doit être visible, sans quoi
 * l'agenda bougerait tout seul sous ses yeux (ADR-0025 §2a). */
export function originLabel(item: AgendaItemStudent): string | null {
  if (item.edited_by_parent) return "complété par papa";
  if (item.created_by === "parent") return "ajouté par papa";
  return null;
}

/** « dans 3 jours », « demain », « aujourd'hui ».
 *
 * Décompte SUBI, pas fabriqué : l'échéance existe déjà dans le monde de Massimo (ADR-0025 §1).
 * Aucune couleur d'urgence ne l'accompagne — le seul signal d'approche prévu est l'apparition
 * du plan de préparation (Lot 2). */
export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft <= 0) return "aujourd'hui";
  if (daysLeft === 1) return "demain";
  return `dans ${daysLeft} jours`;
}

const WEEKDAY_SHORT = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

/** « jeu. 30 » — repère court, jamais une date complète dans une liste. */
export function shortDayLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return `${WEEKDAY_SHORT[date.getDay()]} ${date.getDate()}`;
}

/** Les 3 premiers items « aujourd'hui puis demain » du bandeau d'Accueil.
 *  **Aucune date n'y est affichée** : l'Accueil porte l'horizon « maintenant » (§6). */
export function bannerItems(sections: AgendaSections, max = 3): AgendaItemStudent[] {
  return [...sections.today, ...sections.tomorrow].slice(0, max);
}

/** Les 2 échéances les plus proches pour la section « À préparer » du bandeau d'Accueil.
 *
 *  Le serveur borne DÉJÀ « ce qui arrive » (horizon + `agenda_upcoming_max`) ; ce second plafond
 *  est celui du bandeau, plus serré que celui de la page. C'est délibéré : l'Accueil dit *qu'il y
 *  a quelque chose à préparer et quand*, la page `/agenda` dit *tout*. Un bandeau qui s'allonge
 *  redeviendrait la liste de dette que l'ADR-0025 §6 refuse d'afficher.
 *
 *  ⚠️ Contrairement à `bannerItems`, ces lignes PORTENT une date — l'horizon n'est plus
 *  « maintenant » mais « bientôt », et une échéance qui vient du collège est un fait subi, jamais
 *  un compte à rebours fabriqué par ZETIS (§1). C'est ce qui la distingue d'un compteur d'arriéré. */
export function bannerUpcoming(
  items: AgendaUpcomingItem[],
  max = 2,
): AgendaUpcomingItem[] {
  return items.slice(0, max);
}
