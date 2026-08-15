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
import {
  type AgendaItemStudent,
  type AgendaPlanStep,
  type AgendaUpcomingItem,
  type AgendaWeek,
} from "@zetis/types";
import { notifyNewsChanged } from "./newsEvents";
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

/** Coche / décoche une étape du plan de préparation (ADR-0050 Décision 5, option A).
 *
 *  ⚠️ **Même règle que la coche d'un item, et pour la même raison** : c'est une **déclaration**
 *  de Massimo. Aucun XP, aucune célébration — sinon il apprend à cocher.
 *
 *  🔴 Et **jouer l'activité ne passe JAMAIS par ici** : une session de cartes ne coche rien. La
 *  variante « prouvée par la trace » est reportée, pas écartée. */
export async function setAgendaPlanStepDone(
  id: number,
  done: boolean,
): Promise<AgendaPlanStep> {
  return asJson(
    await fetch(`${BASE}/plan-steps/${id}/${done ? "done" : "undone"}`, {
      method: "POST",
      headers: headers(),
    }),
  );
}

/** Masque un item — y compris un item de Papa. Le masquage reste visible côté pilotage. */
export async function dismissAgendaItem(id: number): Promise<AgendaItemStudent> {
  const item = await asJson<AgendaItemStudent>(
    await fetch(`${BASE}/items/${id}/dismiss`, { method: "POST", headers: headers() }),
  );
  notifyNewsChanged(); // un item masqué n'est plus « arrivé » (ADR-0030 §5)
  return item;
}

/** Démasque un item — le rattrapage de la croix ✕.
 *
 *  🔴 Cette route n'existait pas, et c'était le défaut : un tap retirait un devoir de l'agenda
 *  **définitivement**, sans qu'aucune surface — ni celle de Massimo, ni celle de Papa — puisse
 *  le rendre. Trouvé à la relecture humaine du 2026-08-10. */
export async function undismissAgendaItem(id: number): Promise<AgendaItemStudent> {
  const item = await asJson<AgendaItemStudent>(
    await fetch(`${BASE}/items/${id}/undismiss`, { method: "POST", headers: headers() }),
  );
  notifyNewsChanged(); // il redevient un item de l'agenda — le témoin se recalcule
  return item;
}

/** `POST /api/student/agenda/seen` — Massimo a regardé ce qui est arrivé (addendum §12.3).
 *
 *  🔴 **UN SEUL appelant : `useAgenda`, à l'ouverture de `/agenda`.**
 *  ~~« Appelée depuis DEUX surfaces, et il en faut deux […] N'en retenir qu'une ferait mentir le
 *  témoin sur ce qui a déjà été lu. »~~ — RÉVOQUÉ le 2026-08-15 par
 *  `adr-0025-addendum-le-regard-vit-a-l-agenda`. Le bandeau d'Accueil marquait vu au montage, donc
 *  avant que le témoin ait pu s'afficher ; et il ne montre qu'un extrait, pas ce qui est arrivé.
 *  La règle est désormais : **marque vu la surface qui montre TOUT ce qui est arrivé**, et il n'y
 *  en a qu'une.
 *
 *  Ne renvoie rien : le watermark ne redescend jamais côté client, seul le NOMBRE circule. Échec
 *  silencieux — rater un marquage laisse un badge de trop, ce qui est sans gravité ; afficher une
 *  erreur pour ça ne l'est pas. */
export async function markAgendaSeen(): Promise<void> {
  try {
    await fetch(`${BASE}/seen`, { method: "POST", headers: headers() });
    notifyNewsChanged();
  } catch {
    // réseau indisponible : le témoin se corrigera au prochain regard
  }
}
