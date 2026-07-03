// Client API du référentiel de programme (Papa, Slice B — ADR-0009).
// Types partagés depuis @zetis/types (contrat unique front/back, règle CLAUDE.md n°8).
import {
  type ActiveSchoolYear,
  type BatchValidationResult,
  type ChapterManualCreateRequest,
  type ChapterPatchRequest,
  type CurriculumChapter,
  type CurriculumLesson,
  type LessonManualCreateRequest,
  type LessonPatchRequest,
} from "@zetis/types";
import { API_URL } from "./authClient";
import { asJson, authHeader, jsonHeaders } from "./httpClient";

export async function fetchActiveSchoolYear(): Promise<ActiveSchoolYear> {
  return asJson(
    await fetch(`${API_URL}/api/school-years/active/subjects`, { headers: authHeader() }),
  );
}

export async function fetchChapters(sysId: number): Promise<CurriculumChapter[]> {
  return asJson(
    await fetch(`${API_URL}/api/school-year-subjects/${sysId}/chapters`, {
      headers: authHeader(),
    }),
  );
}

/** Passe 1 (appel cloud synchrone ~10-30 s) : remplace les générés non validés. */
export async function generateChapters(sysId: number): Promise<CurriculumChapter[]> {
  return asJson(
    await fetch(`${API_URL}/api/school-year-subjects/${sysId}/generate-chapters`, {
      method: "POST",
      headers: authHeader(),
    }),
  );
}

export async function createManualChapter(
  sysId: number,
  data: ChapterManualCreateRequest,
): Promise<CurriculumChapter> {
  return asJson(
    await fetch(`${API_URL}/api/school-year-subjects/${sysId}/chapters`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }),
  );
}

export async function patchChapter(
  chapterId: number,
  data: ChapterPatchRequest,
): Promise<CurriculumChapter> {
  return asJson(
    await fetch(`${API_URL}/api/chapters/${chapterId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }),
  );
}

export async function deleteChapter(chapterId: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/chapters/${chapterId}`, {
    method: "DELETE",
    headers: authHeader(),
  });
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

/** Lot matière : valide tous les `pending` de la matière (les `rejected` restent). */
export async function validateAllChapters(sysId: number): Promise<BatchValidationResult> {
  return asJson(
    await fetch(`${API_URL}/api/school-year-subjects/${sysId}/chapters/validate-all`, {
      method: "POST",
      headers: authHeader(),
    }),
  );
}

/** Lot année : valide tous les `pending` de l'année active, toutes matières. */
export async function validateAllActiveYear(): Promise<BatchValidationResult> {
  return asJson(
    await fetch(`${API_URL}/api/school-years/active/chapters/validate-all`, {
      method: "POST",
      headers: authHeader(),
    }),
  );
}

export async function reorderChapters(
  sysId: number,
  chapterIds: number[],
): Promise<CurriculumChapter[]> {
  return asJson(
    await fetch(`${API_URL}/api/school-year-subjects/${sysId}/chapters/reorder`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ chapter_ids: chapterIds }),
    }),
  );
}

// ---------------------------------------------------------------------------
// Leçons d'un chapitre (Lot 2 Slice B) — chemins : curriculum/router.py.
// ---------------------------------------------------------------------------

export async function fetchLessons(chapterId: number): Promise<CurriculumLesson[]> {
  return asJson(
    await fetch(`${API_URL}/api/chapters/${chapterId}/lessons`, { headers: authHeader() }),
  );
}

/** Passe 2 (appel cloud synchrone ~10-30 s) : 409 si le chapitre n'est ni validé ni
 *  manuel. Renvoie la liste complète des leçons du chapitre après génération. */
export async function generateLessons(chapterId: number): Promise<CurriculumLesson[]> {
  return asJson(
    await fetch(`${API_URL}/api/chapters/${chapterId}/generate-lessons`, {
      method: "POST",
      headers: authHeader(),
    }),
  );
}

export async function createManualLesson(
  chapterId: number,
  data: LessonManualCreateRequest,
): Promise<CurriculumLesson> {
  return asJson(
    await fetch(`${API_URL}/api/chapters/${chapterId}/lessons`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }),
  );
}

export async function patchLesson(
  lessonId: number,
  data: LessonPatchRequest,
): Promise<CurriculumLesson> {
  return asJson(
    await fetch(`${API_URL}/api/lessons/${lessonId}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }),
  );
}

/** `draft` → `validated` (409 sinon — le backend est la source de la règle). */
export async function validateLesson(lessonId: number): Promise<CurriculumLesson> {
  return asJson(
    await fetch(`${API_URL}/api/lessons/${lessonId}/validate`, {
      method: "POST",
      headers: authHeader(),
    }),
  );
}

/** `draft` → `archived` : la leçon sort du flux (pas de statut `rejected` côté leçons). */
export async function rejectLesson(lessonId: number): Promise<CurriculumLesson> {
  return asJson(
    await fetch(`${API_URL}/api/lessons/${lessonId}/reject`, {
      method: "POST",
      headers: authHeader(),
    }),
  );
}

export async function deleteLesson(lessonId: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/lessons/${lessonId}`, {
    method: "DELETE",
    headers: authHeader(),
  });
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

/** Liste ordonnée COMPLÈTE des ids du chapitre — `archived` incluses (le backend vérifie). */
export async function reorderLessons(
  chapterId: number,
  lessonIds: number[],
): Promise<CurriculumLesson[]> {
  return asJson(
    await fetch(`${API_URL}/api/chapters/${chapterId}/lessons/reorder`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ lesson_ids: lessonIds }),
    }),
  );
}
