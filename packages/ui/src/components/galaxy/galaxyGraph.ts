/**
 * Logique de lecture du graphe — fonctions PURES, hors du composant de rendu.
 *
 * Le canvas reste bête (contrat repris de `MindmapWorkspace`) : c'est ici qu'on décide ce
 * qui est allumé et ce qui se compte, et c'est ici que ça se teste.
 */
import type { GalaxyEdge, GalaxyNode, GalaxyStatus } from "@zetis/types";
import { STATUS_ORDER } from "./galaxyTheme";

export const linkKey = (source: string, target: string): string => `${source}->${target}`;

/** Une étoile est « allumée » dès qu'elle n'est plus à découvrir. */
export function isLit(status: GalaxyStatus | null | undefined): boolean {
  return Boolean(status) && status !== "unknown";
}

/**
 * Les liens que parcourt le flux doré.
 *
 * L'or n'est pas un décor : il montre ce que Massimo a réellement travaillé (ADR-0024).
 * D'où deux règles, dont la seconde est **indispensable** pour que l'or forme un chemin
 * CONTINU depuis le cœur de la matière :
 *
 * 1. `chapter → skill` est allumé si l'étoile est allumée ;
 * 2. `subject → chapter` est allumé si l'amas contient au moins une étoile allumée.
 *
 * Sans la règle 2, des segments dorés flotteraient, détachés du cœur.
 */
export function litLinkIds(nodes: GalaxyNode[], edges: GalaxyEdge[]): Set<string> {
  const statusById = new Map(nodes.map((n) => [n.id, n.status]));
  const lit = new Set<string>();
  // Nœuds depuis lesquels l'or remonte. On part des porteurs d'étoiles allumées.
  const litParents = new Set<string>();

  for (const edge of edges) {
    if (isLit(statusById.get(edge.target))) {
      lit.add(linkKey(edge.source, edge.target));
      litParents.add(edge.source);
    }
  }

  // Remontée TRANSITIVE jusqu'au sommet, quelle que soit la profondeur.
  // ⚠️ Un seul passage suffit dans une constellation (chapitre → matière) mais PAS dans le
  // graphe global, qui a un niveau de plus (chapitre → matière → cerveau) : l'or s'arrêtait
  // aux matières et les liens du cœur restaient éteints (bug constaté).
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      if (!litParents.has(edge.target)) continue;
      const key = linkKey(edge.source, edge.target);
      if (!lit.has(key)) {
        lit.add(key);
        changed = true;
      }
      if (!litParents.has(edge.source)) {
        litParents.add(edge.source);
        changed = true;
      }
    }
  }
  return lit;
}

/** Compte d'étoiles par état — un COMPTE, jamais un pourcentage (ADR-0024 §5). */
export function statusCounts(nodes: GalaxyNode[]): Record<GalaxyStatus, number> {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<
    GalaxyStatus,
    number
  >;
  for (const node of nodes) {
    if (node.kind !== "skill") continue;
    const status = (node.status ?? "unknown") as GalaxyStatus;
    if (status in counts) counts[status] += 1;
  }
  return counts;
}

/**
 * Normalisation pour la recherche : minuscules, sans accents.
 *
 * Massimo tape « elyse », pas « Élysée », et rarement avec la bonne casse. Comparer les
 * chaînes brutes ferait échouer la recherche sur une bonne part du programme.
 */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Étoiles dont le nom contient le mot cherché.
 *
 * Cherche UNIQUEMENT parmi les étoiles : un amas ou le cœur de la matière ne sont pas des
 * destinations, les proposer serait une fausse piste. Une requête vide ne trouve rien —
 * « rien de cherché » n'est pas « tout trouvé ».
 */
export function searchMatches(nodes: GalaxyNode[], query: string): Set<string> {
  const needle = normalizeSearch(query);
  if (!needle) return new Set();
  const found = new Set<string>();
  for (const node of nodes) {
    if (node.kind !== "skill") continue;
    if (normalizeSearch(node.label).includes(needle)) found.add(node.id);
  }
  return found;
}

// ── La garde de perf : les PARTICULES, jamais les nœuds ──────────────────────────────
//
// Remplace le plafond de nœuds supprimé le 2026-07-31 (addendum ADR-0024 §2), et vise le
// vrai coût : `linkDirectionalParticles` anime un objet PAR LIEN À CHAQUE FRAME, là où une
// sphère posée ne coûte plus rien une fois la scène stabilisée. Doubler les étoiles ne
// double pas le travail par image ; doubler les particules, si.
//
// ⚠️ Ce budget ne doit JAMAIS servir à masquer des étoiles. S'il faut dégrader, on dégrade
// le décor (l'or qui coule), pas la progression de Massimo.

/** Particules simultanées tolérées sur toute la scène, toutes fibres confondues. */
export const PARTICLE_BUDGET = 160;

/** Au-delà, un lien ne gagne rien à être plus chargé : on ne lit plus un flux, mais un trait. */
export const MAX_PARTICLES_PER_LINK = 2;

/** Sous ce framerate, le flux doré s'éteint. Au-dessous, l'animation nuit plus qu'elle ne dit. */
export const PARTICLE_FPS_FLOOR = 34;

/**
 * Particules autorisées SUR CHAQUE lien allumé, une fois le budget réparti.
 *
 * Calculé une fois par graphe, pas par lien : c'est une propriété de la scène entière.
 * Une galaxie très fournie retombe naturellement à 1 particule par fil, puis à 0 — le flux
 * s'amincit avant de disparaître, et les étoiles ne bougent pas.
 */
export function particleAllowance(
  litLinkCount: number,
  { reducedMotion = false, degraded = false } = {},
): number {
  if (reducedMotion || degraded || litLinkCount <= 0) return 0;
  return Math.min(MAX_PARTICLES_PER_LINK, Math.floor(PARTICLE_BUDGET / litLinkCount));
}

/**
 * Nombre de particules sur un lien donné.
 *
 * `prefers-reduced-motion` coupe TOUT mouvement, allumé ou non : c'est une obligation de
 * l'ADR-0024 §6, pas un réglage de confort.
 */
export function particlesFor(
  lit: boolean,
  reducedMotion: boolean,
  allowance: number = MAX_PARTICLES_PER_LINK,
): number {
  if (reducedMotion) return 0;
  return lit ? allowance : 0;
}
