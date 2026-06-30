// Appels aux sources de cours RAG du backend (Étape 12).
// Papa uploade des fichiers (statut `pending`) puis valide/rejette les sources.
import { API_URL } from "./authClient";
import { asJson, authHeader } from "./httpClient";

export type ValidationStatus = "pending" | "validated" | "rejected" | "official";

export interface RagDocument {
  id: number;
  title: string;
  subject_id: number | null;
  source_type: string;
  level: string | null;
  chapter: string | null;
  validation_status: ValidationStatus;
  chunks: number;
}

export interface UploadMeta {
  title?: string;
  subject_id?: number | null;
  level?: string | null;
  chapter?: string | null;
}

export async function fetchDocuments(): Promise<RagDocument[]> {
  return asJson(await fetch(`${API_URL}/api/rag/documents`, { headers: authHeader() }));
}

// Upload multipart : on ne fixe PAS Content-Type (le navigateur ajoute le boundary).
export async function uploadDocument(file: File, meta: UploadMeta): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  if (meta.title) form.append("title", meta.title);
  if (meta.subject_id != null) form.append("subject_id", String(meta.subject_id));
  if (meta.level) form.append("level", meta.level);
  if (meta.chapter) form.append("chapter", meta.chapter);
  await asJson(
    await fetch(`${API_URL}/api/rag/upload`, {
      method: "POST",
      headers: authHeader(),
      body: form,
    }),
  );
}

export async function setValidation(
  documentId: number,
  action: "validate" | "reject",
): Promise<RagDocument> {
  return asJson(
    await fetch(`${API_URL}/api/rag/documents/${documentId}/${action}`, {
      method: "POST",
      headers: authHeader(),
    }),
  );
}
