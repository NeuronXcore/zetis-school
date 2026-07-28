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
 * Nombre de particules sur un lien.
 *
 * `prefers-reduced-motion` coupe TOUT mouvement, allumé ou non : c'est une obligation de
 * l'ADR-0024 §6, pas un réglage de confort.
 */
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

export function particlesFor(lit: boolean, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  return lit ? 2 : 0;
}
