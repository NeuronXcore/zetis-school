// L'atelier — la fiche que Massimo fabrique lui-même (addendum ADR-0015).
// Frontend pur : toute la règle vit côté serveur (appartenance, bornes, passage brouillon →
// fiche). Contrats : @zetis/types — aucun type redéclaré ici.
import {
  type FicheCandidates,
  type FicheDraft,
  type FicheDraftDetail,
  type FicheFeedback,
  type FicheSection,
  type FicheTranscript,
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

/** `GET …/draft/{id}/candidates` — ce que la section offre pour DÉMARRER.
 *
 * Selon la section : 12 phrases à choisir (`points_cles`), jusqu'à 4 termes à définir
 * (`definitions`), ou une simple amorce (`essentiel`, qui est une synthèse et n'a donc aucune
 * candidate possible).
 */
export async function fetchCandidates(
  id: number,
  section: FicheSection = "points_cles",
): Promise<FicheCandidates> {
  return asJson(
    await fetch(`${API_URL}/api/student/fiches/draft/${id}/candidates?section=${section}`, {
      headers: headers(),
    }),
  );
}

/** `POST …/draft/{id}/transcribe` — « Le dire à voix haute » (Whisper LOCAL, ADR-0012).
 *
 * Rend du TEXTE : c'est Massimo qui décide de le garder. Le serveur ne remplit rien.
 */
export async function transcribeForDraft(id: number, audio: Blob): Promise<FicheTranscript> {
  const form = new FormData();
  form.append("file", audio, "dictee.webm");
  return asJson(
    await fetch(`${API_URL}/api/student/fiches/draft/${id}/transcribe`, {
      method: "POST",
      headers: headers(), // pas de Content-Type : le navigateur pose la frontière multipart
      body: form,
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

/**
 * `POST …/fiches/{id}/rework` — « ✏️ La retravailler » (ADR-0054 §1).
 *
 * 🔴 **Ne PAS remplacer par une simple navigation vers l'atelier.** `openDraft` créerait un
 * brouillon **VIDE** en version N+1 (`open_or_get_draft` ne pré-remplit que le décor), alors que
 * `rework` repart de ce qu'elle avait écrit. Les deux aboutissent à un brouillon pour la même
 * leçon — seul le contenu diffère, et c'est tout l'écart entre « retravailler » et « recommencer ».
 *
 * Enchaînement : `rework` d'abord, navigation ensuite — `openDraft` retrouve alors le brouillon
 * existant au lieu d'en fabriquer un second. Idempotent des deux côtés.
 */
export async function reworkFiche(ficheId: number): Promise<FicheDraftDetail> {
  return asJson(
    await fetch(`${API_URL}/api/student/fiches/${ficheId}/rework`, {
      method: "POST",
      headers: headers(),
    }),
  );
}

/** Ce que le pont a VRAIMENT fait — deux nombres, jamais un seul. */
export interface FicheCartes {
  cartes: number;
  termes_sans_notion: string[];
}

/**
 * « 🃏 En faire des cartes » — ses définitions deviennent ses cartes de révision.
 *
 * ⚠️ Ne s'ouvre que sur une fiche FINIE (404 sur un brouillon) : un demi-travail n'entre pas
 * dans le circuit de révision. Idempotent — rejouer met les cartes à jour.
 */
export async function cardsFromFiche(ficheId: number): Promise<FicheCartes> {
  return asJson(
    await fetch(`${API_URL}/api/student/fiches/${ficheId}/cards`, {
      method: "POST",
      headers: headers(),
    }),
  );
}
