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

/** Combien de « À reprendre » sont montrés d'emblée (ADR-0025 §7).
 *
 *  ⚠️ **Plafond d'AFFICHAGE, plus de filtrage** (addendum §17, 2026-08-10). Il coupait la liste
 *  dans `splitSections` : les plus anciens n'étaient pas cachés, ils étaient **hors d'atteinte**.
 *  Ils sont désormais tous là, et la page en montre trois avec un dépliage.
 *
 *  Ce que le §7 interdit reste interdit : un écran qui s'allonge **tout seul**. Un dépliage que
 *  Massimo ouvre est son geste, pas une dette qui pousse sous ses yeux. */
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
    //
    // ⚠️ **Plus de plafond ICI depuis le 2026-08-10** (addendum §17). Il y était, et il rendait
    // les plus anciens **inaccessibles**, pas seulement invisibles. Le plafond a changé de nature :
    // il est devenu un plafond d'AFFICHAGE, appliqué par la page (`RESUME_MAX`), que Massimo lève
    // d'un geste. Le §7 protège d'un écran qui s'allonge tout seul — pas d'un dépliage demandé.
    //
    // Plus récent d'abord : ce qu'on vient de manquer se rattrape avant ce qui date de dix jours.
    resume: byDate.filter((item) => item.due_on < todayIso && !item.done).reverse(),
  };
}

/** Étiquette d'origine affichée sous un item, ou `null` s'il n'y a rien à dire.
 *
 * « complété par ZETIS » prime sur « ajouté par ZETIS » : quand l'item de Massimo a été corrigé,
 * l'information neuve est la CORRECTION — c'est elle qui doit être visible, sans quoi l'agenda
 * bougerait tout seul sous ses yeux (ADR-0025 §2a).
 *
 * ⚠️ **« ZETIS » et non « papa » depuis le 2026-08-10** (addendum §16). Le §2a exige que Massimo
 * sache qu'un AUTRE a touché son agenda — il n'exige pas de le nommer. Généralise la décision du
 * 2026-08-02 sur les missions : « une mission arrive dans la voix de ZETIS, quel que soit qui l'a
 * créée ; la voix du monde de Massimo doit tenir dans le temps ». Le marqueur reste, l'invariant
 * du §2a est intact — seul l'auteur nommé change. */
export function originLabel(item: AgendaItemStudent): string | null {
  if (item.edited_by_parent) return "complété par ZETIS";
  if (item.created_by === "parent") return "ajouté par ZETIS";
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

const WEEKDAY_LONG = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTH_LONG = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** « samedi 8 août » — en-tête du jour ouvert (addendum §17), où la date complète a du sens :
 *  Massimo vient de la désigner du doigt, elle est le sujet du panneau. */
export function longDayLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return `${WEEKDAY_LONG[date.getDay()]} ${date.getDate()} ${MONTH_LONG[month - 1]}`;
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
