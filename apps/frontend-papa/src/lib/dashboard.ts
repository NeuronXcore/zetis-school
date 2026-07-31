// Appel de l'agrégat unique du dashboard Papa (module backend `dashboard`, ADR-0028).
// Contrat : `@zetis/types` (`packages/types/src/dashboard.ts`) — rien n'est redéclaré ici.
import type { DashboardPayload } from "@zetis/types";
import { API_URL } from "./authClient";
import { asJson, authHeader } from "./httpClient";

/**
 * L'UNIQUE requête du premier rendu.
 *
 * Aucun paramètre, volontairement : période, matière et focus sont des projections que la page
 * applique sur le payload déjà en mémoire. Ajouter un query param ici ramènerait un aller-retour
 * par clic de chip — exactement ce que l'ADR-0028 §1 supprime.
 *
 * Elle n'est rappelée que sur invalidation métier réelle (validation d'un contenu, mission
 * confirmée), jamais sur un geste de filtrage.
 */
export async function fetchDashboard(): Promise<DashboardPayload> {
  const res = await fetch(`${API_URL}/api/parent/dashboard`, { headers: authHeader() });
  return asJson<DashboardPayload>(res);
}
