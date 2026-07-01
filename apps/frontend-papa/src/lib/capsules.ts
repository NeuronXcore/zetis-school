// API capsules (Papa) — Lot 1. Types partagés depuis @zetis/types (contrat unique front/back).
import { type CapsuleSpec } from "@zetis/types";
import { API_URL, authClient } from "./authClient";
import { asJson, authHeader, jsonHeaders } from "./httpClient";

export interface CapsuleListItem {
  id: number;
  title: string;
  subject: string;
  validation_status: string;
  scenes_count: number;
  updated_at: string | null;
}

export interface Capsule {
  id: number;
  subject_id: number;
  subject: string;
  skill_id: number | null;
  title: string;
  instruction: string | null;
  validation_status: string;
  spec: CapsuleSpec;
  created_at: string | null;
  updated_at: string | null;
}

export type VisualChoice = "auto" | "numberline" | "barmodel";
export type DurationChoice = "courte" | "moyenne" | "longue";

export interface CapsuleGenerateInput {
  subject_id: number;
  instruction: string;
  level?: string;
  skill_id?: number;
  visual?: VisualChoice;
  duration?: DurationChoice;
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

export async function regenerateCapsule(id: number, instruction?: string): Promise<Capsule> {
  return asJson(
    await fetch(`${API_URL}/api/capsules/${id}/regenerate`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ instruction: instruction ?? null }),
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

/** URL absolue d'une piste audio de scène (chemin relatif renvoyé par le backend + token). */
export function audioSrc(relativeUrl: string): string {
  const token = authClient.getToken();
  const sep = relativeUrl.includes("?") ? "&" : "?";
  return `${API_URL}${relativeUrl}${token ? `${sep}token=${encodeURIComponent(token)}` : ""}`;
}
