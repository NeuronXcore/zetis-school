// Appels aux routes élève de la page Cours (lecture seule, validé uniquement —
// le filtrage est fait côté serveur, ADR-0009 §9). Contrats : @zetis/types.
import { type StudentCours, type StudentLessonContent } from "@zetis/types";
import { API_URL, authClient } from "./authClient";
import { notifyNewsChanged } from "./newsEvents";

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

/** Cours (markdown) d'une leçon validée — 404 si pas encore disponible.
 *
 *  ⚠️ **C'est un `GET` qui émet `NEWS_CHANGED_EVENT`, et ce n'est pas une entorse à la doctrine de
 *  `newsEvents.ts` (« l'émission vit à côté de l'écriture »).** L'écriture existe bien : elle est
 *  SERVEUR — `GET /lessons/{id}/cours` appelle `mark_lesson_seen`, qui pose la ligne `lesson_views`
 *  dont vit le témoin Matières. Elle est simplement de l'autre côté du fil.
 *
 *  Ne pas « remonter l'émission au bon endroit » : il n'y en a pas d'autre côté client, et la
 *  déplacer dans une page casserait le témoin pour les appelants qu'elle ne couvre pas
 *  (`CoursPage`, et la modale de cours d'une mission).
 *
 *  L'échec (404 sur une leçon sans cours) n'émet rien : il n'a rien marqué vu non plus. */
export async function fetchStudentLessonCours(
  lessonId: number,
): Promise<StudentLessonContent> {
  const content = await asJson<StudentLessonContent>(
    await fetch(`${API_URL}/api/student/lessons/${lessonId}/cours`, { headers: headers() }),
  );
  notifyNewsChanged();
  return content;
}
