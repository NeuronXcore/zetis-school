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
  // ⚠️ **L'ORDRE PORTE LA RÈGLE.** `/revision` est testé avant `/quiz`, et `/eli5` avant tout :
  // une réécriture « par ordre alphabétique » ou « par fréquence » changerait des étiquettes de
  // journal sans qu'aucun type ne s'en aperçoive.
  if (route.startsWith("/eli5")) return "eli5";
  if (route.startsWith("/fiches")) return "fiche";
  if (route.startsWith("/mindmaps")) return "mindmap";
  if (route.startsWith("/revision")) return "revision";
  // ⚠️ `quiz` et `capsule` ajoutés par l'ADR-0059 §A5. Sans eux, toutes les destinations
  // ouvertes par l'arc A retombaient sur `"navigate"` : le journal d'activité de Massimo se
  // serait mis à mentir sur ce qu'il a réellement ouvert, en silence et sans qu'aucun test
  // existant ne le voie.
  if (route.startsWith("/quiz")) return "quiz";
  if (route.startsWith("/capsules")) return "capsule";
  if (route.includes("/cours")) return "cours";
  if (route.startsWith("/subjects")) return "cours";
  return "navigate";
}
