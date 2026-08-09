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

/** La question posée à Massimo après sa soumission (ADR-0048 Décision 5).
 *
 * 🔴 **C'est la SEULE part de l'anti-triche qu'il voit.** Les cinq autres signaux s'observent en
 * silence et ne reviennent jamais de son côté : aucun champ de fiabilité n'entre dans
 * `DiagnosticResult`, et le backend n'en sert aucun sur les routes élève.
 */
export interface DiagnosticVerbalisation {
  question_id: number;
  skill_id: number | null;
  skill_name: string;
  /** Ce qu'il a déjà répondu. `null` = pas encore — et ce n'est **jamais** un signal. */
  explication: string | null;
}

/** Ce que Massimo voit de sa propre mesure — **ni score, ni score par notion, ni sévérité**.
 *
 * La spec prescrivait « pas d'affichage de note brute immédiate » depuis l'étape 14 ; l'écran la
 * contredisait. Le score reste calculé, écrit et servi à Papa : seule sa diffusion à l'enfant
 * cesse (ADR-0044 Décision 5).
 *
 * 🔴 **Et aucun champ de FIABILITÉ n'y entre** (ADR-0048) : Massimo ne voit rien du verdict et
 * n'est jamais accusé. `verbalisation` est une question, pas un jugement.
 */
export interface DiagnosticResult {
  attempt_id: number;
  quiz_id: number;
  subject: string;
  completed_at: string | null;
  strengths: string[];
  gaps: DiagnosticGapEleve[];
  /** `null` seulement si la passation n'a aucune bonne réponse à faire raconter. */
  verbalisation: DiagnosticVerbalisation | null;
}

/** Ce que le client a observé pendant la passation (ADR-0048).
 *
 * 🔴 **`sorties_ecran` est porté ICI et non par la réponse** (Décision 1 bis) : l'écran affiche
 * toutes les questions d'un bloc, une sortie ne se rattache à aucune d'elles.
 */
export interface ConditionsPassation {
  ms_total: number;
  sorties_ecran: number;
  plein_ecran_quitte: boolean;
  taille_changee: boolean;
  /** Ce que l'appareil PERMETTAIT d'observer — sans lui, l'absence d'un signal se lirait comme
   *  l'absence du comportement. Le plein écran n'existe pas sur iPhone. */
  signaux_observables: string[];
}

export interface ReponseObservee {
  question_id: number;
  choice_index: number;
  /** Délai depuis la réponse précédente — le RYTHME. Jamais un horodatage. */
  ms_depuis_precedente?: number;
  enonce_copie?: boolean;
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
  answers: ReponseObservee[],
  conditions?: ConditionsPassation,
): Promise<DiagnosticResult> {
  const resultat = await asJson<DiagnosticResult>(
    await fetch(`${API_URL}/api/diagnostics/quizzes/${quizId}/submit`, {
      method: "POST",
      headers: headers(),
      // `conditions` est OPTIONNEL côté serveur : si l'observation a échoué, la soumission part
      // quand même avec ses réponses. Une mesure sans conditions vaut mieux qu'une mesure perdue.
      body: JSON.stringify(conditions ? { answers, conditions } : { answers }),
    }),
  );
  // Le témoin de navigation compte les diagnostics NON PASSÉS : passer celui-ci le fait retomber
  // (addendum ADR-0030). L'émission vit ici, à côté de l'écriture — pas dans la page, pour
  // qu'aucun appelant présent ou futur ne puisse l'oublier.
  notifyNewsChanged();
  return resultat;
}

/** Massimo raconte comment il a trouvé une de ses bonnes réponses (ADR-0048 Décision 5).
 *
 * 🔴 **N'entre pas dans le calcul de la fiabilité, et son absence encore moins.** Le serveur ne
 * la compte nulle part : compter le silence ferait de « Passer » un aveu.
 */
export async function envoyerExplication(
  attemptId: number,
  questionId: number,
  texte: string,
): Promise<DiagnosticVerbalisation> {
  return asJson(
    await fetch(`${API_URL}/api/diagnostics/mes-resultats/${attemptId}/explication`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ question_id: questionId, texte }),
    }),
  );
}
