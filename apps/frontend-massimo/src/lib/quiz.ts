// Appels aux routes élève du quiz de fin de cours (page « Quiz », /quiz).
// Frontend pur : ces routes sont livrées par la slice moteur (module `quizzes`, ADR-0014).
// Contrats : @zetis/types — aucun type redéclaré ici. La clé et l'explication d'une question
// ne sont JAMAIS servies à l'avance : la correction est faite côté serveur (feedback immédiat).
import {
  type AnswerFeedback,
  type QuizCompleteResult,
  type QuizSubjectSummary,
  type StartAttemptResult,
  type StudentQuiz,
  type StudentQuizListItem,
} from "@zetis/types";
import { API_URL, authClient } from "./authClient";

function headers(withBody = false): HeadersInit {
  const token = authClient.getToken();
  const base: HeadersInit = withBody ? { "Content-Type": "application/json" } : {};
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Erreur ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // réponse non-JSON : message générique
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

/** `GET /api/student/quiz-subjects` — grille des matières + nombre de quiz (grisée si 0). */
export async function fetchQuizSubjects(): Promise<QuizSubjectSummary[]> {
  return asJson(await fetch(`${API_URL}/api/student/quiz-subjects`, { headers: headers() }));
}

/** `GET /api/student/quizzes` — listing LÉGER de tous les quiz jouables (ADR-0057).
 *
 * Sans les questions : la page groupe et cherche sur des titres. Le quiz complet se charge au
 * clic, par `fetchQuizById` — le patron du menu de notion (`useOpenNotionAction`). */
export async function fetchQuizIndex(): Promise<StudentQuizListItem[]> {
  return asJson(await fetch(`${API_URL}/api/student/quizzes`, { headers: headers() }));
}

/** `GET /api/student/quizzes/{slug}` — quiz jouables d'une matière (questions embarquées, sans clé). */
export async function fetchSubjectQuizzes(subjectSlug: string): Promise<StudentQuiz[]> {
  return asJson(
    await fetch(`${API_URL}/api/student/quizzes/${subjectSlug}`, { headers: headers() }),
  );
}

/** `GET /api/student/quiz/{id}` — un quiz jouable par id (deep-link mission ; questions sans clé). */
export async function fetchQuizById(quizId: number): Promise<StudentQuiz> {
  return asJson(await fetch(`${API_URL}/api/student/quiz/${quizId}`, { headers: headers() }));
}

/** `POST /api/student/quizzes/{id}/attempts` — démarre une tentative. */
export async function startQuizAttempt(quizId: number): Promise<StartAttemptResult> {
  return asJson(
    await fetch(`${API_URL}/api/student/quizzes/${quizId}/attempts`, {
      method: "POST",
      headers: headers(),
    }),
  );
}

/**
 * `POST /api/student/quiz-attempts/{id}/answers` — corrige CETTE réponse côté serveur.
 * Renvoie `{is_correct, explanation_markdown}` : le feedback immédiat, jamais la clé.
 */
export async function submitQuizAnswer(
  attemptId: number,
  questionId: number,
  answerJson: unknown,
): Promise<AnswerFeedback> {
  return asJson(
    await fetch(`${API_URL}/api/student/quiz-attempts/${attemptId}/answers`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ question_id: questionId, answer_json: answerJson }),
    }),
  );
}

/** `POST /api/student/quiz-attempts/{id}/complete` — score + XP serveur + résumé bienveillant. */
export async function completeQuizAttempt(attemptId: number): Promise<QuizCompleteResult> {
  return asJson(
    await fetch(`${API_URL}/api/student/quiz-attempts/${attemptId}/complete`, {
      method: "POST",
      headers: headers(),
    }),
  );
}
