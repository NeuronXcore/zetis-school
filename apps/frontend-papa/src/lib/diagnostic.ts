// Appels au diagnostic (Étape 14) — Papa lance un diagnostic et consulte les résultats.
import { API_URL, authClient } from "./authClient";
import { lancerEtSuivre, type SuiviTravail } from "./travaux";

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
  onEtat?: SuiviTravail,
): Promise<GenerateResponse> {
  // 202 + sondage (ADR-0041 §4). La sortie du travail EST le contrat d'autrefois.
  // ⚠️ Le `404` « matière introuvable » est resté SYNCHRONE côté route : la file diffère le
  // travail, jamais le verdict sur la demande.
  return lancerEtSuivre<GenerateResponse>(
    `${API_URL}/api/diagnostics/generate`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ subject_id: subjectId, level: level || null }),
    },
    onEtat,
  );
}

export async function fetchResults(): Promise<DiagnosticResultSummary[]> {
  return asJson(await fetch(`${API_URL}/api/diagnostics/results`, { headers: headers() }));
}

/** Verdict de Papa sur un diagnostic (adr-0043). Tant qu'il est `pending`, AUCUNE route élève ne
 *  le sert — c'est le gate, et c'est aussi pourquoi ces deux appels existent : un gate sans
 *  soupape enfermerait tout diagnostic à vie.
 *
 *  Convention `fiches` (`/{id}/validate`, `/{id}/reject`) reprise telle quelle plutôt qu'une
 *  sixième inventée — `reviewActions.ts` n'est qu'une table d'aiguillage. */
export async function validateDiagnostic(quizId: number): Promise<void> {
  await asJson(
    await fetch(`${API_URL}/api/diagnostics/quizzes/${quizId}/validate`, {
      method: "POST",
      headers: headers(),
    }),
  );
}

export async function rejectDiagnostic(quizId: number): Promise<void> {
  await asJson(
    await fetch(`${API_URL}/api/diagnostics/quizzes/${quizId}/reject`, {
      method: "POST",
      headers: headers(),
    }),
  );
}
