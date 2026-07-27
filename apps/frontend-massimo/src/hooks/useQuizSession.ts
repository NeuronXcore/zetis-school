import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AnswerFeedback,
  type QuizCompleteResult,
  type StudentQuiz,
  type StudentQuizQuestion,
} from "@zetis/types";
import { completeQuizAttempt, startQuizAttempt, submitQuizAnswer } from "../lib/quiz";

// Toute la logique de la passation d'un quiz vit ici (les composants d'entrée / feedback /
// fin restent présentationnels). Machine à états :
//   loading → answering → feedback → (answering …) → summary → done | error
//
// Invariants (cf. ADR-0014) : la clé n'est JAMAIS reçue à l'avance — chaque réponse est
// corrigée CÔTÉ SERVEUR (feedback immédiat). L'XP n'est jamais inventée côté client : elle
// vient de `complete`. Vocabulaire toujours bienveillant (aucun « échec »).

export type QuizSessionStatus =
  | "loading"
  | "answering"
  | "feedback"
  | "summary"
  | "done"
  | "error";

export interface QuizSessionApi {
  status: QuizSessionStatus;
  question: StudentQuizQuestion | null;
  /** Position 1-based dans le quiz + total. */
  progress: { current: number; total: number };
  feedback: AnswerFeedback | null;
  summary: QuizCompleteResult | null;
  error: string | null;
  /** Vrai à la dernière question (le bouton affiche « Terminer » au lieu de « Suivante »). */
  isLast: boolean;
  submit: (answerJson: unknown) => void;
  next: () => void;
  finish: () => void;
  reload: () => void;
}

export function useQuizSession(quiz: StudentQuiz | null): QuizSessionApi {
  const [status, setStatus] = useState<QuizSessionStatus>("loading");
  const [pos, setPos] = useState(0);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [summary, setSummary] = useState<QuizCompleteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const attemptRef = useRef<number | null>(null);
  const submittingRef = useRef(false);
  const quizRef = useRef(quiz);
  quizRef.current = quiz;

  const questions = quiz?.questions ?? [];
  const total = questions.length;

  const load = useCallback(async () => {
    const q = quizRef.current;
    if (q == null) return;
    setStatus("loading");
    setError(null);
    setSummary(null);
    setFeedback(null);
    setPos(0);
    try {
      const attempt = await startQuizAttempt(q.quiz_id);
      attemptRef.current = attempt.attempt_id;
      setStatus(q.questions.length === 0 ? "done" : "answering");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de démarrer le quiz");
      setStatus("error");
    }
  }, [quiz?.quiz_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(
    (answerJson: unknown) => {
      if (status !== "answering" || submittingRef.current) return;
      const q = questions[pos];
      const attemptId = attemptRef.current;
      if (!q || attemptId == null) return;
      submittingRef.current = true;
      setError(null);
      void (async () => {
        try {
          const fb = await submitQuizAnswer(attemptId, q.id, answerJson);
          setFeedback(fb);
          setStatus("feedback");
        } catch (e) {
          // Bienveillant : jamais d'« échec » — on invite à réessayer.
          setError(e instanceof Error ? e.message : "Réessaie dans un instant");
        } finally {
          submittingRef.current = false;
        }
      })();
    },
    [status, questions, pos],
  );

  const next = useCallback(() => {
    if (status !== "feedback") return;
    if (pos + 1 < total) {
      setPos(pos + 1);
      setFeedback(null);
      setStatus("answering");
      return;
    }
    const attemptId = attemptRef.current;
    if (attemptId == null) return;
    setStatus("loading");
    void (async () => {
      try {
        setSummary(await completeQuizAttempt(attemptId));
        setStatus("summary");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Impossible de terminer le quiz");
        setStatus("error");
      }
    })();
  }, [status, pos, total]);

  const finish = useCallback(() => setStatus("done"), []);
  const reload = useCallback(() => void load(), [load]);

  return {
    status,
    question: status === "answering" || status === "feedback" ? (questions[pos] ?? null) : null,
    progress: { current: Math.min(pos + 1, total), total },
    feedback,
    summary,
    error,
    isLast: pos + 1 >= total,
    submit,
    next,
    finish,
    reload,
  };
}
