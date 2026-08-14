/**
 * Contrats API du moteur de quiz (page Papa « Quiz — pilotage », ADR-0014 Lot 1).
 * Miroir des schémas / dicts backend (`app/modules/quizzes/`). Règle CLAUDE.md n°8.
 *
 * Asymétrie serveur : la clé (`correct_answer_json`) et l'explication ne circulent QUE côté
 * Papa (inspection). Massimo ne les reçoit jamais — types élève définis ailleurs si besoin.
 */

/** Les sept formats à correction déterministe du Lot 1. */
export type QuizFormat =
  | "mcq"
  | "mcq_multi"
  | "true_false"
  | "cloze"
  | "numeric"
  | "ordering"
  | "matching";

// --- Overview (`GET /api/quiz-pilotage/overview`) ---

export interface QuizPilotageKpis {
  active_quizzes: number;
  served_questions: number;
  retired_questions: number;
  /** Taux d'écart moyen de l'auto-vérification (null si aucune génération). */
  avg_discard_rate: number | null;
}

export interface QuizPilotageSubject {
  subject_id: number;
  name: string;
  slug: string;
  validated_lessons: number;
  lessons_without_quiz: number;
  quiz_count: number;
  discarded: number;
  generated_total: number;
  discard_rate: number | null;
}

export interface QuizPilotageOverview {
  kpis: QuizPilotageKpis;
  subjects: QuizPilotageSubject[];
}

// --- Arbre matière (`GET /api/quiz-pilotage/subjects/{id}`) ---

/** Résumé d'un quiz pour l'inventaire (jamais les questions elles-mêmes). */
export interface QuizCard {
  quiz_id: number;
  title: string;
  quiz_type: string;
  status: string; // ready | archived
  questions_count: number;
  retired_count: number;
  manual_count: number;
  formats: QuizFormat[];
  discard_rate: number | null;
  created_at: string | null;
}

export interface QuizPilotageLesson {
  lesson_id: number;
  title: string;
  chapter_name: string | null;
  quizzes: QuizCard[]; // vide → leçon « sans quiz » (bouton Générer)
}

export interface QuizPilotageTree {
  subject_id: number;
  name: string;
  slug: string;
  lessons: QuizPilotageLesson[];
}

// --- Génération (`POST /api/lessons/{id}/quizzes/generate`, `.../regenerate`) ---

export interface QuizGenerateRequest {
  count: 5 | 8;
  difficulty: 1 | 2 | 3;
}

export interface QuizGenerateResult {
  quiz_id: number;
  lesson_id: number | null;
  questions_generated: number;
  questions_discarded: number;
}

// --- Inspection Papa (`GET /api/quizzes/{id}` — AVEC clés) ---

export interface PapaQuizQuestion {
  id: number;
  question_type: string;
  prompt_markdown: string;
  choices_json: unknown;
  correct_answer_json: unknown;
  explanation_markdown: string | null;
  skill_id: number | null;
  skill_name: string;
  difficulty: number | null;
  source: string; // generated | manual
  status: string; // active | retired
  sort_order: number;
}

export interface PapaQuizDetail {
  quiz_id: number;
  title: string;
  lesson_id: number | null;
  subject_id: number;
  status: string;
  questions: PapaQuizQuestion[];
}

/** `PATCH /api/quiz-questions/{id}` — toute édition bascule la question en `manual`. */
export interface QuestionPatch {
  prompt_markdown?: string;
  choices_json?: unknown;
  correct_answer_json?: unknown;
  explanation_markdown?: string;
  difficulty?: number;
}

/** `POST /api/quizzes/{id}/questions` — question manuelle. */
export interface ManualQuestionCreate {
  question_type: string;
  prompt_markdown: string;
  choices_json?: unknown;
  correct_answer_json?: unknown;
  explanation_markdown?: string;
  skill_id?: number;
  difficulty?: number;
}

/** `DELETE /api/quizzes/{id}` — hard delete si aucune tentative, sinon archivage. */
export interface QuizDeleteResult {
  deleted: boolean;
  archived: boolean;
}

// --- Flux élève Massimo (`/api/student/*`) — JAMAIS de clé ni d'explication à l'avance ---

/** `GET /api/student/quiz-subjects` — grille écran 1 (grisée si `quiz_count === 0`). */
export interface QuizSubjectSummary {
  subject_id: number;
  slug: string;
  name: string;
  quiz_count: number;
}

/** Question servie à Massimo : ni clé ni explication (asymétrie serveur). */
export interface StudentQuizQuestion {
  id: number;
  question_type: string;
  prompt_markdown: string;
  choices_json: unknown; // présentation selon le format (options, items, colonnes…)
  skill_id: number | null;
  skill_name: string;
}

/**
 * `GET /api/student/quizzes` — listing LÉGER de tous les quiz jouables (ADR-0057).
 *
 * 🔴 **Sans les questions** : la page `/quiz` groupe et cherche sur des titres. Le quiz complet
 * se charge au clic (`GET /api/student/quiz/{quiz_id}`). `chapter_id`/`chapter` viennent de la
 * leçon ; `null` = l'objet ira sous « Sans chapitre ».
 */
export interface StudentQuizListItem {
  quiz_id: number;
  title: string;
  subject: string;
  subject_slug: string;
  chapter_id: number | null;
  chapter: string | null;
  lesson_id: number | null;
  questions_count: number;
}

/** `GET /api/student/quizzes/{subject_slug}` — quiz jouables (questions embarquées). */
export interface StudentQuiz {
  quiz_id: number;
  title: string;
  lesson_id: number | null;
  questions: StudentQuizQuestion[];
}

/** `POST /api/student/quizzes/{id}/attempts`. */
export interface StartAttemptResult {
  attempt_id: number;
  quiz_id: number;
  questions_count: number;
}

/** Évaluation d'un critère d'une question ouverte (format `open`, Lot 2). */
export interface OpenCriterion {
  label: string;
  met: boolean;
  note?: string;
}

/** `POST /api/student/quiz-attempts/{id}/answers` — feedback immédiat, la clé n'est JAMAIS renvoyée. */
export interface AnswerFeedback {
  is_correct: boolean;
  explanation_markdown: string | null;
  /** Format `open` : jugement critère par critère (null pour les formats déterministes). */
  criteria?: OpenCriterion[] | null;
  /** Réponse ambiguë créditée par bénéfice du doute (format `open`). */
  ambiguous?: boolean;
}

export interface QuizSkillScore {
  skill_id: number | null;
  skill_name: string;
  score: number;
  status: string;
}

/** `POST /api/student/quiz-attempts/{id}/complete` — résumé bienveillant + XP serveur. */
export interface QuizCompleteResult {
  attempt_id: number;
  quiz_id: number;
  score_percent: number;
  xp_awarded: number;
  per_skill: QuizSkillScore[];
  strengths: string[]; // forces
  to_review: string[]; // « à revoir bientôt » — jamais de vocabulaire d'échec
}
