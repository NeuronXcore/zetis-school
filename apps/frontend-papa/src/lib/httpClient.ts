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

/** Une erreur HTTP qui a gardé son CODE (2026-08-05).
 *
 *  ⚠️ **Additif — `asJson` lève toujours une `Error`**, donc tout appelant qui teste
 *  `cause instanceof Error` et lit `.message` continue sans changer d'un caractère. Seuls ceux qui
 *  ont besoin de distinguer un refus (`409`) d'une panne demandent le `status`.
 *
 *  Le motif : un `409` de production n'est pas une erreur — c'est ZETIS qui reconnaît qu'un lot
 *  identique tourne, ou que le contenu existe déjà. L'écran doit pouvoir le dire autrement qu'en
 *  rouge, et **le reconnaître au code, jamais au texte** : ces messages ont déjà été réécrits une
 *  fois, un tri sur leurs mots casserait à la prochaine reformulation. */
export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** Le serveur a-t-il REFUSÉ (et non échoué) ? `409` = un régulateur a dit non, en connaissance de
 *  cause. Rien n'est cassé, rien n'a été écrit. */
export function estRefus(cause: unknown): boolean {
  return cause instanceof HttpError && cause.status === 409;
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
    throw new HttpError(detail, res.status);
  }
  return (await res.json()) as T;
}
