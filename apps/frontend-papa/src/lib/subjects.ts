// Client API Matières (Papa) : Subject → Theme → Chapter.
// Persistance backend (CLAUDE.md) : aucune donnée pédagogique stockée côté front.
import { API_URL } from "./authClient";
import { asJson, authHeader, jsonHeaders } from "./httpClient";

export interface Chapter {
  id: number;
  name: string;
  description: string | null;
  period: string | null;
  status: string;
  sort_order: number;
}

export interface Theme {
  id: number;
  name: string;
  description: string | null;
  sort_order: number;
  chapters: Chapter[];
}

export interface Subject {
  id: number;
  name: string;
  slug: string;
  color: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  theme_count: number;
  chapter_count: number;
}

export interface SubjectDetail extends Subject {
  themes: Theme[];
}

export interface SubjectCreate {
  name: string;
  color?: string | null;
  icon?: string | null;
}

export interface ThemeCreate {
  name: string;
  description?: string | null;
}

export interface ChapterCreate {
  name: string;
  description?: string | null;
  period?: string | null;
}

export async function fetchSubjects(): Promise<Subject[]> {
  return asJson(await fetch(`${API_URL}/api/subjects`, { headers: authHeader() }));
}

export async function fetchSubjectDetail(subjectId: number): Promise<SubjectDetail> {
  return asJson(
    await fetch(`${API_URL}/api/subjects/${subjectId}`, { headers: authHeader() }),
  );
}

export async function createSubject(data: SubjectCreate): Promise<Subject> {
  return asJson(
    await fetch(`${API_URL}/api/subjects`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }),
  );
}

export async function createTheme(subjectId: number, data: ThemeCreate): Promise<Theme> {
  return asJson(
    await fetch(`${API_URL}/api/subjects/${subjectId}/themes`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }),
  );
}

export async function createChapter(themeId: number, data: ChapterCreate): Promise<Chapter> {
  return asJson(
    await fetch(`${API_URL}/api/subjects/themes/${themeId}/chapters`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    }),
  );
}
