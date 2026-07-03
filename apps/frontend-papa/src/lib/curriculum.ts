// Client API du référentiel de programme (Papa, Slice B — ADR-0009).
// Types partagés depuis @zetis/types (contrat unique front/back, règle CLAUDE.md n°8).
import {
  type ActiveSchoolYear,
  type ChapterManualCreateRequest,
  type ChapterPatchRequest,
  type CurriculumChapter,
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
