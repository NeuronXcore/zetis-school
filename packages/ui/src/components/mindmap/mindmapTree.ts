// Helpers PURS sur l'arbre d'une mindmap (ADR-0016) — aucune dépendance React/elk/DOM, donc
// entièrement testables. L'arbre est strict : chaque nœud a un `parent` (null = racine, accrochée
// au centre). Ces helpers pilotent le layout (profondeur/feuilles), les modes (masquage) et la
// construction du payload de reconstruction envoyé au serveur.
//
// RAPPEL frontière (ADR-0016) : ici, ZÉRO score. La justesse d'une reconstruction est calculée
// par le serveur (déterministe). On ne fait que préparer les `placements` à lui envoyer.
import { type MindmapJson, type MindmapNode, type MindmapNodePlacement } from "@zetis/types";

export type LayoutKind = "radial" | "h" | "v" | "bal";

/** Enfants directs d'un nœud (ou racines si `parentId === null`). */
export function childrenOf(mm: MindmapJson, parentId: string | null): MindmapNode[] {
  return mm.nodes.filter((n) => n.parent === parentId);
}

/** Racines de l'arbre (branches de premier niveau, accrochées au centre). */
export function rootsOf(mm: MindmapJson): MindmapNode[] {
  return childrenOf(mm, null);
}

/** Un nœud est une feuille s'il n'a aucun enfant. */
export function isLeaf(mm: MindmapJson, nodeId: string): boolean {
  return !mm.nodes.some((n) => n.parent === nodeId);
}

/** Parent d'un nœud (`null` si racine ou nœud inconnu). */
export function parentOf(mm: MindmapJson, nodeId: string): string | null {
  return mm.nodes.find((n) => n.id === nodeId)?.parent ?? null;
}

/** Profondeur maximale de l'arbre (racine = niveau 1). Robuste à un arbre vide. */
export function maxDepth(mm: MindmapJson): number {
  const byParent = new Map<string | null, MindmapNode[]>();
  for (const n of mm.nodes) {
    const list = byParent.get(n.parent) ?? [];
    list.push(n);
    byParent.set(n.parent, list);
  }
  const depthFrom = (id: string, guard: number): number => {
    if (guard <= 0) return 1; // garde anti-cycle (le backend garantit déjà l'acyclicité)
    const kids = byParent.get(id) ?? [];
    if (kids.length === 0) return 1;
    return 1 + Math.max(...kids.map((k) => depthFrom(k.id, guard - 1)));
  };
  const roots = byParent.get(null) ?? [];
  if (roots.length === 0) return 0;
  return 1 + Math.max(...roots.map((r) => depthFrom(r.id, mm.nodes.length)));
}

/** Nombre de feuilles (nœuds sans enfant). */
export function leafCount(mm: MindmapJson): number {
  return mm.nodes.filter((n) => isLeaf(mm, n.id)).length;
}

/**
 * Présélection de présentation (ADR-0016 §4), déterministe et **surchargeable** : `radial` si la
 * carte est petite et peu profonde (`depth ≤ 2 && leaves ≤ 8`), sinon `h` (horizontal : empreinte
 * minimale, libellés FR lisibles).
 */
export function defaultLayout(mm: MindmapJson): LayoutKind {
  return maxDepth(mm) <= 2 && leafCount(mm) <= 8 ? "radial" : "h";
}

/**
 * Ensemble des nœuds à recouvrir/reconstruire, aligné sur le barème SERVEUR : `required_nodes`
 * s'ils sont fournis, sinon tous les nœuds non-racine (les branches de premier niveau restent
 * visibles comme ancrage). Sert au masquage (M'entraîner) et aux emplacements (Reconstruire).
 */
export function hiddenNodeIds(mm: MindmapJson): string[] {
  const required = (mm.required_nodes ?? []).filter((id) => mm.nodes.some((n) => n.id === id));
  if (required.length > 0) return required;
  return mm.nodes.filter((n) => n.parent !== null).map((n) => n.id);
}

/**
 * Construit le payload de reconstruction pour le serveur à partir des emplacements remplis.
 * `assignment` = pour chaque nœud-emplacement (id de référence), l'id du nœud dont l'étiquette a été
 * déposée. On envoie `{ node_id: étiquette, parent_id: parent de l'emplacement }` : le serveur
 * vérifie la structure (nœud sous le bon parent). PAS de score ici.
 */
export function placementsPayload(
  mm: MindmapJson,
  assignment: Record<string, string>,
): MindmapNodePlacement[] {
  return Object.entries(assignment).map(([slotId, labelNodeId]) => ({
    node_id: labelNodeId,
    parent_id: parentOf(mm, slotId),
  }));
}

/**
 * Découpe l'arbre en NIVEAUX (passes) : niveau 1 = les racines (branches principales), niveau 2 =
 * leurs enfants, etc. — le centre est exclu. Sert au mode « Mémorise » : une passe par niveau
 * couvre toute la hiérarchie des nœuds. Retourne `[[ids niveau 1], [ids niveau 2], …]`.
 */
export function nodeLevels(mm: MindmapJson): string[][] {
  const levels: string[][] = [];
  let current = rootsOf(mm).map((n) => n.id);
  let guard = 0;
  while (current.length && guard++ <= mm.nodes.length) {
    levels.push(current);
    const next: string[] = [];
    for (const id of current) for (const c of childrenOf(mm, id)) next.push(c.id);
    current = next;
  }
  return levels;
}

/**
 * Partition ALÉATOIRE des ids en passes de reconstruction : chaque passe blanchit un petit
 * sous-ensemble (le reste de la carte reste visible comme contexte) — on ne reconstruit jamais toute
 * la carte d'un coup. Le nombre de passes s'adapte au nombre de nœuds (`ceil(n / perPass)`), tailles
 * réparties équitablement (round-robin). `rng` injectable pour les tests.
 */
export function randomPasses(ids: string[], perPass = 3, rng: () => number = Math.random): string[][] {
  const shuffled = shuffle(ids, rng);
  const count = Math.max(1, Math.ceil(shuffled.length / perPass));
  const passes: string[][] = Array.from({ length: count }, () => []);
  shuffled.forEach((id, i) => passes[i % count].push(id));
  return passes;
}

/** Mélange (Fisher-Yates) une copie du tableau. Utilise `rng` injectable pour la testabilité. */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
