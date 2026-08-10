// Client API de la page Papa « Agenda » (ADR-0025). Préfixe `/api/agenda`, `require_parent`.
// Types partagés depuis @zetis/types (contrat unique front/back).
//
// **Aucune fonction de coche n'existe ici, et il ne faut pas en ajouter.** Seul Massimo écrit
// `done_at` (ADR-0025 §2b) : le serveur répond 403 à toute tentative, et une affordance côté
// Papa serait un bug de cette page.
import {
  type AgendaItemDraft,
  type AgendaItemPatch,
  type AgendaItemPilot,
  type AgendaSettings,
} from "@zetis/types";
import { API_URL } from "./authClient";
import { asJson, authHeader, jsonHeaders } from "./httpClient";

const BASE = `${API_URL}/api/agenda`;

/** Items d'une fenêtre de dates — **archivés inclus** (le masquage reste visible en pilotage). */
export async function fetchAgendaItems(from: string, to: string): Promise<AgendaItemPilot[]> {
  const query = new URLSearchParams({ from, to });
  return asJson(await fetch(`${BASE}/items?${query}`, { headers: authHeader() }));
}

/** Saisie EN LOT : une semaine relevée sur l'ENT part en UNE requête. */
export async function createAgendaItems(items: AgendaItemDraft[]): Promise<AgendaItemPilot[]> {
  return asJson(
    await fetch(`${BASE}/items`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ items }),
    }),
  );
}

/** Correction. Sur un item saisi par Massimo, le serveur pose `edited_by_parent_at` lui-même :
 *  la mention « complété par papa » apparaîtra dans son agenda. Rien de silencieux. */
export async function patchAgendaItem(
  id: number,
  body: AgendaItemPatch,
): Promise<AgendaItemPilot> {
  return asJson(
    await fetch(`${BASE}/items/${id}`, {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

/** Note privée — jamais servie à Massimo (schémas séparés côté serveur). */
export async function setAgendaNote(
  id: number,
  parentNote: string | null,
): Promise<AgendaItemPilot> {
  return asJson(
    await fetch(`${BASE}/items/${id}/note`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ parent_note: parentNote }),
    }),
  );
}

/** ARCHIVAGE (`dismissed_at`), jamais suppression : la ligne reste en base et reste
 *  retrouvable sous le filtre « Archivés ». D'où un item en réponse, et non un 204. */
export async function archiveAgendaItem(id: number): Promise<AgendaItemPilot> {
  return asJson(await fetch(`${BASE}/items/${id}`, { method: "DELETE", headers: authHeader() }));
}

/** Rend à Massimo une échéance archivée — le pendant d'`archiveAgendaItem`.
 *
 *  🔴 **Il n'existait pas, et c'était la moitié grave du défaut** : quand Massimo masquait un
 *  contrôle depuis son agenda, Papa le voyait sous « Archivés » sans **aucun moyen de le
 *  remettre** — `dismissed_at` est hors des champs éditables des deux autorités. Le seul recours
 *  était de ressaisir l'échéance à la main. Relecture humaine du 2026-08-10. */
export async function restoreAgendaItem(id: number): Promise<AgendaItemPilot> {
  return asJson(
    await fetch(`${BASE}/items/${id}/restore`, { method: "POST", headers: authHeader() }),
  );
}

export async function fetchAgendaSettings(): Promise<AgendaSettings> {
  return asJson(await fetch(`${BASE}/settings`, { headers: authHeader() }));
}

/** Ouverture / fermeture de la saisie élève — **geste explicite de Papa** (ADR-0025 §10).
 *  Ne jamais appeler depuis un effet dérivé d'un seuil observé : un droit qui dépend d'une
 *  statistique de comportement transforme la page en surveillance. */
export async function setAgendaSettings(studentEntryEnabled: boolean): Promise<AgendaSettings> {
  return asJson(
    await fetch(`${BASE}/settings`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ student_entry_enabled: studentEntryEnabled }),
    }),
  );
}
