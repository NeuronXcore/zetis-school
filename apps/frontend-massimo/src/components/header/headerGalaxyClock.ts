/**
 * L'horloge du bandeau — PURE. Elle comprime l'horloge de RANG dans un temps de mur borné.
 *
 * ⚠️ LE PROBLÈME QUE RIEN DANS L'EXISTANT NE RÉSOUT.
 *
 * `revealSchedule` (`@zetis/ui/galaxy`) cadence une notion toutes les `STAR_CADENCE` = 120 ms.
 * C'est juste pour une modale de rejeu qu'on ouvre exprès — 37 étoiles ≈ 5 s, comme le dit
 * l'addendum ADR-0029. Mais Massimo a ~280 notions au référentiel : **33,6 secondes**. Dans un
 * bandeau présent sur les 21 routes, c'est impensable.
 *
 * ⚠️ LA PARADE N'EST PAS DE COUPER DES NOTIONS. L'addendum ADR-0024 §1 a supprimé
 * `GALAXY_MAX_NODES` parce qu'« il cache la progression de l'enfant selon un critère matériel ».
 * On comprime donc le TEMPS : toutes les étoiles naissent, plus vite. Ce qui se règle sur la
 * densité, c'est `birthWall` — la **traînée** de naissance, c'est-à-dire les particules, ce que
 * l'addendum §2 autorise explicitement.
 *
 * On ne ralentit JAMAIS : une petite galaxie garde sa cadence naturelle. Étirer les trois notions
 * d'un débutant sur 3,2 s les ferait attendre pour rien.
 */
import type { RevealSchedule } from "@zetis/ui/galaxy";

/**
 * Durée de mur de la construction, plafond absolu quel que soit le nombre de notions.
 *
 * ⚠️ 3200 ms à la première écriture, porté à 7000 le 2026-08-04 après lecture à l'écran : ça se
 * construisait trop vite pour qu'on voie quoi que ce soit. Avec les 47 notions réellement
 * travaillées par Massimo, ce plafond n'est même plus atteint — l'horloge de rang joue à sa
 * cadence naturelle (120 ms par notion, ~5,8 s), sans aucune compression. Le plafond ne sert donc
 * plus qu'aux galaxies très fournies, ce qui est exactement son rôle.
 */
export const HEADER_TOTAL = 7000;
/** Trajet d'une étoile, de son parent jusqu'à sa place. */
export const BIRTH_WALL_MAX = 320;
/** En dessous, la traînée cesse d'être perceptible : l'étoile « apparaît » au lieu d'arriver. */
export const BIRTH_WALL_MIN = 90;
/** Le budget de particules du bandeau : combien d'étoiles peuvent voyager en même temps. */
export const IN_FLIGHT_BUDGET = 32;

export interface HeaderClock {
  /** Instant de naissance de chaque nœud, en ms de MUR (et non de rang). */
  bornAtWall: Map<string, number>;
  /** Durée du trajet, resserrée quand les naissances se bousculent. */
  birthWall: number;
  /** Fin de la construction, trajet de la dernière étoile compris. */
  total: number;
}

/**
 * ⚠️ Le compte de nœuds est DÉRIVÉ du calendrier, jamais passé en paramètre : un compte fourni de
 * l'extérieur peut se désynchroniser du calendrier qu'il est censé décrire, et le budget de
 * particules deviendrait faux sans que rien ne le dise.
 */
/**
 * Combien d'étoiles sont en vol au pire instant, si le trajet dure `window`.
 *
 * ⚠️ On mesure le PIC, pas la moyenne. Un débit moyen sous-estime : `revealSchedule` fait naître
 * les ancêtres juste avant leur première notion (`ANCESTOR_LEAD`), donc les naissances arrivent
 * en grappes. Constaté à 34 étoiles en vol pour un budget de 32 — d'où ce calcul exact.
 */
function peakInFlight(sorted: readonly number[], window: number): number {
  let peak = 0;
  let first = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    while (sorted[first] <= sorted[i] - window) first += 1;
    peak = Math.max(peak, i - first + 1);
  }
  return peak;
}

export function headerClock(schedule: RevealSchedule): HeaderClock {
  const entries = [...schedule.at.entries()];
  const lastBorn = entries.reduce((max, [, born]) => Math.max(max, born), 0);

  // `min(1, …)` : on comprime, on n'étire pas. Le budget de temps réservé au trajet est retiré
  // d'abord, pour que la dernière étoile ait fini d'arriver À `HEADER_TOTAL`, pas après.
  const scale = lastBorn > 0 ? Math.min(1, (HEADER_TOTAL - BIRTH_WALL_MAX) / lastBorn) : 1;
  const lastBornWall = lastBorn * scale;

  const bornAtWall = new Map<string, number>();
  for (const [id, born] of entries) bornAtWall.set(id, born * scale);

  const birthWall = longestTrail([...bornAtWall.values()].sort((a, b) => a - b));
  return { bornAtWall, birthWall, total: lastBornWall + birthWall };
}

/**
 * La plus longue traînée qui tienne le budget de particules.
 *
 * ⚠️ `BIRTH_WALL_MIN` est un PLANCHER, et il gagne contre le budget : sous ce seuil l'étoile
 * n'arrive plus, elle apparaît — et la construction cesse de se lire. Sur une galaxie assez dense
 * pour l'atteindre, le pic dépassera donc le budget. C'est le bon arbitrage : ce qu'on protège
 * ici, c'est que la traînée reste perceptible, et l'addendum ADR-0024 §2 autorise les particules à
 * tomber, jamais les étoiles.
 */
function longestTrail(sorted: readonly number[]): number {
  if (sorted.length <= 1) return BIRTH_WALL_MAX;
  if (peakInFlight(sorted, BIRTH_WALL_MAX) <= IN_FLIGHT_BUDGET) return BIRTH_WALL_MAX;

  let keep = BIRTH_WALL_MIN;
  let tooLong = BIRTH_WALL_MAX;
  // 24 bissections : la précision descend sous le dixième de milliseconde, largement au-delà de
  // ce qu'une image de 16 ms peut distinguer.
  for (let step = 0; step < 24; step += 1) {
    const mid = (keep + tooLong) / 2;
    if (peakInFlight(sorted, mid) <= IN_FLIGHT_BUDGET) keep = mid;
    else tooLong = mid;
  }
  return keep;
}
