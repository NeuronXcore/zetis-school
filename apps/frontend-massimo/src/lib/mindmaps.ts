// Appels aux routes élève des mindmaps (page « Mindmaps », /mindmaps). Frontend pur : routes
// livrées par la Slice A backend (module `mindmaps`, ADR-0016). Contrats : @zetis/types
// (`packages/types/src/mindmap.ts`) — aucun type redéclaré ici. Le serveur ne sert QUE des cartes
// `validated` (gate backend) et **calcule le score de reconstruction** (déterministe) : le client
// n'a AUCUNE logique métier d'évaluation.
import {
  type MindmapAttemptResult,
  type MindmapDetail,
  type MindmapListItem,
  type MindmapNodePlacement,
  type MindmapReconstructionResult,
  type MindmapsSummary,
} from "@zetis/types";
import { API_URL, authClient } from "./authClient";

function headers(): HeadersInit {
  const token = authClient.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function jsonHeaders(): HeadersInit {
  return { ...headers(), "Content-Type": "application/json" };
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

/** `GET /api/student/mindmaps/summary` — decks par matière (compteur de cartes validées). */
export async function fetchMindmapsSummary(): Promise<MindmapsSummary> {
  return asJson(await fetch(`${API_URL}/api/student/mindmaps/summary`, { headers: headers() }));
}

/** `GET /api/student/subjects/{slug}/mindmaps` — cartes validées d'une matière (deck). */
export async function fetchSubjectMindmaps(slug: string): Promise<MindmapListItem[]> {
  return asJson(
    await fetch(`${API_URL}/api/student/subjects/${slug}/mindmaps`, { headers: headers() }),
  );
}

/** `GET /api/student/mindmaps/{id}` — une carte (arbre complet). 404 si non validée. */
export async function fetchMindmap(id: number): Promise<MindmapDetail> {
  return asJson(await fetch(`${API_URL}/api/student/mindmaps/${id}`, { headers: headers() }));
}

/** `POST /api/student/mindmaps/{id}/seen` — marque la carte vue (placeholder V1). */
export async function markMindmapSeen(id: number): Promise<void> {
  await fetch(`${API_URL}/api/student/mindmaps/${id}/seen`, { method: "POST", headers: headers() });
}

/**
 * `POST /api/student/mindmaps/{id}/attempts` — tentative de reconstruction : le SERVEUR calcule
 * le score + le détail juste/faux + l'XP (jamais le client). Persiste la tentative.
 */
export async function submitMindmapAttempt(
  id: number,
  placements: MindmapNodePlacement[],
  failedAttempts = 0,
): Promise<MindmapAttemptResult> {
  return asJson(
    await fetch(`${API_URL}/api/student/mindmaps/${id}/attempts`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ placements, failed_attempts: failedAttempts }),
    }),
  );
}

/**
 * `POST /api/student/mindmaps/{id}/evaluate` — évaluation SERVEUR pure (score + détail, sans XP ni
 * persistance). Déterministe. Sert de « vérifie ma carte » sans consommer de tentative.
 */
export async function evaluateMindmap(
  id: number,
  placements: MindmapNodePlacement[],
): Promise<MindmapReconstructionResult> {
  return asJson(
    await fetch(`${API_URL}/api/student/mindmaps/${id}/evaluate`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ placements }),
    }),
  );
}
