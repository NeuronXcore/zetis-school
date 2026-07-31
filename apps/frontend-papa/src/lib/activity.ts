// Appels aux lectures d'activité (module backend `activity`, slice A).
// Contrats : `@zetis/types` (`packages/types/src/activity.ts`) — rien n'est redéclaré ici.
import type {
  ActivityDayDetail,
  ActivityHeatmap,
  ActivitySessions,
  ConsolidatedSkill,
  OpenGap,
} from "@zetis/types";
import { API_URL } from "./authClient";
import { asJson, authHeader } from "./httpClient";

/** Heatmap de régularité. `weeks` et les bornes sont validés serveur. */
export async function fetchHeatmap(
  weeks = 26,
  subjectId?: number | null,
): Promise<ActivityHeatmap> {
  const params = new URLSearchParams({ weeks: String(weeks) });
  if (subjectId != null) params.set("subject_id", String(subjectId));
  const res = await fetch(`${API_URL}/api/parent/activity/heatmap?${params}`, {
    headers: authHeader(),
  });
  return asJson<ActivityHeatmap>(res);
}

/** Journal d'un jour (`AAAA-MM-JJ`) — chargé paresseusement, au clic sur une case. */
export async function fetchDayDetail(
  date: string,
  subjectId?: number | null,
): Promise<ActivityDayDetail> {
  const params = new URLSearchParams();
  if (subjectId != null) params.set("subject_id", String(subjectId));
  const query = params.toString() ? `?${params}` : "";
  const res = await fetch(`${API_URL}/api/parent/activity/days/${date}${query}`, {
    headers: authHeader(),
  });
  return asJson<ActivityDayDetail>(res);
}

/** Sessions reconstruites sur une période. Les bornes sont validées serveur ; les jours sans
 *  session sont servis quand même (`sessions: []`) — l'absence d'activité est une information. */
export async function fetchSessions(
  from: string,
  to: string,
  subjectId?: number | null,
): Promise<ActivitySessions> {
  const params = new URLSearchParams({ from, to });
  if (subjectId != null) params.set("subject_id", String(subjectId));
  const res = await fetch(`${API_URL}/api/parent/activity/sessions?${params}`, {
    headers: authHeader(),
  });
  return asJson<ActivitySessions>(res);
}

// `fetchDashboardKpis` a disparu avec le contrat qu'il servait (ADR-0028 §1) : l'agrégat unique
// du dashboard vit dans `lib/dashboard.ts`. Les deux fonctions ci-dessous restent : elles servent
// le détail des lacunes et des notions consolidées, indépendamment du dashboard.

/** Détail du KPI « lacunes ouvertes » : les plus sévères d'abord. */
export async function fetchOpenGaps(): Promise<OpenGap[]> {
  const res = await fetch(`${API_URL}/api/parent/progress/gaps`, { headers: authHeader() });
  return asJson<OpenGap[]>(res);
}

/** Détail du KPI « notions consolidées » : la maîtrise la plus haute d'abord. */
export async function fetchConsolidatedSkills(): Promise<ConsolidatedSkill[]> {
  const res = await fetch(`${API_URL}/api/parent/progress/consolidated`, {
    headers: authHeader(),
  });
  return asJson<ConsolidatedSkill[]>(res);
}
