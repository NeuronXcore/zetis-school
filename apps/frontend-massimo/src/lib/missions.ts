// Appels aux missions (ADR-0017 lot 1) — Massimo démarre une mission puis valide ses étapes.
// La complétion déclarative de l'étape 15 est retirée : le serveur vérifie la PREUVE de chaque
// étape (score reverse, quiz joué) et rend un VERDICT d'acquisition à la dernière étape.
import { API_URL, authClient } from "./authClient";

export interface MissionStep {
  id: number;
  step_type: string;
  instruction: string | null;
  resource_id: number | null;
  sort_order: number;
  status: string;
}

export interface Mission {
  id: number;
  subject: string;
  skill_id: number | null;
  skill_name: string | null;
  title: string;
  description: string | null;
  mission_type: string;
  status: string;
  priority: number;
  steps: MissionStep[];
}

export interface StepCompleteResult {
  mission_status: string;
  verdict: string | null; // "acquired" | "review_later" | null (mission non terminée)
  xp_awarded: number;
}

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

export async function fetchTodayMissions(): Promise<Mission[]> {
  return asJson(await fetch(`${API_URL}/api/missions/today`, { headers: headers() }));
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
