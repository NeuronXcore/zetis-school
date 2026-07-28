// Appels à la gamification — XP, niveau, badges et régularité de Massimo.
// `streak_days`/`active_today` ont été RETIRÉS avec le streak : ils tombaient à zéro après
// un seul jour manqué. `regularity` (module motivation) les remplace.
import type { MotivationWeek } from "@zetis/types";
import { API_URL, authClient } from "./authClient";

export interface Badge {
  code: string;
  label: string;
  icon: string;
}

export interface XpEvent {
  amount: number;
  reason: string;
  created_at: string | null;
}

export interface GamificationSummary {
  total_xp: number;
  level: number;
  xp_into_level: number;
  xp_for_next: number;
  regularity: MotivationWeek;
  badges: Badge[];
  recent: XpEvent[];
}

// Libellés lisibles des raisons d'XP (côté enfant).
export const REASON_LABEL: Record<string, string> = {
  mission_remediation: "Mission terminée",
  eli5_reverse: "Tu as réexpliqué",
  diagnostic: "Diagnostic passé",
};

function headers(): HeadersInit {
  const token = authClient.getToken();
  const base: HeadersInit = { "Content-Type": "application/json" };
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchGamificationSummary(): Promise<GamificationSummary> {
  return asJson(await fetch(`${API_URL}/api/gamification/summary`, { headers: headers() }));
}
