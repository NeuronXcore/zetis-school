// Demandes de notions hors-programme envoyées par Massimo depuis ELI5 (« Dis à Papa ») OU le chat
// (addendum ADR-0027). Papa les traite dans l'inbox « Demandes de Massimo » : ajouter la notion,
// créer la leçon, ou ignorer — via les ponts backend (réutilisent skills-backfill / lesson manuelle).
import { API_URL } from "./authClient";
import { asJson, authHeader, jsonHeaders } from "./httpClient";
import { notifyDemandesChanged } from "./demandesEvents";

export interface NotionRequest {
  id: number;
  text: string;
  status: string;
  subject_id: number | null;
  created_at: string;
}

export async function fetchNotionRequests(status = "pending"): Promise<NotionRequest[]> {
  return asJson(
    await fetch(`${API_URL}/api/notion-requests?status=${encodeURIComponent(status)}`, {
      headers: authHeader(),
    }),
  );
}

export async function fetchNotionRequestsCount(): Promise<number> {
  const body = await asJson<{ pending: number }>(
    await fetch(`${API_URL}/api/notion-requests/count`, { headers: authHeader() }),
  );
  return body.pending;
}

export async function resolveNotionRequest(
  id: number,
  status: "added" | "dismissed",
): Promise<NotionRequest> {
  const out = await asJson<NotionRequest>(
    await fetch(`${API_URL}/api/notion-requests/${id}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({ status }),
    }),
  );
  notifyDemandesChanged();
  return out;
}

export interface AddToProgramResult {
  skill_created: number;
  subject_id: number;
  status: string;
  /** ⚠️ `true` → la notion existe au programme mais **aucune leçon ne la porte**, donc ZETIS ne
   *  produira jamais rien pour elle (`equip_notion` renvoie `has_lesson=false`).
   *
   *  L'état est légitime — Papa peut vouloir la rattacher plus tard à une leçon existante. Ce qui
   *  manquait, c'est de le DIRE : le bouton « + Programme » se lit « traité ». Calculé serveur,
   *  jamais supposé : une notion déjà portée par une leçon ne déclenche aucun avertissement. */
  needs_lesson: boolean;
  skill_id: number | null;
}

/** Pont « Ajouter au programme » : la notion devient une Skill dans la matière choisie. */
export async function addNotionToProgram(
  id: number,
  subjectId: number,
): Promise<AddToProgramResult> {
  const out = await asJson<AddToProgramResult>(
    await fetch(`${API_URL}/api/notion-requests/${id}/add-to-program`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ subject_id: subjectId }),
    }),
  );
  notifyDemandesChanged();
  return out;
}

export interface CreateLessonResult {
  lesson_id: number;
  lesson_status: string; // validated (sans cours) | draft (cours rédigé à valider)
  course_written: boolean;
  status: string;
}

/** Pont « Créer la leçon » : échafaude une leçon (+ cours optionnel) dans le chapitre choisi. */
export async function createLessonFromRequest(
  id: number,
  chapterId: number,
  generateCourse: boolean,
): Promise<CreateLessonResult> {
  const out = await asJson<CreateLessonResult>(
    await fetch(`${API_URL}/api/notion-requests/${id}/create-lesson`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ chapter_id: chapterId, generate_course: generateCourse }),
    }),
  );
  notifyDemandesChanged();
  return out;
}
