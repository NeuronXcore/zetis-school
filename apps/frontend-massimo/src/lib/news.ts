// Témoins de nouveauté de la navigation (ADR-0030). UN seul appel pour les cinq entrées.
//
// Contrats : @zetis/types (`packages/types/src/news.ts`) — rien n'est redéclaré ici.
import { type NewsSummary } from "@zetis/types";
import { API_URL, authClient } from "./authClient";

function headers(): HeadersInit {
  const token = authClient.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`Erreur ${res.status}`);
  }
  return (await res.json()) as T;
}

/** État avant la première réponse, et repli en cas d'échec réseau.
 *  Zéro partout = aucun badge rendu : un badge absent est un état correct, pas une erreur. */
export const EMPTY_NEWS: NewsSummary = {
  agenda: 0,
  fiches: 0,
  capsules: 0,
  revision: 0,
  missions: 0,
  mindmaps: 0,
};

/** `GET /api/student/news/summary` — monté UNE fois, dans `MassimoLayout`.
 *  L'alternative (un appel par famille au montage du shell) faisait cinq allers-retours sur la
 *  page la plus visitée, pour un objet décoratif. */
export async function fetchNewsSummary(): Promise<NewsSummary> {
  return asJson(await fetch(`${API_URL}/api/student/news/summary`, { headers: headers() }));
}

/** Plafond de PRÉSENTATION du badge de navigation (ADR-0030 §5). Le serveur sert le compte exact.
 *
 *  Distinct de `cappedCount` (15+, `hooks/useReviewSession.ts`) et il faut que ça le reste : ce
 *  dernier plafonne un deck de cartes À RÉVISER, celui-ci un témoin de NOUVEAUTÉ. Deux objets,
 *  deux seuils, deux tests — les unifier ferait ressembler l'un à l'autre. */
export function capNewsBadge(n: number): string {
  return n > 9 ? "9+" : String(n);
}
