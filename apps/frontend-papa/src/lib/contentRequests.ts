// Client API de la liste d'attente de contenus (addendum ADR-0027).
// Module DISTINCT de `production` : les mutations `done`/`dismissed` passent par ici, jamais par
// la Couverture (dont l'invariant est strictement lecture seule). L'enfant ne crée pas de demande
// par une route — l'émission est interne au service de chat.
import {
  type ContentRequest,
  type ContentRequestKind,
  type ContentRequestStatus,
} from "@zetis/types";
import { API_URL } from "./authClient";
import { asJson, authHeader, jsonHeaders } from "./httpClient";
import { DEMANDES_CHANGED_EVENT, notifyDemandesChanged } from "./demandesEvents";

/** Libellés bienveillants par type — mêmes pictogrammes que le menu de notion côté chat. */
export const CONTENT_KIND_LABEL: Record<ContentRequestKind, string> = {
  cours: "📖 Cours",
  fiche: "🗒️ Fiche",
  mindmap: "🧠 Carte mentale",
  card: "🗂️ Cartes de révision",
  quiz: "🎯 Quiz",
  capsule: "🎬 Capsule",
};

const API = `${API_URL}/api/content-requests`;

/** @deprecated Utiliser `DEMANDES_CHANGED_EVENT` (file unifiée contenu + notion). Conservé comme
 *  alias le temps de la migration. */
export const CONTENT_REQUESTS_CHANGED_EVENT = DEMANDES_CHANGED_EVENT;

/** Demandes de contenu de Massimo (par défaut celles en attente), récentes d'abord. */
export async function fetchContentRequests(
  status: ContentRequestStatus | null = "pending",
): Promise<ContentRequest[]> {
  const query = status ? `?status=${status}` : "";
  return asJson(await fetch(`${API}${query}`, { headers: authHeader() }));
}

/** Nombre de demandes en attente (pastille de notification). */
export async function fetchContentRequestsCount(): Promise<number> {
  const body = await asJson<{ pending: number }>(
    await fetch(`${API}/count`, { headers: authHeader() }),
  );
  return body.pending;
}

/** Triage Papa : done (contenu produit) | dismissed (ignorée). */
export async function setContentRequestStatus(
  id: number,
  status: ContentRequestStatus,
): Promise<ContentRequest> {
  const updated = await asJson<ContentRequest>(
    await fetch(`${API}/${id}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({ status }),
    }),
  );
  notifyDemandesChanged(); // rafraîchit la pastille de notification (file unifiée)
  return updated;
}
