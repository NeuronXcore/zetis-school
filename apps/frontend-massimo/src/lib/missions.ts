// Appels aux missions (Étape 15) — Massimo voit ses missions du jour et les termine.
import { API_URL, authClient } from "./authClient";

export interface MissionStep {
  id: number;
  step_type: string;
  instruction: string | null;
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

export interface MissionCompleteResult {
  id: number;
  status: string;
  gap_resolved: boolean;
  xp_awarded: number;
}

function headers(): HeadersInit {
  const token = authClient.getToken();
  const base: HeadersInit = { "Content-Type": "application/json" };
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchTodayMissions(): Promise<Mission[]> {
  return asJson(await fetch(`${API_URL}/api/missions/today`, { headers: headers() }));
}

export async function completeMission(missionId: number): Promise<MissionCompleteResult> {
  return asJson(
    await fetch(`${API_URL}/api/missions/${missionId}/complete`, {
      method: "POST",
      headers: headers(),
    }),
  );
}
