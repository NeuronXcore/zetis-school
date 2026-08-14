// Appels aux routes élève de la révision espacée (page « Révision », /revision).
// Frontend pur : ces trois routes canoniques sont livrées par la slice backend
// (module `memory`). Contrats : @zetis/types (`packages/types/src/reviews.ts`) —
// on n'y redéclare aucun type. La mécanique SRS reste invisible côté Massimo :
// aucune donnée de planification n'est jamais servie dans les cartes.
import {
  type ReviewAttemptResult,
  type ReviewCard,
  type ReviewChapterDeck,
  type ReviewChapterDue,
  type ReviewDeck,
  type ReviewRating,
  type ReviewsSummary,
} from "@zetis/types";
import { notifyNewsChanged } from "./newsEvents";
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

/**
 * `GET /api/student/reviews/chapters` — les chapitres offrables, toutes matières (ADR-0057).
 *
 * Listing séparé du `summary`, qui est aussi servi à l'Accueil et n'a que faire des chapitres.
 * ⚠️ **Le serveur a déjà écarté les chapitres vides** : la surface ne recompte jamais la
 * servabilité (§6, citant l'`adr-0049` D2).
 */
export async function fetchReviewChapters(): Promise<ReviewChapterDue[]> {
  return asJson(
    await fetch(`${API_URL}/api/student/reviews/chapters`, { headers: headers() }),
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
 *
 * Le re-tour (consolidation) est détecté CÔTÉ SERVEUR : le client ne déclare rien et n'invente
 * aucun montant d'XP — il cumule `xp_awarded` tel que renvoyé.
 *
 * `deck` (ADR-0049) est le **CONTEXTE** de la session, jamais son **EFFET**. Le serveur re-résout
 * le chapitre et vérifie que la carte lui appartient avant d'en tirer quoi que ce soit ; un
 * contexte faux est ignoré en silence et l'attempt est traité normalement.
 *
 * ⚠️ Il n'est pas construit ici : il est **l'écho du deck demandé** à `startReviewSession`. Le
 * client répète ce qu'il a demandé, il ne décide de rien.
 */
export async function submitReviewAttempt(
  cardId: number,
  rating: ReviewRating,
  deck?: ReviewChapterDeck,
): Promise<ReviewAttemptResult> {
  const result = await asJson<ReviewAttemptResult>(
    await fetch(`${API_URL}/api/student/reviews/cards/${cardId}/attempt`, {
      method: "POST",
      headers: headers(true),
      // `deck` omis quand il n'y en a pas : le corps reste `{rating}`, identique à l'existant.
      body: JSON.stringify(deck ? { rating, deck } : { rating }),
    }),
  );
  // Une carte qui vient d'être vue pour la première fois quitte le témoin. Émis à CHAQUE
  // passage : le serveur seul sait si c'était le premier, et le hook coalesce les rafales.
  notifyNewsChanged();
  return result;
}
