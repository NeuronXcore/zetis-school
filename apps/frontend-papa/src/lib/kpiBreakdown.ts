// Détail d'un KPI : répartition, calculée depuis ce que le serveur a DÉJÀ servi.
//
// Même frontière que partout ailleurs dans ce chantier : le serveur produit les minutes actives,
// le XP, les sessions et les verdicts ; le client REGROUPE pour l'affichage et n'invente aucun
// chiffre. Aucune de ces fonctions ne relit des événements bruts pour recalculer un total.
//
// Fonctions pures, sans React : testables directement.
import type {
  ActivityHeatmapDay,
  ActivitySessionDay,
  ConsolidatedSkill,
  OpenGap,
} from "@zetis/types";
import { toLocalIso } from "./heatmap";

export interface BreakdownRow {
  key: string;
  label: string;
  /** Valeur numérique, utilisée pour la barre de proportion. */
  value: number;
  /** Valeur déjà formatée pour l'affichage (« 1h12 », « +50 XP »). */
  display: string;
  /** Complément à droite du libellé (matière, notion…). */
  caption?: string;
}

const SHORT_DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const SHORT_MONTHS = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

/** « lun. 27 juil. » — libellé compact d'une ligne de répartition. */
export function formatShortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return `${SHORT_DAYS[date.getDay()]} ${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`;
}

/** Toutes les dates de `from` à `to` inclus. Les jours SANS activité sont omis des payloads
 *  serveur : les réintroduire ici évite une répartition à trous, où un jour vide serait
 *  indiscernable d'un jour absent. */
export function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  const last = new Date(`${to}T00:00:00`);
  while (cursor <= last) {
    dates.push(toLocalIso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/** Minutes actives par jour (source : heatmap, déjà chargée par le bloc Régularité). */
export function activeMinutesByDay(
  days: ActivityHeatmapDay[],
  from: string,
  to: string,
): BreakdownRow[] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  return enumerateDates(from, to).map((date) => {
    const minutes = byDate.get(date)?.active_minutes ?? 0;
    return {
      key: date,
      label: formatShortDate(date),
      value: minutes,
      display: minutes > 0 ? `${minutes} min` : "—",
    };
  });
}

/** XP par jour. Métrique SÉPARÉE du journal d'activité : elle vient de `xp_events`, sommée
 *  serveur — un jour peut porter du XP sans minutes actives, et l'inverse. */
export function xpByDay(
  days: ActivityHeatmapDay[],
  from: string,
  to: string,
): BreakdownRow[] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  return enumerateDates(from, to).map((date) => {
    const xp = byDate.get(date)?.xp ?? 0;
    return {
      key: date,
      label: formatShortDate(date),
      value: xp,
      display: xp > 0 ? `+${xp} XP` : "—",
    };
  });
}

/** Sessions par jour, avec leurs bornes horaires en légende. */
export function sessionsByDay(days: ActivitySessionDay[]): BreakdownRow[] {
  return [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({
      key: day.date,
      label: formatShortDate(day.date),
      value: day.sessions.length,
      display:
        day.sessions.length > 0
          ? `${day.sessions.length} session${day.sessions.length > 1 ? "s" : ""}`
          : "—",
      caption: day.sessions.map((s) => `${s.started_time}→${s.ended_time}`).join(" · ") || undefined,
    }));
}

/** Durée de chaque session, la plus longue d'abord — c'est la dispersion qui éclaire une
 *  moyenne (quatre sessions de 6 min ne se lisent pas comme une de 24). */
export function sessionDurations(days: ActivitySessionDay[]): BreakdownRow[] {
  return days
    .flatMap((day) =>
      day.sessions.map((session) => ({
        key: `${day.date}-${session.started_at}`,
        label: formatShortDate(day.date),
        value: session.active_minutes,
        display: `${session.active_minutes} min`,
        caption: `${session.started_time} → ${session.ended_time}`,
      })),
    )
    .sort((a, b) => b.value - a.value);
}

// Sévérité : vocabulaire BIENVEILLANT (CLAUDE.md §pédagogie). On décrit un effort à fournir,
// jamais un échec — « grosse lacune » ne s'écrit nulle part.
const SEVERITY_LABELS: Record<string, string> = {
  high: "à travailler en priorité",
  medium: "à renforcer",
  low: "à consolider",
};

// Poids d'affichage de la barre : la sévérité n'est pas un nombre côté serveur, la barre ne fait
// que rendre l'ordre lisible.
const SEVERITY_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 };

/** Lacunes ouvertes, servies déjà triées par sévérité. */
export function openGapRows(gaps: OpenGap[]): BreakdownRow[] {
  return gaps.map((gap) => ({
    key: String(gap.skill_id),
    label: gap.skill_name,
    value: SEVERITY_WEIGHT[gap.severity] ?? 1,
    display: SEVERITY_LABELS[gap.severity] ?? "à renforcer",
    caption: [gap.subject_name ?? gap.subject_slug, gap.status === "in_progress" ? "en cours" : null]
      .filter(Boolean)
      .join(" · "),
  }));
}

/** Notions consolidées, servies déjà triées par maîtrise décroissante. */
export function consolidatedRows(skills: ConsolidatedSkill[]): BreakdownRow[] {
  return skills.map((skill) => ({
    key: String(skill.skill_id),
    label: skill.skill_name,
    value: skill.mastery_score,
    display: `${skill.mastery_score} %`,
    caption: skill.subject_name ?? skill.subject_slug ?? undefined,
  }));
}

/** Missions terminées de la période : un `mission_verdict` = une mission bouclée. */
const MISSION_COMPLETED_EVENT = "mission_verdict";

export function completedMissions(
  days: ActivitySessionDay[],
  subjectNames: Map<string, string>,
): BreakdownRow[] {
  return days
    .flatMap((day) =>
      day.sessions.flatMap((session) =>
        session.events
          .filter((event) => event.event_type === MISSION_COMPLETED_EVENT)
          .map((event, index) => ({
            key: `${day.date}-${session.started_at}-${index}`,
            label: formatShortDate(day.date),
            value: event.xp,
            display: event.xp ? `+${event.xp} XP` : "—",
            caption: [
              event.subject_slug
                ? (subjectNames.get(event.subject_slug) ?? event.subject_slug)
                : null,
              event.skill_name,
              event.detail,
            ]
              .filter(Boolean)
              .join(" · "),
          })),
      ),
    )
    .sort((a, b) => b.key.localeCompare(a.key));
}
