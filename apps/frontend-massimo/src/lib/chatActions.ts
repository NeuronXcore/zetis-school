// Exécution des actions d'orchestration du chat (ADR-0027, slice B). Le backend renvoie une
// action DÉJÀ ANCRÉE (route réelle) : le front se contente de l'exécuter. Aucune route inventée
// ici — on ne construit jamais de destination, on suit celle que le serveur a validée.
import type { ChatAction, ChatDataKind } from "./chat";

/** Page cible du bouton « Ouvrir » d'une carte de données. */
export const DATA_ROUTE: Record<ChatDataKind, string> = {
  agenda: "/agenda",
  reviews: "/revision",
  missions: "/missions",
};

export const DATA_OPEN_LABEL: Record<ChatDataKind, string> = {
  agenda: "Ouvrir mon agenda",
  reviews: "Aller réviser",
  missions: "Voir mes missions",
};

/** Surface visée par l'action, pour la trace `chat_tool_response` (journal, zéro XP). Dérivée de
 *  la route/donnée — pas une décision, juste une étiquette. */
export function surfaceOf(action: ChatAction): string {
  if (action.kind === "show_data") return action.data ?? "data";
  const route = action.route ?? "";
  if (route.startsWith("/eli5")) return "eli5";
  if (route.startsWith("/fiches")) return "fiche";
  if (route.startsWith("/mindmaps")) return "mindmap";
  if (route.startsWith("/revision")) return "revision";
  if (route.includes("/cours")) return "cours";
  if (route.startsWith("/subjects")) return "cours";
  return "navigate";
}
