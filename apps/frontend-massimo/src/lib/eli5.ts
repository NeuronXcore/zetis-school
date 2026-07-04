// Appels à la boucle ELI5 du backend (Étape 10).
import { API_URL, authClient } from "./authClient";

export interface Skill {
  id: number;
  name: string;
  subject: string;
}

// Forme de l'explication stockée dans `ai_jobs.output_json` (backend ELI5ExplainResponse).
export interface Eli5Explain {
  title: string;
  simple_explanation: string;
  analogy: string;
  example: string;
  common_mistake: string;
  check_question: string;
  next_action: string;
  // Nombre de passages de cours (RAG) utilisés ; >0 → « d'après ton cours ».
  sources_used?: number;
  // Cours canonique utilisé (ADR-0011) ; si présent → « d'après ta leçon … ».
  lesson_id?: number;
  lesson_title?: string;
}

export interface Eli5Reverse {
  score: number;
  feedback: string;
  missing_points: string[];
  next_action: string;
}

// Référence renvoyée par POST /explain (contrat API_SPEC {job_id, status}).
export interface ExplainJobRef {
  job_id: number;
  status: string;
}

// Trace IA lue via GET /api/ai/jobs/{job_id} (backend JobOut).
export interface AIJob {
  id: number;
  job_type: string;
  status: string;
  output: Eli5Explain | null;
  duration_ms: number | null;
}

// Carte de révision due (backend memory DueCard).
export interface DueReview {
  id: number;
  skill_id: number;
  front_markdown: string;
  interval_days: number;
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

export async function fetchSkills(): Promise<Skill[]> {
  return asJson(await fetch(`${API_URL}/api/ai/eli5/skills`, { headers: headers() }));
}

// Notion suggérée d'après les leçons en cours (chip « 📖 Ta leçon »). Porte un skill_id
// réel → un clic lance explain + le badge « D'après ta leçon … » (ELI5 v2).
export interface LessonSuggestion {
  skill_id: number;
  name: string;
  lesson_id: number;
  lesson_title: string;
}

export async function fetchLessonSuggestions(): Promise<LessonSuggestion[]> {
  return asJson(
    await fetch(`${API_URL}/api/student/lesson-suggestions`, { headers: headers() }),
  );
}

async function fetchJob(jobId: number): Promise<AIJob> {
  return asJson(await fetch(`${API_URL}/api/ai/jobs/${jobId}`, { headers: headers() }));
}

// Boucle ELI5 live : crée un job IA puis lit son résultat (exécution backend synchrone).
export async function explainEli5(skillId: number): Promise<Eli5Explain> {
  const ref = await asJson<ExplainJobRef>(
    await fetch(`${API_URL}/api/ai/eli5/explain`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ skill_id: skillId }),
    }),
  );

  // L'explain est synchrone (status déjà "succeeded") ; on tolère un job non terminal par sécurité.
  let job = await fetchJob(ref.job_id);
  for (let i = 0; i < 5 && job.status !== "succeeded" && job.status !== "failed"; i++) {
    await new Promise((r) => setTimeout(r, 400));
    job = await fetchJob(ref.job_id);
  }
  if (job.status !== "succeeded" || job.output == null) {
    throw new Error("L'explication n'a pas pu être générée.");
  }
  return job.output;
}

export async function fetchDueReviews(): Promise<DueReview[]> {
  return asJson(await fetch(`${API_URL}/api/memory/reviews/due`, { headers: headers() }));
}

export async function reverseEli5(skillId: number, answerText: string): Promise<Eli5Reverse> {
  return asJson(
    await fetch(`${API_URL}/api/ai/eli5/reverse-evaluate`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ skill_id: skillId, answer_text: answerText }),
    }),
  );
}

// Dictée ELI5 (ADR-0012) : audio → texte, transcrit en LOCAL (Whisper). Le texte
// alimente le même textarea puis part en reverse-evaluate.
export interface Eli5Transcript {
  transcript: string;
  duration_seconds: number;
}

/** Levée sur 503 : moteur STT indisponible côté serveur → le front masque le micro. */
export class Eli5SttUnavailable extends Error {
  constructor() {
    super("Dictée indisponible");
    this.name = "Eli5SttUnavailable";
  }
}

// Notion hors-programme demandée par l'enfant (« Dis à Papa d'ajouter »). Tracée pour Papa,
// qui l'ajoutera via le skills-backfill (backend notion_requests). Aucune donnée durable côté front.
export interface NotionRequest {
  id: number;
  text: string;
  status: string;
}

export async function requestNotion(text: string): Promise<NotionRequest> {
  return asJson(
    await fetch(`${API_URL}/api/ai/eli5/request-notion`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ text }),
    }),
  );
}

export async function transcribeEli5(audio: Blob): Promise<Eli5Transcript> {
  // Multipart : on n'impose PAS de Content-Type (le navigateur pose la boundary).
  const token = authClient.getToken();
  const form = new FormData();
  form.append("file", audio, "dictee.webm");
  const res = await fetch(`${API_URL}/api/ai/eli5/transcribe`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (res.status === 503) throw new Eli5SttUnavailable();
  return asJson(res);
}
