// Client API du diagnostic côté Papa (étape 14, refondu par l'adr-0043).
//
// Les formes vivent dans `@zetis/types` depuis l'adr-0043 : le module était le seul à garder ses
// contrats en local, et ses contrats ont changé. Les alias ci-dessous conservent les noms
// historiques pour ne pas réécrire les appelants au passage.
import type {
  DiagnosticApercu,
  DiagnosticPortee,
  DiagnosticRelecture,
  DiagnosticResult,
  DiagnosticSubjectRef,
} from "@zetis/types";
import { API_URL, authClient } from "./authClient";
import { lancerEtSuivre, type SuiviTravail } from "./travaux";

export type { DiagnosticApercu, DiagnosticPortee } from "@zetis/types";

export interface Subject {
  id: number;
  name: string;
}

export type DiagnosticResultSummary = DiagnosticResult;

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

/** Bandeau + rail + matières jamais mesurées, en UN appel.
 *
 *  ⚠️ Ne PAS le remplacer par `/quizzes` : cette route-là est gatée sur `validated` depuis
 *  l'adr-0043 — c'est celle de Massimo — et le rail a précisément besoin du premier cran, celui
 *  que Massimo ne voit pas encore. */
export async function fetchApercu(): Promise<DiagnosticApercu> {
  return asJson(await fetch(`${API_URL}/api/diagnostics/apercu`, { headers: headers() }));
}

/** Le détail d'UNE passation. Séparé de `fetchResults` : au-delà des dix servies par la liste,
 *  une passation n'était plus atteignable. */
export async function fetchResultDetail(attemptId: number): Promise<DiagnosticResultSummary> {
  return asJson(
    await fetch(`${API_URL}/api/diagnostics/results/${attemptId}`, { headers: headers() }),
  );
}

/** Le questionnaire d'UN diagnostic, tel que Papa le relit (adr-0051).
 *
 *  🔴 **Ce n'est PAS `GET /diagnostics/quizzes/{id}`** — celle-là est la route de Massimo : elle
 *  gate sur `validated` (un `pending` répond 404, exactement ce qu'on veut ouvrir) et retire la
 *  bonne réponse et l'explication. Celle-ci passe par le résolveur neutre et sert les deux.
 *
 *  Les questions arrivent **groupées par notion**, le groupement étant fait serveur : deux clients
 *  en inventeraient deux ordres. */
export async function fetchRelecture(quizId: number): Promise<DiagnosticRelecture> {
  return asJson(
    await fetch(`${API_URL}/api/diagnostics/quizzes/${quizId}/relecture`, { headers: headers() }),
  );
}

/** La portée d'une matière — le pivot par notion sur ses passations successives. */
export async function fetchPortee(subjectId: number): Promise<DiagnosticPortee> {
  return asJson(
    await fetch(`${API_URL}/api/diagnostics/portee?subject_id=${subjectId}`, {
      headers: headers(),
    }),
  );
}

export type { DiagnosticSubjectRef };

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
