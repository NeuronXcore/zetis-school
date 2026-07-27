// Client API de la page Papa « Mindmaps — pilotage » (cartes mentales, ADR-0016). Types partagés
// depuis @zetis/types (contrat unique front/back). Rôle parent côté backend.
import { type MindmapDetail, type MindmapJson, type MindmapPilotageTree } from "@zetis/types";
import { API_URL } from "./authClient";
import { asJson, authHeader, jsonHeaders } from "./httpClient";

const API = `${API_URL}/api/mindmaps`;

/** Leçons validées d'une matière + leurs cartes (1 appel, leçons sans carte incluses). */
export async function fetchMindmapPilotage(subjectId: number): Promise<MindmapPilotageTree> {
  return asJson(await fetch(`${API}/pilotage/${subjectId}`, { headers: authHeader() }));
}

/** Génère une carte à partir d'une leçon validée (statut `pending`) — requête longue (LLM local). */
export async function generateMindmap(lessonId: number): Promise<MindmapDetail> {
  return asJson(
    await fetch(`${API}/generate`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ lesson_id: lessonId }),
    }),
  );
}

/** Régénère le `mindmap_json` d'une carte (écrase l'existant → repasse `pending`). */
export async function regenerateMindmap(id: number): Promise<MindmapDetail> {
  return asJson(await fetch(`${API}/${id}/regenerate`, { method: "POST", headers: authHeader() }));
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
