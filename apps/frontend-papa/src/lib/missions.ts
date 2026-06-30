// Appels aux missions (Étape 15) — Papa génère la remédiation et suit les missions.
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

export interface GenerateRemediationResponse {
  created: number;
  missions: Mission[];
}

function headers(): HeadersInit {
  const token = authClient.getToken();
  const base: HeadersInit = { "Content-Type": "application/json" };
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Erreur ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // réponse non-JSON
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export async function fetchMissions(): Promise<Mission[]> {
  return asJson(await fetch(`${API_URL}/api/missions`, { headers: headers() }));
}

export async function generateRemediation(): Promise<GenerateRemediationResponse> {
  return asJson(
    await fetch(`${API_URL}/api/missions/generate-remediation`, {
      method: "POST",
      headers: headers(),
    }),
  );
}
