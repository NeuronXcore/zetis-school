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

/** Un jour où Massimo a gagné du XP. Les jours SANS gain n'existent pas dans la série. */
export interface XpHistoryDay {
  date: string;
  xp: number;
}

export interface XpHistory {
  days: XpHistoryDay[];
}

// Libellés lisibles des raisons d'XP (côté enfant).
//
// La table couvre les HUIT `reason` que le backend écrit (`award_xp`) — elle n'en traduisait que
// trois jusqu'au 2026-07-31, ce qui était sans conséquence tant que `recent` n'était affiché
// nulle part. Depuis « Tes derniers gains » sur l'Accueil, une raison non traduite se lirait
// `mission_champion` en brut à l'écran de l'enfant.
//
// Toutes sont formulées au POSITIF : un événement XP est toujours un gain, jamais un constat.
export const REASON_LABEL: Record<string, string> = {
  mission_remediation: "Mission terminée",
  mission_champion: "Défi champion relevé",
  eli5_reverse: "Tu as réexpliqué",
  diagnostic: "Diagnostic passé",
  review: "Révision",
  review_consolidation: "Notion consolidée",
  quiz_completed: "Quiz terminé",
  mindmap_reconstruction: "Carte reconstruite",
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

/** « Mon ciel » : les jours où Massimo a gagné du XP.
 *
 * ⚠️ La série est CREUSE par contrat — les jours sans gain sont absents, jamais à zéro. **Ne la
 * complétez jamais** : une courbe dense reconstruite à partir d'elle redescendrait à zéro à
 * chaque absence, et ce cadrage de perte est exactement ce que le contrat empêche
 * (addendum ADR-0024 « Accueil vivant » §A). */
export async function fetchXpHistory(days = 90): Promise<XpHistory> {
  return asJson(
    await fetch(`${API_URL}/api/gamification/history?days=${days}`, { headers: headers() }),
  );
}
