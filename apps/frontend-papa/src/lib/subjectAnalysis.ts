// Appel de l'analyse d'UNE matière (module backend `progress`, addendum ADR-0028).
// Contrat : `@zetis/types` (`packages/types/src/subjectAnalysis.ts`) — rien n'est redéclaré ici.
import type { SubjectAnalysis } from "@zetis/types";
import { API_URL } from "./authClient";
import { asJson, authHeader } from "./httpClient";

/**
 * L'EXCEPTION assumée au « zéro requête après le premier rendu » (ADR-0028 §4), au même titre que
 * `fetchDayDetail` : une descente vers un détail NOMMÉ, non borné, qu'on ne peut pas précharger
 * pour huit matières sans annuler le bénéfice de l'agrégat unique.
 *
 * ⚠️ Aucun paramètre de période, et il ne faut jamais en ajouter : tout ce qui dépend d'une
 * fenêtre est déjà dans `DashboardSubject`. Un `period` ici ferait refetcher le panneau au clic
 * sur « 30 jours », c'est-à-dire ferait d'un geste de filtrage une requête réseau.
 *
 * ⚠️ Indexée par `subject_id` et non par le slug : c'est l'identité que consomme déjà l'ancrage
 * du Conseil, et le client la tient en mémoire (`DashboardSubject.id`).
 */
export async function fetchSubjectAnalysis(subjectId: number): Promise<SubjectAnalysis> {
  const res = await fetch(`${API_URL}/api/parent/progress/subjects/${subjectId}/analysis`, {
    headers: authHeader(),
  });
  return asJson<SubjectAnalysis>(res);
}
