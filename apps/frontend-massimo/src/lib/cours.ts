// Appels aux routes élève de la page Cours (lecture seule, validé uniquement —
// le filtrage est fait côté serveur, ADR-0009 §9). Contrats : @zetis/types.
import { type StudentCours, type StudentLessonContent } from "@zetis/types";
import { API_URL, authClient } from "./authClient";

function headers(): HeadersInit {
  const token = authClient.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
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

/** Chapitres validés de l'année active + leçons validées (référence légère). */
export async function fetchStudentCours(subjectSlug: string): Promise<StudentCours> {
  return asJson(
    await fetch(`${API_URL}/api/student/cours/${subjectSlug}`, { headers: headers() }),
  );
}

/** Cours (markdown) d'une leçon validée — 404 si pas encore disponible. */
export async function fetchStudentLessonCours(
  lessonId: number,
): Promise<StudentLessonContent> {
  return asJson(
    await fetch(`${API_URL}/api/student/lessons/${lessonId}/cours`, { headers: headers() }),
  );
}
