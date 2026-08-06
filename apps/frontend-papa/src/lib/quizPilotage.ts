// Client API de la page Papa « Quiz — pilotage » (moteur de quiz, ADR-0014 Lot 1).
// Types partagés depuis @zetis/types (contrat unique front/back). Rôle parent côté backend.
import {
  type ManualQuestionCreate,
  type PapaQuizDetail,
  type QuestionPatch,
  type QuizDeleteResult,
  type QuizFormat,
  type QuizGenerateRequest,
  type QuizGenerateResult,
  type QuizPilotageOverview,
  type QuizPilotageTree,
} from "@zetis/types";
import { API_URL } from "./authClient";
import { asJson, authHeader, jsonHeaders } from "./httpClient";
import { lancerEtSuivre, type SuiviTravail } from "./travaux";

const API = `${API_URL}/api`;
const PILOTAGE = `${API}/quiz-pilotage`;

/** Libellés courts des formats (badges de l'inventaire et de l'inspection). */
export const QUIZ_FORMAT_LABELS: Record<QuizFormat, string> = {
  mcq: "QCM",
  mcq_multi: "QCM multi",
  true_false: "Vrai/Faux",
  cloze: "Trous",
  numeric: "Rép. courte",
  ordering: "Ordre",
  matching: "Association",
};

export function formatLabel(format: string): string {
  if (format === "open") return "Réponse ouverte"; // Lot 2 — jugé par l'IA (hors QuizFormat)
  return QUIZ_FORMAT_LABELS[format as QuizFormat] ?? format;
}

/** KPI globaux + santé de la génération par matière (léger, chargé au montage). */
export async function fetchOverview(): Promise<QuizPilotageOverview> {
  return asJson(await fetch(`${PILOTAGE}/overview`, { headers: authHeader() }));
}

/** Leçons validées d'une matière + leurs quiz (à la demande, au dépliage). */
export async function fetchSubjectTree(subjectId: number): Promise<QuizPilotageTree> {
  return asJson(await fetch(`${PILOTAGE}/subjects/${subjectId}`, { headers: authHeader() }));
}

/** Génère un NOUVEAU quiz de fin de cours depuis le cours validé d'une leçon (requête longue). */
export async function generateQuiz(
  lessonId: number,
  body: QuizGenerateRequest,
  onEtat?: SuiviTravail,
): Promise<QuizGenerateResult> {
  // 202 + sondage (ADR-0041 §4). ⚠️ La sortie du travail EST le contrat d'autrefois — `quiz_id`,
  // `questions_generated`, `questions_discarded` : rien n'a été perdu, tout a été déplacé.
  return lancerEtSuivre<QuizGenerateResult>(
    `${API}/lessons/${lessonId}/quizzes/generate`,
    { method: "POST", headers: jsonHeaders(), body: JSON.stringify(body) },
    onEtat,
  );
}

/** Régénère les questions IA d'un quiz (les questions manuelles sont préservées). */
export async function regenerateQuiz(
  quizId: number,
  onEtat?: SuiviTravail,
): Promise<QuizGenerateResult> {
  return lancerEtSuivre<QuizGenerateResult>(
    `${API}/quizzes/${quizId}/regenerate`,
    { method: "POST", headers: authHeader() },
    onEtat,
  );
}

/** Détail Papa d'un quiz : questions AVEC clés et explications (inspection). */
export async function fetchQuizDetail(quizId: number): Promise<PapaQuizDetail> {
  return asJson(await fetch(`${API}/quizzes/${quizId}`, { headers: authHeader() }));
}

/** Édite une question — bascule côté serveur en `manual` (survit aux régénérations). */
export async function patchQuestion(
  questionId: number,
  body: QuestionPatch,
): Promise<PapaQuizQuestionResult> {
  return asJson(
    await fetch(`${API}/quiz-questions/${questionId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

/** Ajoute une question manuelle à un quiz existant. */
export async function addManualQuestion(
  quizId: number,
  body: ManualQuestionCreate,
): Promise<PapaQuizQuestionResult> {
  return asJson(
    await fetch(`${API}/quizzes/${quizId}/questions`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

/** Retire une question des tirages (`status='retired'`) — les tentatives passées restent. */
export async function retireQuestion(questionId: number): Promise<PapaQuizQuestionResult> {
  return asJson(
    await fetch(`${API}/quiz-questions/${questionId}/retire`, {
      method: "POST",
      headers: authHeader(),
    }),
  );
}

/** Supprime un quiz — hard delete si aucune tentative, sinon archivage. */
export async function deleteQuiz(quizId: number): Promise<QuizDeleteResult> {
  return asJson(
    await fetch(`${API}/quizzes/${quizId}`, { method: "DELETE", headers: authHeader() }),
  );
}

// Le PATCH/POST question renvoient le même objet que le détail (une question Papa).
export type PapaQuizQuestionResult = PapaQuizDetail["questions"][number];
