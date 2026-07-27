// Client API ZETIS pour l'extension (RAG + matières). Toutes les requêtes portent
// le JWT Papa lu dans chrome.storage.local. Utilisé par le popup ET le service worker.

import { getApiUrl, getToken } from "./storage";

export interface Subject {
  id: number;
  name: string;
  slug: string;
}

export interface Chapter {
  id: number;
  name: string;
}

export interface ClipPayload {
  title: string;
  text: string;
  source_url?: string | null;
  subject_id?: number | null;
  level?: string | null;
  chapter?: string | null;
}

export interface ClipUrlPayload {
  url: string;
  title?: string | null;
  subject_id?: number | null;
  level?: string | null;
  chapter?: string | null;
}

export interface IngestResult {
  document_id: number;
  chunks: number;
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** Code machine du backend (ex. "transcript_unavailable") — pour orchestrer le repli. */
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  if (!token) throw new ApiError("Non connecté. Ouvre les options pour te connecter.", 401);
  return { Authorization: `Bearer ${token}` };
}

async function asError(res: Response): Promise<ApiError> {
  let detail = `Erreur ${res.status}`;
  let code: string | undefined;
  try {
    const body = (await res.json()) as { detail?: string | { code?: string; message?: string } };
    const d = body.detail;
    if (typeof d === "string") {
      detail = d;
    } else if (d && typeof d === "object") {
      // clip-url renvoie un detail structuré {code, message} pour piloter le repli.
      if (d.message) detail = d.message;
      code = d.code;
    }
  } catch {
    /* corps non JSON : on garde le message générique */
  }
  return new ApiError(detail, res.status, code);
}

/** Liste des matières (GET /api/subjects). */
export async function listSubjects(): Promise<Subject[]> {
  const apiUrl = await getApiUrl();
  const res = await fetch(`${apiUrl}/api/subjects`, { headers: await authHeaders() });
  if (!res.ok) throw await asError(res);
  return (await res.json()) as Subject[];
}

/** Chapitres d'une matière, aplatis depuis les thèmes (GET /api/subjects/{id}).
 *  « thème » n'est pas exposé à l'ingestion : on replie ses chapitres en liste plate
 *  qui sert d'autocomplétion au champ libre `chapter` du popup (cf. prompt étape 19). */
export async function listChapters(subjectId: number): Promise<Chapter[]> {
  const apiUrl = await getApiUrl();
  const res = await fetch(`${apiUrl}/api/subjects/${subjectId}`, { headers: await authHeaders() });
  if (!res.ok) throw await asError(res);
  const detail = (await res.json()) as {
    themes?: { chapters?: { id: number; name: string }[] }[];
  };
  return (detail.themes ?? []).flatMap((theme) => theme.chapters ?? []);
}

/** Capture texte (page web / sélection) → POST /api/rag/clip (statut pending). */
export async function postClip(payload: ClipPayload): Promise<IngestResult> {
  const apiUrl = await getApiUrl();
  const res = await fetch(`${apiUrl}/api/rag/clip`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ ...payload, source_type: "web_clip" }),
  });
  if (!res.ok) throw await asError(res);
  return (await res.json()) as IngestResult;
}

/** Import transcription vidéo → POST /api/rag/clip-url (extraction serveur, pending).
 *  Peut lever une ApiError `code="transcript_unavailable"` → l'appelant tente le repli DOM. */
export async function postClipUrl(payload: ClipUrlPayload): Promise<IngestResult> {
  const apiUrl = await getApiUrl();
  const res = await fetch(`${apiUrl}/api/rag/clip-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await asError(res);
  return (await res.json()) as IngestResult;
}

/** Capture PDF → POST /api/rag/upload (multipart, statut pending). */
export async function postPdfUpload(
  file: Blob,
  filename: string,
  meta: { title?: string; subject_id?: number | null; level?: string | null; chapter?: string | null },
): Promise<IngestResult> {
  const apiUrl = await getApiUrl();
  const form = new FormData();
  form.append("file", file, filename);
  if (meta.title) form.append("title", meta.title);
  if (meta.subject_id != null) form.append("subject_id", String(meta.subject_id));
  if (meta.level) form.append("level", meta.level);
  if (meta.chapter) form.append("chapter", meta.chapter);
  const res = await fetch(`${apiUrl}/api/rag/upload`, {
    method: "POST",
    headers: await authHeaders(),
    body: form,
  });
  if (!res.ok) throw await asError(res);
  return (await res.json()) as IngestResult;
}

export { ApiError };
