// Routes élève de l'agenda scolaire (ADR-0025), page `/agenda`.
// Contrats : @zetis/types (`packages/types/src/agenda.ts`) — rien n'est redéclaré ici.
//
// **Ce que Massimo peut faire en phase 0 : cocher et masquer.** La saisie (`POST /items`) est
// derrière un verrou SERVEUR (`AGENDA_STUDENT_ENTRY_ENABLED`) et n'a aucun point d'entrée dans
// cette interface : tant que la saisie n'est pas ouverte, il n'y a pas de composer, pas de
// bouton grisé, pas de « bientôt ». Griser un composer griserait une capacité retirée à
// l'enfant — l'ouverture doit être un événement positif, pas la fin d'une privation affichée.
//
// `parent_note` n'existe pas dans ces réponses : le serveur sert un schéma séparé.
import { type AgendaItemStudent, type AgendaUpcomingItem, type AgendaWeek } from "@zetis/types";
import { API_URL, authClient } from "./authClient";

const BASE = `${API_URL}/api/student/agenda`;

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
      // réponse non-JSON : message générique (jamais affiché tel quel à Massimo)
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

/** Bande glissante : 3 jours avant aujourd'hui, aujourd'hui, 3 jours après.
 *  L'asymétrie passé/futur est calculée SERVEUR — ce module ne recompose rien. */
export async function fetchAgendaWeek(): Promise<AgendaWeek> {
  return asJson(await fetch(`${BASE}/week`, { headers: headers() }));
}

/** Contrôles et rendus à venir, déjà bornés serveur (horizon et nombre). */
export async function fetchAgendaUpcoming(): Promise<AgendaUpcomingItem[]> {
  return asJson(await fetch(`${BASE}/upcoming`, { headers: headers() }));
}

export async function fetchAgendaItems(from: string, to: string): Promise<AgendaItemStudent[]> {
  const query = new URLSearchParams({ from, to });
  return asJson(await fetch(`${BASE}/items?${query}`, { headers: headers() }));
}

/** Coche / décoche — sur TOUS les items, y compris ceux ajoutés par Papa.
 *  Aucun XP n'est crédité par ce geste : il est déclaratif, il ne se récompense pas. */
export async function setAgendaItemDone(
  id: number,
  done: boolean,
): Promise<AgendaItemStudent> {
  return asJson(
    await fetch(`${BASE}/items/${id}/${done ? "done" : "undone"}`, {
      method: "POST",
      headers: headers(),
    }),
  );
}

/** Masque un item — y compris un item de Papa. Le masquage reste visible côté pilotage. */
export async function dismissAgendaItem(id: number): Promise<AgendaItemStudent> {
  return asJson(
    await fetch(`${BASE}/items/${id}/dismiss`, { method: "POST", headers: headers() }),
  );
}
