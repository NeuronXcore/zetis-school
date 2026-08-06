// Client API de la page Papa « Mindmaps — pilotage » (cartes mentales, ADR-0016). Types partagés
// depuis @zetis/types (contrat unique front/back). Rôle parent côté backend.
import {
  type MindmapDetail,
  type MindmapJson,
  type MindmapNodePlacement,
  type MindmapPilotageTree,
  type MindmapReconstructionResult,
} from "@zetis/types";
import { API_URL } from "./authClient";
import { asJson, authHeader, jsonHeaders } from "./httpClient";
import { lancerEtSuivre, type SuiviTravail } from "./travaux";

const API = `${API_URL}/api/mindmaps`;

/** Leçons validées d'une matière + leurs cartes (1 appel, leçons sans carte incluses). */
export async function fetchMindmapPilotage(subjectId: number): Promise<MindmapPilotageTree> {
  return asJson(await fetch(`${API}/pilotage/${subjectId}`, { headers: authHeader() }));
}

/** Une carte, **`pending` comprise** (route parent) — alimente la modale d'aperçu. */
export async function fetchMindmap(id: number): Promise<MindmapDetail> {
  return asJson(await fetch(`${API}/${id}`, { headers: authHeader() }));
}

/**
 * Évaluation d'APERÇU (addendum ADR-0016 §C) : même barème que la reconstruction de Massimo,
 * **sans aucune persistance ni XP**. Papa peut jouer *Reconstruis* autant qu'il veut sans écrire
 * une ligne dans le journal de Massimo.
 */
export async function evaluateMindmapPreview(
  id: number,
  placements: MindmapNodePlacement[],
): Promise<MindmapReconstructionResult> {
  return asJson(
    await fetch(`${API}/${id}/evaluate-preview`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ placements }),
    }),
  );
}

/** Génère une carte à partir d'une leçon validée (statut `pending`).
 *
 *  202 + sondage (ADR-0041 §4) : la route accepte, le worker produit. La signature est INCHANGÉE —
 *  l'attente est absorbée ici, donc aucun appelant n'a eu à changer de forme. */
export async function generateMindmap(
  lessonId: number,
  onEtat?: SuiviTravail,
): Promise<MindmapDetail> {
  const sortie = await lancerEtSuivre<{ mindmap_id: number }>(
    `${API}/generate`,
    {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ lesson_id: lessonId }),
    },
    onEtat,
  );
  return fetchMindmap(sortie.mindmap_id);
}

/** Régénère le `mindmap_json` d'une carte (écrase l'existant → repasse `pending`).
 *
 *  202 + sondage (ADR-0041 §4). La signature est INCHANGÉE : l'attente est absorbée ici. */
export async function regenerateMindmap(id: number, onEtat?: SuiviTravail): Promise<MindmapDetail> {
  await lancerEtSuivre<{ mindmap_id: number }>(
    `${API}/${id}/regenerate`,
    { method: "POST", headers: authHeader() },
    onEtat,
  );
  return fetchMindmap(id);
}

/** Remplace le `mindmap_json` (revalidé par le schéma → repasse `pending`). */
export async function updateMindmap(id: number, mindmap_json: MindmapJson): Promise<MindmapDetail> {
  return asJson(
    await fetch(`${API}/${id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ mindmap_json }),
    }),
  );
}

/** `pending` → `validated` (la carte devient visible côté Massimo). */
export async function validateMindmap(id: number): Promise<MindmapDetail> {
  return asJson(await fetch(`${API}/${id}/validate`, { method: "POST", headers: authHeader() }));
}

/** `pending` → `rejected` (la carte n'atteindra pas Massimo, sans être supprimée). */
export async function rejectMindmap(id: number): Promise<MindmapDetail> {
  return asJson(await fetch(`${API}/${id}/reject`, { method: "POST", headers: authHeader() }));
}

export async function deleteMindmap(id: number): Promise<void> {
  const res = await fetch(`${API}/${id}`, { method: "DELETE", headers: authHeader() });
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
}
