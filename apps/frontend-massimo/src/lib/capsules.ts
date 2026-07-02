// Capsules IA côté Massimo (Lot 2) : bibliothèque des capsules validées + rendues (MP4).
import { API_URL, authClient } from "./authClient";

export type Difficulty = "facile" | "moyen" | "difficile";

export interface CapsulePublicItem {
  id: number;
  title: string;
  subject: string;
  subject_slug: string;
  chapter_id: number | null;
  chapter: string | null;
  difficulty: Difficulty | null;
  video_url: string;
  seen: boolean;
}

export interface CapsuleStats {
  total: number;
  seen_count: number;
  new_count: number;
  view_count: number;
}

function headers(): HeadersInit {
  const token = authClient.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchCapsuleLibrary(): Promise<CapsulePublicItem[]> {
  return asJson(await fetch(`${API_URL}/api/capsules/library`, { headers: headers() }));
}

export async function fetchCapsuleStats(): Promise<CapsuleStats> {
  return asJson(await fetch(`${API_URL}/api/capsules/stats`, { headers: headers() }));
}

/** Marque une capsule comme vue (au démarrage de la lecture). Idempotent côté backend. */
export async function recordCapsuleView(id: number): Promise<void> {
  await fetch(`${API_URL}/api/capsules/${id}/view`, { method: "POST", headers: headers() });
}

/** URL absolue du MP4 (chemin relatif renvoyé par le backend + token en query pour <video>). */
export function videoSrc(relativeUrl: string): string {
  const token = authClient.getToken();
  const sep = relativeUrl.includes("?") ? "&" : "?";
  return `${API_URL}${relativeUrl}${token ? `${sep}token=${encodeURIComponent(token)}` : ""}`;
}
