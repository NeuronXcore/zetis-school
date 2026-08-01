// Index de notions d'une matière (addendum ADR-0024) + demande de contenu à Papa
// (addendum ADR-0027). Deux routes ÉLÈVE, aucune donnée durable côté front.
import type {
  StudentContentRequestBody,
  StudentContentRequestResult,
  SubjectPanoply,
} from "@zetis/types";
import { API_URL, authClient } from "./authClient";

function headers(withBody = false): HeadersInit {
  const token = authClient.getToken();
  const base: HeadersInit = withBody ? { "Content-Type": "application/json" } : {};
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

/** Erreur portant le code HTTP — la page distingue un 404 (matière inconnue) du reste. */
export class PanoplyError extends Error {
  constructor(readonly status: number) {
    super(`Erreur ${status}`);
  }
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new PanoplyError(res.status);
  return (await res.json()) as T;
}

/** `GET /api/student/subjects/{slug}/panoply` — chapitres validés → notions → panoplie.
 *
 *  404 si la matière est inconnue ou hors année active ; `chapters: []` si elle existe mais
 *  n'a encore rien de validé — un état positif, pas une erreur. */
export async function fetchSubjectPanoply(slug: string): Promise<SubjectPanoply> {
  return asJson(
    await fetch(`${API_URL}/api/student/subjects/${encodeURIComponent(slug)}/panoply`, {
      headers: headers(),
    }),
  );
}

/** `POST /api/student/content-requests` — Massimo demande à Papa ce qui manque.
 *
 *  Écriture SEULE : il n'existe aucune route de lecture côté élève, et il ne faut pas en
 *  ajouter (la file de Papa n'est pas un écran d'attente pour l'enfant). */
export async function createContentRequest(
  body: StudentContentRequestBody,
): Promise<StudentContentRequestResult> {
  return asJson(
    await fetch(`${API_URL}/api/student/content-requests`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify(body),
    }),
  );
}
