// Client API de la page Papa « Fiches — pilotage » (fiches de révision, ADR-0015).
// Types partagés depuis @zetis/types (contrat unique front/back). Rôle parent côté backend.
import { type FicheDetail, type FichePilotageTree, type FicheSpec } from "@zetis/types";
import { API_URL } from "./authClient";
import { asJson, authHeader, jsonHeaders } from "./httpClient";
import { lancerEtSuivre, type SuiviTravail } from "./travaux";

const API = `${API_URL}/api/fiches`;

/** Leçons validées d'une matière + leurs fiches (1 appel, leçons sans fiche incluses). */
export async function fetchFichePilotage(subjectId: number): Promise<FichePilotageTree> {
  return asJson(await fetch(`${API}/pilotage/${subjectId}`, { headers: authHeader() }));
}

/** Génère une fiche à partir d'une leçon validée (statut `pending`).
 *
 *  202 + sondage (ADR-0041 §4) : la route accepte, le worker produit. La signature est INCHANGÉE —
 *  l'attente est absorbée ici, donc aucun appelant n'a eu à changer de forme. */
export async function generateFiche(
  lessonId: number,
  onEtat?: SuiviTravail,
): Promise<FicheDetail> {
  const sortie = await lancerEtSuivre<{ fiche_id: number }>(
    `${API}/generate`,
    {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ lesson_id: lessonId }),
    },
    onEtat,
  );
  return fetchFiche(sortie.fiche_id);
}

/** Régénère le spec d'une fiche (écrase l'existant → repasse `pending`).
 *
 *  202 + sondage (ADR-0041 §4). La signature est INCHANGÉE : l'attente est absorbée ici. */
export async function regenerateFiche(id: number, onEtat?: SuiviTravail): Promise<FicheDetail> {
  await lancerEtSuivre<{ fiche_id: number }>(
    `${API}/${id}/regenerate`,
    { method: "POST", headers: authHeader() },
    onEtat,
  );
  return fetchFiche(id);
}

/** La fiche par son id — sert à rendre l'objet une fois le travail fini. */
export async function fetchFiche(id: number): Promise<FicheDetail> {
  return asJson(await fetch(`${API}/${id}`, { headers: authHeader() }));
}

/** Remplace le spec (revalidé par le schéma → repasse `pending`). */
export async function updateFiche(id: number, spec: FicheSpec): Promise<FicheDetail> {
  return asJson(
    await fetch(`${API}/${id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ spec }),
    }),
  );
}

/** `pending` → `validated` (la fiche devient visible côté Massimo). */
export async function validateFiche(id: number): Promise<FicheDetail> {
  return asJson(await fetch(`${API}/${id}/validate`, { method: "POST", headers: authHeader() }));
}

/** `pending` → `rejected` (la fiche n'atteindra pas Massimo, sans être supprimée). */
export async function rejectFiche(id: number): Promise<FicheDetail> {
  return asJson(await fetch(`${API}/${id}/reject`, { method: "POST", headers: authHeader() }));
}

export async function deleteFiche(id: number): Promise<void> {
  const res = await fetch(`${API}/${id}`, { method: "DELETE", headers: authHeader() });
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
