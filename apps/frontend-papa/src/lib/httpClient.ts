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

/** Parse une réponse JSON, en remontant le `detail` backend en message d'erreur.
 *  `detail` n'est PAS toujours une chaîne : un 422 de validation FastAPI renvoie une
 *  LISTE d'objets `{msg, loc, …}` — affichée telle quelle, ça donnait « [object
 *  Object] ». On extrait les `msg` (ou on sérialise, dernier recours). */
export async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Erreur ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string" && body.detail) {
        detail = body.detail;
      } else if (Array.isArray(body.detail) && body.detail.length > 0) {
        const messages = body.detail.map((d) =>
          d !== null && typeof d === "object" && "msg" in d
            ? String((d as { msg: unknown }).msg)
            : JSON.stringify(d),
        );
        detail = `Erreur ${res.status} : ${messages.join(" ; ")}`;
      } else if (body.detail !== undefined && body.detail !== null) {
        detail = `Erreur ${res.status} : ${JSON.stringify(body.detail)}`;
      }
    } catch {
      // réponse non-JSON : on garde le message générique
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}
