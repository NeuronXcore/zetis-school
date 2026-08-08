// Appels au diagnostic (Étape 14) — Massimo passe le diagnostic généré par l'IA.
import { API_URL, authClient } from "./authClient";
import { notifyNewsChanged } from "./newsEvents";

/** Contrat de liste (ADR-0044 Décision 6).
 *
 * ⚠️ Volontairement LOCAL et non promu dans `packages/types` : ce contrat n'a qu'un seul
 * consommateur — cette application. Papa n'appelle de ce module que `/validate` et `/reject`.
 * C'est un choix, pas un oubli.
 *
 * ⚠️ À ne pas confondre avec les homonymes de `packages/types/src/diagnostic.ts`
 * (`DiagnosticResult`, `DiagnosticGap`) : ceux-là sont le contrat de PAPA, avec score et sévérité.
 */
export interface DiagnosticListItem {
  quiz_id: number;
  title: string;
  subject: string;
  subject_slug: string;
  questions_count: number;
  /** Dernière passation terminée. `null` = jamais passé (ex-`taken`, qui reste dérivable). */
  taken_at: string | null;
  last_attempt_id: number | null;
  /** Âge de la mesure sur les notions de CE diagnostic. `null` = jamais mesuré.
   *  Porte le tri de la page (Session C) — il regarde l'âge, jamais le résultat. */
  measured_at: string | null;
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

/** Une notion à renforcer, telle que Massimo la voit : son nom, rien d'autre (ADR-0044 §5).
 *
 * ⚠️ **Homonyme de `DiagnosticGap` dans `packages/types`, qui n'est PAS le même objet** : celui-là
 * porte `severity`, `status` et `content_state` — c'est le contrat de Papa, et il ne bouge pas.
 */
export interface DiagnosticGapEleve {
  skill_id: number | null;
  skill_name: string;
}

/** Ce que Massimo voit de sa propre mesure — **ni score, ni score par notion, ni sévérité**.
 *
 * La spec prescrivait « pas d'affichage de note brute immédiate » depuis l'étape 14 ; l'écran la
 * contredisait. Le score reste calculé, écrit et servi à Papa : seule sa diffusion à l'enfant
 * cesse (ADR-0044 Décision 5).
 */
export interface DiagnosticResult {
  attempt_id: number;
  quiz_id: number;
  subject: string;
  completed_at: string | null;
  strengths: string[];
  gaps: DiagnosticGapEleve[];
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

/** Relit une passation passée. Même charge utile que `submitDiagnostic` — une seule fabrique
 *  serveur, donc ce que Massimo relit est exactement ce qu'il a vu en terminant. */
export async function fetchMonResultat(attemptId: number): Promise<DiagnosticResult> {
  return asJson(
    await fetch(`${API_URL}/api/diagnostics/mes-resultats/${attemptId}`, { headers: headers() }),
  );
}

export async function submitDiagnostic(
  quizId: number,
  answers: { question_id: number; choice_index: number }[],
): Promise<DiagnosticResult> {
  const resultat = await asJson<DiagnosticResult>(
    await fetch(`${API_URL}/api/diagnostics/quizzes/${quizId}/submit`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ answers }),
    }),
  );
  // Le témoin de navigation compte les diagnostics NON PASSÉS : passer celui-ci le fait retomber
  // (addendum ADR-0030). L'émission vit ici, à côté de l'écriture — pas dans la page, pour
  // qu'aucun appelant présent ou futur ne puisse l'oublier.
  notifyNewsChanged();
  return resultat;
}
