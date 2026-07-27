// API capsules (Papa) — Lot 1. Types partagés depuis @zetis/types (contrat unique front/back).
import { type CapsuleSpec } from "@zetis/types";
import { API_URL, authClient } from "./authClient";
import { asJson, authHeader, jsonHeaders } from "./httpClient";

// Cycle de rendu MP4 (Lot 2). `draft` = pas encore rendu ; `published` = MP4 disponible.
export type CapsuleRenderStatus = "draft" | "rendering" | "published" | "failed";

// Niveau de difficulté (pilote l'IA + badge Massimo).
export type DifficultyChoice = "facile" | "moyen" | "difficile";

export interface CapsuleListItem {
  id: number;
  title: string;
  subject: string;
  subject_slug: string;
  chapter_id: number | null;
  chapter: string | null;
  difficulty: DifficultyChoice | null;
  validation_status: string;
  scenes_count: number;
  status: CapsuleRenderStatus;
  video_url: string | null;
  view_count: number;
  updated_at: string | null;
}

export interface Capsule {
  id: number;
  subject_id: number;
  subject: string;
  subject_slug: string;
  skill_id: number | null;
  chapter_id: number | null;
  chapter: string | null;
  difficulty: DifficultyChoice | null;
  title: string;
  instruction: string | null;
  validation_status: string;
  spec: CapsuleSpec;
  status: CapsuleRenderStatus;
  video_url: string | null;
  view_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export type VisualChoice =
  | "auto"
  | "numberline"
  | "barmodel"
  | "geometry"
  | "steps"
  | "timeline"
  | "diagram";
export type DurationChoice = "courte" | "moyenne" | "longue" | "1min";

export interface CapsuleGenerateInput {
  subject_id: number;
  instruction: string;
  level?: string;
  skill_id?: number;
  chapter_id?: number | null;
  visual?: VisualChoice;
  duration?: DurationChoice;
  difficulty?: DifficultyChoice;
}

export async function listCapsules(): Promise<CapsuleListItem[]> {
  return asJson(await fetch(`${API_URL}/api/capsules`, { headers: authHeader() }));
}

export async function getCapsule(id: number): Promise<Capsule> {
  return asJson(await fetch(`${API_URL}/api/capsules/${id}`, { headers: authHeader() }));
}

/** Génère + persiste une capsule (statut pending). Peut prendre ~40 s avec qwen2.5 local. */
export async function generateCapsule(input: CapsuleGenerateInput): Promise<Capsule> {
  return asJson(
    await fetch(`${API_URL}/api/capsules/generate`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(input),
    }),
  );
}

export async function regenerateCapsule(
  id: number,
  instruction?: string,
  difficulty?: DifficultyChoice,
): Promise<Capsule> {
  return asJson(
    await fetch(`${API_URL}/api/capsules/${id}/regenerate`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ instruction: instruction ?? null, difficulty: difficulty ?? null }),
    }),
  );
}

export async function setCapsuleValidation(
  id: number,
  action: "validate" | "reject",
): Promise<Capsule> {
  return asJson(
    await fetch(`${API_URL}/api/capsules/${id}/${action}`, {
      method: "POST",
      headers: authHeader(),
    }),
  );
}

/** Remplace le CapsuleSpec (édition JSON). Revalidé côté backend ; repasse en `pending`. */
export async function updateSpec(id: number, spec: CapsuleSpec): Promise<Capsule> {
  return asJson(
    await fetch(`${API_URL}/api/capsules/${id}/spec`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ spec }),
    }),
  );
}

/** (Re)rattache une capsule à un chapitre (ou aucun si `null`). */
export async function classifyCapsule(id: number, chapterId: number | null): Promise<Capsule> {
  return asJson(
    await fetch(`${API_URL}/api/capsules/${id}/classify`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ chapter_id: chapterId }),
    }),
  );
}

export async function deleteCapsule(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/capsules/${id}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`Suppression échouée (erreur ${res.status}).`);
}

/** Synthétise la voix (Piper) et cale les durées sur la narration. ~10–20 s. */
export async function synthesizeVoice(id: number): Promise<Capsule> {
  return asJson(
    await fetch(`${API_URL}/api/capsules/${id}/voice`, {
      method: "POST",
      headers: authHeader(),
    }),
  );
}

/** Lance le rendu MP4 (asynchrone, worker-media). La capsule passe en `rendering`. */
export async function renderCapsule(id: number): Promise<Capsule> {
  return asJson(
    await fetch(`${API_URL}/api/capsules/${id}/render`, {
      method: "POST",
      headers: authHeader(),
    }),
  );
}

/** URL absolue du MP4 rendu (chemin relatif renvoyé par le backend + token). */
export function videoSrc(relativeUrl: string): string {
  const token = authClient.getToken();
  const sep = relativeUrl.includes("?") ? "&" : "?";
  return `${API_URL}${relativeUrl}${token ? `${sep}token=${encodeURIComponent(token)}` : ""}`;
}

/** URL absolue d'une piste audio de scène (chemin relatif renvoyé par le backend + token). */
export function audioSrc(relativeUrl: string): string {
  const token = authClient.getToken();
  const sep = relativeUrl.includes("?") ? "&" : "?";
  return `${API_URL}${relativeUrl}${token ? `${sep}token=${encodeURIComponent(token)}` : ""}`;
}
