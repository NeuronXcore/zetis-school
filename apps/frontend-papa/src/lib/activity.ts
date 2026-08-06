// Appels aux lectures d'activité (module backend `activity`, slice A).
// Contrats : `@zetis/types` (`packages/types/src/activity.ts`) — rien n'est redéclaré ici.
import type {
  ActivityDayDetail,
  ActivitySessions,
  ConsolidatedSkill,
  OpenGap,
  ProgressionOverview,
  SkillIndex,
  SkillTimeline,
} from "@zetis/types";
import { API_URL } from "./authClient";
import { asJson, authHeader } from "./httpClient";

// `fetchHeatmap` est partie avec sa route (ADR-0028) : la grille vient désormais de l'agrégat
// `GET /api/parent/dashboard`, par matière, et « toutes matières » est une somme client.

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

/** L'avancement du programme, matière par matière — TOUTE la page Progression (ADR-0038).
 *
 *  ⚠️ Aucun paramètre : pas de matière, pas de période. Ce qui est servi est un stock, et la page
 *  ne recharge jamais. Ajouter un argument ici serait le premier pas vers le sélecteur de période
 *  que l'ADR-0038 §6 exclut. */
export async function fetchProgressionOverview(): Promise<ProgressionOverview> {
  const res = await fetch(`${API_URL}/api/parent/progress/overview`, { headers: authHeader() });
  return asJson<ProgressionOverview>(res);
}

/** L'index des notions — la vue « Par notion » de Progression (adr-0040 §11).
 *
 *  ⚠️ **Aucun paramètre**, et surtout aucune période : le serveur sert TOUT en une passe agrégée
 *  (sept requêtes, constantes), et filtres/tri/recherche/bascule de vue se font **au client, zéro
 *  requête**. Ajouter un argument ici serait le premier pas vers le N+1 que la route évite. */
export async function fetchSkillsIndex(): Promise<SkillIndex> {
  const res = await fetch(`${API_URL}/api/parent/progress/skills`, { headers: authHeader() });
  return asJson<SkillIndex>(res);
}

/** La frise d'UNE notion, chargée au dépliage — paresseuse par décision (adr-0028 §4, 3e
 *  exception assumée : une descente vers un détail non borné, pas un filtre). */
export async function fetchSkillTimeline(skillId: number): Promise<SkillTimeline> {
  const res = await fetch(`${API_URL}/api/parent/progress/skills/${skillId}/timeline`, {
    headers: authHeader(),
  });
  return asJson<SkillTimeline>(res);
}
