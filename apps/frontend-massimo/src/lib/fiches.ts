// Appels aux routes élève des fiches de révision (page « Fiches », /fiches).
// Frontend pur : routes livrées par la slice A backend (module `fiches`). Contrats :
// @zetis/types (`packages/types/src/fiche.ts`) — aucun type redéclaré ici. Le serveur ne
// sert QUE des fiches `validated` (gate côté backend) : le client n'a aucune logique métier.
import { type FicheDetail, type FicheListItem, type FichesSummary } from "@zetis/types";
import { notifyNewsChanged } from "./newsEvents";
import { API_URL, authClient } from "./authClient";

function headers(): HeadersInit {
  const token = authClient.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function asJson<T>(res: Response): Promise<T> {
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
  return (await res.json()) as T;
}

/** `GET /api/student/fiches/summary` — decks par matière (compteur + « Nouveau »). */
export async function fetchFichesSummary(): Promise<FichesSummary> {
  return asJson(await fetch(`${API_URL}/api/student/fiches/summary`, { headers: headers() }));
}

/** `GET /api/student/subjects/{slug}/fiches` — fiches validées d'une matière (deck). */
export async function fetchSubjectFiches(slug: string): Promise<FicheListItem[]> {
  return asJson(
    await fetch(`${API_URL}/api/student/subjects/${slug}/fiches`, { headers: headers() }),
  );
}

/** `GET /api/student/fiches/{id}` — une fiche (spec complet). 404 si non validée. */
export async function fetchFiche(id: number): Promise<FicheDetail> {
  return asJson(await fetch(`${API_URL}/api/student/fiches/${id}`, { headers: headers() }));
}

/** `POST /api/student/fiches/{id}/seen` — marque la fiche vue (retrait du badge « Nouveau »). */
export async function markFicheSeen(id: number): Promise<void> {
  await fetch(`${API_URL}/api/student/fiches/${id}/seen`, { method: "POST", headers: headers() });
  notifyNewsChanged(); // le témoin de navigation doit retomber (ADR-0030 §5)
}
