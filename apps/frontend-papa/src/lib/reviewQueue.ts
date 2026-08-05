// Client API de la page Papa « File de relecture » (adr-0039).
//
// UN appel, une réponse complète. Les filtres passent en query params parce que la file est une
// LISTE et non un agrégat : contrairement au dashboard (adr-0028 §1), il n'y a rien à précharger
// pour toutes les combinaisons — et `counts`/`subjects` reviennent non filtrés justement pour que
// changer de pastille n'ait pas besoin d'un second appel pour retrouver les compteurs.
import { type ReviewQueue } from "@zetis/types";
import { API_URL } from "./authClient";
import { asJson, authHeader } from "./httpClient";

export interface ReviewQueueQuery {
  subjectId?: number | null;
  kind?: string | null;
}

export async function fetchReviewQueue(query: ReviewQueueQuery = {}): Promise<ReviewQueue> {
  const params = new URLSearchParams();
  if (query.subjectId != null) params.set("subject_id", String(query.subjectId));
  if (query.kind) params.set("kind", query.kind);
  const suffix = params.toString() ? `?${params}` : "";
  return asJson(
    await fetch(`${API_URL}/api/parent/review-queue${suffix}`, { headers: authHeader() }),
  );
}
