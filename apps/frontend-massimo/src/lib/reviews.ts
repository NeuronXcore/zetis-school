// Appels aux routes élève de la révision espacée (page « Révision », /revision).
// Frontend pur : ces trois routes canoniques sont livrées par la slice backend
// (module `memory`). Contrats : @zetis/types (`packages/types/src/reviews.ts`) —
// on n'y redéclare aucun type. La mécanique SRS reste invisible côté Massimo :
// aucune donnée de planification n'est jamais servie dans les cartes.
import {
  type ReviewAttemptResult,
  type ReviewCard,
  type ReviewDeck,
  type ReviewRating,
  type ReviewsSummary,
} from "@zetis/types";
import { API_URL, authClient } from "./authClient";

function headers(withBody = false): HeadersInit {
  const token = authClient.getToken();
  const base: HeadersInit = withBody ? { "Content-Type": "application/json" } : {};
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Erreur ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // réponse non-JSON : message générique
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

/** `GET /api/student/reviews/summary` — decks par matière + totaux (compteurs exacts). */
export async function fetchReviewsSummary(): Promise<ReviewsSummary> {
  return asJson(
    await fetch(`${API_URL}/api/student/reviews/summary`, { headers: headers() }),
  );
}

/** `POST /api/student/reviews/session` — cartes servies (plafonnées, entrelacées, triées côté serveur). */
export async function startReviewSession(deck: ReviewDeck): Promise<ReviewCard[]> {
  return asJson(
    await fetch(`${API_URL}/api/student/reviews/session`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ deck }),
    }),
  );
}

/**
 * `POST /api/student/reviews/cards/{id}/attempt` — enregistre une note.
 * Le re-tour (consolidation) est détecté CÔTÉ SERVEUR : le client ne déclare rien
 * et n'invente aucun montant d'XP — il cumule `xp_awarded` tel que renvoyé.
 */
export async function submitReviewAttempt(
  cardId: number,
  rating: ReviewRating,
): Promise<ReviewAttemptResult> {
  return asJson(
    await fetch(`${API_URL}/api/student/reviews/cards/${cardId}/attempt`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ rating }),
    }),
  );
}
