// Helpers HTTP partagés des appels API Papa (auth Bearer + parsing d'erreur JSON).
// Source unique réutilisée par les modules d'API (subjects, rag, …).
import { authClient } from "./authClient";

/** En-tête Authorization si un token est présent. */
export function authHeader(): HeadersInit {
  const token = authClient.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** En-têtes pour un corps JSON (Content-Type + auth). */
export function jsonHeaders(): HeadersInit {
  return { "Content-Type": "application/json", ...authHeader() };
}

/** Parse une réponse JSON, en remontant le `detail` backend en message d'erreur. */
export async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Erreur ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // réponse non-JSON : on garde le message générique
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}
