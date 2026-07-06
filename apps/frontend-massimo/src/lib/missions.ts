// Appels aux missions (ADR-0017) — Massimo démarre une mission puis valide ses étapes. Le serveur
// vérifie la PREUVE de chaque étape (score reverse, quiz joué, reconstruction) et rend un VERDICT
// d'acquisition à la dernière étape. Aucune logique métier ici : les contrats vivent dans
// @zetis/types, la décision (élection, preuve, verdict) est 100 % serveur.
import {
  type CompletedMission,
  type Mission,
  type MissionTodayResponse,
  type StepCompleteResult,
} from "@zetis/types";
import { API_URL, authClient } from "./authClient";

export type { CompletedMission, Mission, MissionStep, MissionTodayResponse, StepCompleteResult } from "@zetis/types";

function headers(): HeadersInit {
  const token = authClient.getToken();
  const base: HeadersInit = { "Content-Type": "application/json" };
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // Le backend renvoie 409 { detail } quand la preuve d'une étape manque — message parlant.
    let detail: string | undefined;
    try {
      detail = ((await res.json()) as { detail?: string }).detail;
    } catch {
      detail = undefined;
    }
    throw new Error(detail ?? `Erreur ${res.status}`);
  }
  return (await res.json()) as T;
}

/** `GET /api/missions/today` — la mission ÉLUE + sa raison, ou état serein (`elected: null`). */
export async function fetchToday(): Promise<MissionTodayResponse> {
  return asJson(await fetch(`${API_URL}/api/missions/today`, { headers: headers() }));
}

/** `GET /api/missions` — toutes les missions validées (regroupement par matière fait côté client). */
export async function fetchMissions(): Promise<Mission[]> {
  return asJson(await fetch(`${API_URL}/api/missions`, { headers: headers() }));
}

/** `GET /api/missions/completed-today` — terminées du jour + verdict (deux issues positives) + XP. */
export async function fetchCompletedToday(): Promise<CompletedMission[]> {
  return asJson(await fetch(`${API_URL}/api/missions/completed-today`, { headers: headers() }));
}

export async function startMission(missionId: number): Promise<Mission> {
  return asJson(
    await fetch(`${API_URL}/api/missions/${missionId}/start`, {
      method: "POST",
      headers: headers(),
    }),
  );
}

export async function completeStep(
  missionId: number,
  stepId: number,
): Promise<StepCompleteResult> {
  return asJson(
    await fetch(`${API_URL}/api/missions/${missionId}/steps/${stepId}/complete`, {
      method: "POST",
      headers: headers(),
    }),
  );
}
