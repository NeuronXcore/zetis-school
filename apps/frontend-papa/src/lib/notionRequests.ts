// Demandes de notions hors-programme envoyées par Massimo depuis ELI5 (« Dis à Papa »).
// Papa les liste et les trie ici, puis ajoute la notion via le Rattrapage (skills-backfill).
import { API_URL } from "./authClient";
import { asJson, authHeader, jsonHeaders } from "./httpClient";

export interface NotionRequest {
  id: number;
  text: string;
  status: string;
  subject_id: number | null;
  created_at: string;
}

export async function fetchNotionRequests(status = "pending"): Promise<NotionRequest[]> {
  return asJson(
    await fetch(`${API_URL}/api/notion-requests?status=${encodeURIComponent(status)}`, {
      headers: authHeader(),
    }),
  );
}

export async function resolveNotionRequest(
  id: number,
  status: "added" | "dismissed",
): Promise<NotionRequest> {
  return asJson(
    await fetch(`${API_URL}/api/notion-requests/${id}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({ status }),
    }),
  );
}
