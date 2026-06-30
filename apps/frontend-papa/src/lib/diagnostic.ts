// Appels au diagnostic (Étape 14) — Papa lance un diagnostic et consulte les résultats.
import { API_URL, authClient } from "./authClient";

export interface Subject {
  id: number;
  name: string;
}

export interface SkillScore {
  skill_id: number | null;
  skill_name: string;
  score: number;
  status: string;
}

export interface DiagnosticGap {
  skill_id: number | null;
  skill_name: string;
  severity: string;
}

export interface DiagnosticResultSummary {
  attempt_id: number;
  quiz_id: number;
  subject: string;
  score_percent: number;
  completed_at: string | null;
  per_skill: SkillScore[];
  gaps: DiagnosticGap[];
}

export interface GenerateResponse {
  quiz_id: number;
  subject: string;
  questions_count: number;
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

export async function fetchSubjects(): Promise<Subject[]> {
  return asJson(await fetch(`${API_URL}/api/diagnostics/subjects`, { headers: headers() }));
}

export async function generateDiagnostic(
  subjectId: number,
  level?: string,
): Promise<GenerateResponse> {
  return asJson(
    await fetch(`${API_URL}/api/diagnostics/generate`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ subject_id: subjectId, level: level || null }),
    }),
  );
}

export async function fetchResults(): Promise<DiagnosticResultSummary[]> {
  return asJson(await fetch(`${API_URL}/api/diagnostics/results`, { headers: headers() }));
}
