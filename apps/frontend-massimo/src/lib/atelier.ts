// L'atelier — la fiche que Massimo fabrique lui-même (addendum ADR-0015).
// Frontend pur : toute la règle vit côté serveur (appartenance, bornes, passage brouillon →
// fiche). Contrats : @zetis/types — aucun type redéclaré ici.
import {
  type FicheCandidates,
  type FicheDraft,
  type FicheDraftDetail,
  type FicheFeedback,
} from "@zetis/types";
import { API_URL, authClient } from "./authClient";

function headers(json = false): HeadersInit {
  const token = authClient.getToken();
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Erreur ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      // Le 422 de `finish` porte un objet (`message` + `champs`), pas une chaîne : l'écran doit
      // pouvoir dire CE QUI manque plutôt qu'« Erreur 422 ».
      if (typeof body.detail === "string") detail = body.detail;
      else if (body.detail && typeof body.detail === "object") {
        const d = body.detail as { message?: string };
        if (d.message) detail = d.message;
      }
    } catch {
      /* réponse non-JSON : message générique */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

/** `POST /api/student/fiches/draft` — ouvre ou RETROUVE le brouillon d'une leçon (idempotent). */
export async function openDraft(lessonId: number): Promise<FicheDraftDetail> {
  return asJson(
    await fetch(`${API_URL}/api/student/fiches/draft`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ lesson_id: lessonId }),
    }),
  );
}

/** `PATCH /api/student/fiches/draft/{id}` — sauvegarde à chaque geste (c'est elle qui tient
 *  « tout est gardé au fur et à mesure »). Envoie l'état COMPLET : le serveur remplace. */
export async function saveDraft(id: number, draft: FicheDraft): Promise<FicheDraftDetail> {
  return asJson(
    await fetch(`${API_URL}/api/student/fiches/draft/${id}`, {
      method: "PATCH",
      headers: headers(true),
      body: JSON.stringify({ draft }),
    }),
  );
}

/** `GET …/draft/{id}/candidates` — les phrases du cours parmi lesquelles il choisit. */
export async function fetchCandidates(id: number): Promise<FicheCandidates> {
  return asJson(
    await fetch(`${API_URL}/api/student/fiches/draft/${id}/candidates?section=points_cles`, {
      headers: headers(),
    }),
  );
}

/** `POST …/draft/{id}/review` — « ZETIS, regarde ma fiche ». */
export async function reviewDraft(id: number): Promise<FicheFeedback> {
  return asJson(
    await fetch(`${API_URL}/api/student/fiches/draft/${id}/review`, {
      method: "POST",
      headers: headers(),
    }),
  );
}

/** `POST …/draft/{id}/finish` — le moment où la fiche existe. 422 s'il manque l'obligatoire. */
export async function finishDraft(id: number): Promise<FicheDraftDetail> {
  return asJson(
    await fetch(`${API_URL}/api/student/fiches/draft/${id}/finish`, {
      method: "POST",
      headers: headers(),
    }),
  );
}
