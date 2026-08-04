// Partage des deux appels lourds de la galaxie — `/galaxy/all` et `/timeline?with_skills=true`.
//
// POURQUOI ICI ET PAS DANS `galaxy.ts` : ce module-là est du TRANSPORT PUR (« le client ne calcule
// RIEN »). Y glisser un état partagé lui ferait perdre cette propriété, qui est la raison pour
// laquelle il se relit sans se méfier. Le partage vit donc à côté, et `galaxy.ts` ne bouge pas.
//
// POURQUOI TOUT COURT : `/api/student/galaxy/all` renvoie tout le référentiel visible (~350
// nœuds). Il était déjà appelé deux fois sur l'Accueil (`HomeGalaxyCard` puis `useGalaxy` en
// arrivant sur `/galaxy`) ; le bandeau, monté sur les 21 routes, en aurait ajouté un troisième et
// un quatrième. Le bandeau et la carte s'arment dans le MÊME commit React, donc leurs deux
// `requestIdleCallback` tirent dans la même fenêtre : une déduplication en vol les ramène à un
// seul aller-retour.
//
// ⚠️ CE N'EST PAS UN CACHE DE SESSION, ET C'EST DÉLIBÉRÉ. Une fenêtre longue figerait le graphe :
// Massimo travaille une notion, revient sur l'Accueil, et son étoile ne serait pas allumée. On
// perdrait une vérité pour économiser une requête qu'on économise déjà. `FRESH_MS` couvre la
// rafale d'atterrissage, rien d'autre.
import type { GalaxyFullGraph, GalaxyTimeline } from "@zetis/types";
import { authClient } from "./authClient";
import { fetchFullGraph, fetchGalaxyTimelineWithSkills } from "./galaxy";

/** Assez pour couvrir l'écart entre deux `requestIdleCallback` d'un même atterrissage — le
 *  bandeau tire à 2000 ms de timeout, la carte à 1500, et Safari (l'iPhone de Massimo) n'a ni
 *  l'un ni l'autre et retombe sur des `setTimeout` de 800 et 600 ms. Pas plus. */
export const FRESH_MS = 5_000;

interface Slot<T> {
  /** Le jeton qui a servi. Voir `share()` : ce n'est pas de l'optimisation. */
  token: string | null;
  at: number;
  promise: Promise<T>;
}

let graphSlot: Slot<GalaxyFullGraph> | null = null;
let timelineSlot: Slot<GalaxyTimeline> | null = null;

function share<T>(
  slot: Slot<T> | null,
  set: (next: Slot<T> | null) => void,
  fetcher: () => Promise<T>,
): Promise<T> {
  // ⚠️ LE JETON FAIT PARTIE DE LA CLÉ, ET C'EST UNE QUESTION DE CONFIDENTIALITÉ, PAS DE CACHE.
  // `logout()` démonte le layout mais PAS ce module : sans cette comparaison, se déconnecter puis
  // se reconnecter dans le même onglet servirait la galaxie du compte précédent au suivant.
  // Comparer est plus sûr qu'espérer qu'on n'oubliera jamais d'appeler un `reset()`.
  const token = authClient.getToken();
  if (slot && slot.token === token && Date.now() - slot.at < FRESH_MS) return slot.promise;

  // Un échec n'est JAMAIS mémorisé : un creux réseau au démarrage ne doit pas condamner la
  // session. Le prochain appelant repart pour de bon.
  const promise = fetcher().catch((error: unknown) => {
    set(null);
    throw error;
  });
  set({ token, at: Date.now(), promise });
  return promise;
}

/** `/api/student/galaxy/all` — partagé par le bandeau, la carte d'accueil et `/galaxy`. */
export function loadFullGraph(): Promise<GalaxyFullGraph> {
  return share(
    graphSlot,
    (next) => {
      graphSlot = next;
    },
    fetchFullGraph,
  );
}

/** `/api/student/galaxy/timeline?with_skills=true` — la frise détaillée, base de la croissance. */
export function loadTimelineWithSkills(): Promise<GalaxyTimeline> {
  return share(
    timelineSlot,
    (next) => {
      timelineSlot = next;
    },
    fetchGalaxyTimelineWithSkills,
  );
}

/** Vide le partage. Réservé aux tests — en production, la clé par jeton suffit. */
export function resetGalaxyShared(): void {
  graphSlot = null;
  timelineSlot = null;
}
