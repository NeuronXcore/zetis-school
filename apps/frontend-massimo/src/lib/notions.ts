// Decks de notions validées (ELI5 v2) — routes ÉLÈVE neutres de la slice A
// (lecture seule) : compteurs par matière + notions dédupliquées d'une matière.
// Aucune donnée durable côté front.
import { type StudentNotionsSummary, type SubjectNotions } from "@zetis/types";
import { API_URL, authClient } from "./authClient";

function headers(): HeadersInit {
  const token = authClient.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return (await res.json()) as T;
}

/** `GET /api/student/notions/summary` — compteurs de notions par matière (année active). */
export async function fetchNotionsSummary(): Promise<StudentNotionsSummary> {
  return asJson(await fetch(`${API_URL}/api/student/notions/summary`, { headers: headers() }));
}

/** `GET /api/student/subjects/{slug}/notions` — notions validées dédupliquées d'une matière. */
export async function fetchSubjectNotions(slug: string): Promise<SubjectNotions> {
  return asJson(
    await fetch(`${API_URL}/api/student/subjects/${encodeURIComponent(slug)}/notions`, {
      headers: headers(),
    }),
  );
}
