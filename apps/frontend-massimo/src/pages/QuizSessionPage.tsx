import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { type StudentQuiz } from "@zetis/types";
import { NeonBackdrop } from "../components/glass";
import { QuizRunner } from "../components/quiz/QuizRunner";
import { useQuizSession } from "../hooks/useQuizSession";

// État passé par l'écran de liste (ou le bouton de la page Cours). Sans lui (accès direct /
// refresh sur /quiz/session), on redirige vers /quiz — rien n'est perdu.
export interface QuizSessionState {
  quiz: StudentQuiz;
  /** En-tête : « Matière · Leçon ». */
  label: string;
  /** Retour après la session (défaut `/quiz`). Une étape mission passe `/missions` : au retour,
   * la page missions valide l'étape quiz (le quiz de mission a fixé `context=mission`). */
  returnTo?: string;
}

export function QuizSessionPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as QuizSessionState | null;

  const session = useQuizSession(state?.quiz ?? null);
  const back = state?.returnTo ?? "/quiz";

  // Fin (résumé fermé) → retour d'où l'on vient (liste des quiz, ou la mission).
  useEffect(() => {
    if (session.status === "done") navigate(back);
  }, [session.status, navigate, back]);

  if (!state?.quiz) return <Navigate to="/quiz" replace />;

  return (
    <div className="relative mx-auto max-w-xl">
      <NeonBackdrop />
      <div className="relative">
        <QuizRunner session={session} label={state.label} onExit={() => navigate(back)} />
      </div>
    </div>
  );
}
