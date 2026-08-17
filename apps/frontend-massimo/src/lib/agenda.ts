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
  type AgendaAhead,
  type AgendaDayTraces,
  type AgendaLateAlert,
  type AgendaItemStudent,
  type AgendaMonth,
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

/** Bande glissante : 3 jours avant aujourd'hui, aujourd'hui, 10 après.
 *  Ce qui reste asymétrique est calculé SERVEUR — ce module ne recompose rien. */
export async function fetchAgendaWeek(): Promise<AgendaWeek> {
  return asJson(await fetch(`${BASE}/week`, { headers: headers() }));
}

/** La grille mois (ADR-0025 Amdt 8 §D1). `anchor` au format `AAAA-MM`, défaut : le mois courant.
 *
 *  Ne rend QUE les jours du mois : les cellules d'alignement sur lundi sont fabriquées ici, et
 *  rendues **totalement vides, sans numéral**. */
export async function fetchAgendaMonth(anchor?: string): Promise<AgendaMonth> {
  const query = anchor ? `?${new URLSearchParams({ anchor })}` : "";
  return asJson(await fetch(`${BASE}/month${query}`, { headers: headers() }));
}

/** Ce que Massimo a travaillé un jour donné : matières, notions, formes (Amdt 8 §D2).
 *
 *  🔴 Route ÉLÈVE à schéma dédié. Ne jamais la remplacer par `/api/parent/activity/days/{day}`,
 *  qui sert `time`, `minutes`, `xp` et `score_percent` — quatre interdits d'un coup. */
export async function fetchAgendaDayTraces(day: string): Promise<AgendaDayTraces> {
  return asJson(await fetch(`${BASE}/days/${day}/traces`, { headers: headers() }));
}

/** `GET /ahead` — « Prendre de l'avance » (Amdt 9 §D6).
 *
 *  UN appel pour cinq sources. Sans lui, la page en ferait sept au montage.
 *
 *  ⚠️ **Ne jamais le greffer sur `news/summary`** : la doctrine de `news` interdit d'y compter du
 *  DÛ — un témoin de nouveauté meurt d'un regard, une dette grossit quand Massimo ne vient pas. */
export async function fetchAgendaAhead(): Promise<AgendaAhead> {
  return asJson(await fetch(`${BASE}/ahead`, { headers: headers() }));
}

/** `GET /late-alert` — l'échéance à signaler à l'ouverture, ou `null` (Amdt 9 §D12).
 *
 *  🔴 **Lire ne consomme pas** : c'est `markLateAlertSeen()` qui accuse réception, une fois le
 *  toast RÉELLEMENT affiché. Sans cette séparation, un effet réinvoqué en double (React en
 *  développement) escamoterait l'alerte. */
export async function fetchLateAlert(): Promise<AgendaLateAlert | null> {
  return asJson(await fetch(`${BASE}/late-alert`, { headers: headers() }));
}

/** `POST /late-alert/seen` — le toast a été montré. Rien d'autre aujourd'hui.
 *
 *  🔴 **`itemId` est OBLIGATOIRE, et le type doit l'imposer — le commentaire ne suffisait pas.**
 *  Il a été optionnel quelques minutes : le serveur retombait alors sur son recalcul, mais rien
 *  n'empêchait un appelant futur de l'omettre, et TypeScript l'acceptait sans broncher. Un
 *  commentaire qui explique pourquoi un argument compte n'est pas une contrainte ; une signature
 *  en est une.
 *
 *  ⚠️ Le champ reste **optionnel sur le fil** (`item_id: int | None`) : un bundle en cache d'avant
 *  ce correctif n'en envoie aucun, et le serveur doit continuer de le servir en recalculant.
 *  Obligatoire ici, tolérant là-bas — les deux vont ensemble.
 *
 *  Échec silencieux, comme `markAgendaSeen` : rater l'accusé laisse une alerte de trop dans la
 *  journée, ce qui est sans gravité. Une erreur technique sur l'écran d'un enfant ne l'est pas. */
export async function markLateAlertSeen(itemId: number): Promise<void> {
  try {
    // 🔴 **L'échéance montrée voyage avec l'accusé**, et ce n'est pas décoratif : sans elle, le
    // serveur ne peut avancer son plancher que jusqu'à aujourd'hui, ce qui **brûle toute la
    // fenêtre** alors qu'une seule échéance en est sortie. Les autres seraient perdues
    // définitivement. L'`id` est revalidé côté serveur — il n'est jamais cru sur parole.
    await fetch(`${BASE}/late-alert/seen`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId }),
    });
  } catch {
    // réseau indisponible : au pire une alerte de plus aujourd'hui
  }
}

/** Contrôles et rendus à venir, déjà bornés serveur (horizon et nombre).
 *
 *  ⚠️ **La page `/agenda` n'en est plus consommatrice** depuis l'Amdt 8 §D8 : la section
 *  « Ce qui arrive » a été retirée. Cette fonction reste **vivante et utilisée** par le bandeau
 *  d'Accueil (`HomeAgendaBanner`) et par les pages Matières (`useSubjectUpcoming`). Ne pas la
 *  supprimer en croyant nettoyer du mort : la route a trois appelants, deux ont survécu. */
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
 *  `adr-0025-agenda-scolaire` (Amendement 7). Le bandeau d'Accueil marquait vu au montage, donc
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
