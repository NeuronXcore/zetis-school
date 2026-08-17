import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AnswerFeedback,
  type MotivationMessage,
  type QuizCompleteResult,
  type StudentQuiz,
  type StudentQuizQuestion,
} from "@zetis/types";
import { fetchWrapUp } from "../lib/motivation";
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
  /** Mot de la fin servi par ZETIS, chargé À L'ENTRÉE en `summary`. Récupéré par le HOOK et non
   *  par la carte, pour que `QuizEndCard` reste un composant de présentation pure. */
  wrapUp: MotivationMessage | null;
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
  const [wrapUp, setWrapUp] = useState<MotivationMessage | null>(null);
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
    setWrapUp(null);
    setFeedback(null);
    setPos(0);
    try {
      const attempt = await startQuizAttempt(q.quiz_id);
      attemptRef.current = attempt.attempt_id;
      setStatus(q.questions.length === 0 ? "done" : "answering");
    } catch (e) {
      console.warn("[quiz] démarrage de la tentative", e); // trace devtools (diagnostic)
      setError("Le quiz n'a pas voulu démarrer. Réessaie dans un instant ✨");
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
          console.warn("[quiz] envoi d'une réponse", e); // trace devtools (diagnostic)
          setError("Ta réponse n'est pas passée. Réessaie dans un instant ✨");
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
        // Un seul appel par fin de quiz. Un échec laisse `wrapUp` à null : l'écran de fin
        // s'affiche normalement sans lui.
        void fetchWrapUp()
          .then(setWrapUp)
          .catch(() => {
            /* silence */
          });
      } catch (e) {
        console.warn("[quiz] clôture de la tentative", e); // trace devtools (diagnostic)
        // Le fait qui compte : chaque réponse est partie au serveur au fil du quiz
        // (`submitQuizAnswer`) — seule la CLÔTURE a échoué. Rien de ce qu'il a fait n'est perdu.
        setError("Le quiz n'a pas voulu se terminer. Tes réponses sont bien là — réessaie dans un instant ✨");
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
    wrapUp,
    error,
    isLast: pos + 1 >= total,
    submit,
    next,
    finish,
    reload,
  };
}
