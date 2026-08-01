// Exécuteur des routes de notion — le seul endroit qui NAVIGUE.
//
// `notionRoutes.ts` décide où aller (fonction pure, testable sans React) ; ce hook s'occupe des
// effets : la navigation, et le seul cas asynchrone de la panoplie (le quiz, qui doit être
// chargé avant d'être ouvert). Partagé par le panneau de la Galaxy et celui de la page matière,
// pour que les deux surfaces se comportent identiquement — y compris dans l'échec.
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchQuizById } from "../lib/quiz";
import type { NotionRoute } from "../lib/notionRoutes";

export interface OpenNotionAction {
  open: (route: NotionRoute) => void;
  /** Vrai pendant le chargement d'un quiz : les boutons se désactivent, sinon un double tap
   *  ouvrirait deux sessions. */
  busy: boolean;
}

export function useOpenNotionAction(): OpenNotionAction {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const open = useCallback(
    (route: NotionRoute) => {
      if (route.mode === "none") return;
      if (route.mode === "navigate") {
        navigate(route.to, route.state ? { state: route.state } : undefined);
        return;
      }
      setBusy(true);
      fetchQuizById(route.quizId)
        .then((quiz) => {
          navigate("/quiz/session", {
            state: { quiz, label: route.label, returnTo: route.returnTo },
          });
        })
        .catch(() => {
          // Le quiz a disparu entre l'affichage et le clic : on retombe sur la liste, sans
          // message d'échec — ce n'est pas la faute de Massimo.
          navigate(route.fallback);
        })
        .finally(() => setBusy(false));
    },
    [navigate],
  );

  return { open, busy };
}
