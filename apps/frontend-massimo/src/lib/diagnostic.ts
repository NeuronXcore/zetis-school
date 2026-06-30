// Appels au diagnostic (Étape 14) — Massimo passe le diagnostic généré par l'IA.
import { API_URL, authClient } from "./authClient";

export interface DiagnosticListItem {
  quiz_id: number;
  title: string;
  subject: string;
  questions_count: number;
  taken: boolean;
}

export interface DiagQuestion {
  id: number;
  prompt: string;
  choices: string[];
  skill_id: number | null;
  skill_name: string;
}

export interface DiagnosticQuiz {
  quiz_id: number;
  title: string;
  subject: string;
  questions: DiagQuestion[];
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

export interface DiagnosticResult {
  attempt_id: number;
  quiz_id: number;
  subject: string;
  score_percent: number;
  per_skill: SkillScore[];
  gaps: DiagnosticGap[];
  strengths: string[];
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

export async function fetchDiagnostics(): Promise<DiagnosticListItem[]> {
  return asJson(await fetch(`${API_URL}/api/diagnostics/quizzes`, { headers: headers() }));
}

export async function fetchDiagnosticQuiz(quizId: number): Promise<DiagnosticQuiz> {
  return asJson(await fetch(`${API_URL}/api/diagnostics/quizzes/${quizId}`, { headers: headers() }));
}

export async function submitDiagnostic(
  quizId: number,
  answers: { question_id: number; choice_index: number }[],
): Promise<DiagnosticResult> {
  return asJson(
    await fetch(`${API_URL}/api/diagnostics/quizzes/${quizId}/submit`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ answers }),
    }),
  );
}
