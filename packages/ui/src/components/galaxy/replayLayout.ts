/**
 * La construction de la galaxie depuis `root` (addendum ADR-0029, §2 réécrit le 2026-07-31).
 *
 * Deux choses, toutes deux PURES et déterministes :
 *   1. **où** va chaque nœud — un arbre radial calculé, jamais cherché ;
 *   2. **quand** il naît — une horloge de RANG, pas un calendrier.
 *
 * Pourquoi calculé et non convergé : `three-forcegraph` réchauffe la simulation à `alpha(1)` à
 * CHAQUE changement de `graphData` (`stop().alpha(1)`, « re-heat the simulation » dit son propre
 * commentaire). Une croissance nœud par nœud sur simulation vivante ré-explose donc à chaque
 * étoile, et la lib n'expose aucun moyen de l'en empêcher : `d3ReheatSimulation()` ne prend pas
 * d'argument et vaut `alpha(1)`, `d3AlphaTarget` n'est relayé nulle part. Vérifié ligne à ligne.
 *
 * Déterministe, et c'est une exigence produit avant d'être technique : la galaxie de Massimo doit
 * se construire de la même façon à chaque visite, sinon ce n'est pas la sienne.
 */

/** Une notion à la fois. Le temps réel n'est PAS à l'échelle — c'est un rang, pas une date. */
export const STAR_CADENCE = 120;
/** Matière puis chapitre naissent juste avant leur première notion. */
export const ANCESTOR_LEAD = 60;
/** Trajet d'un nœud, de son parent jusqu'à sa place. */
export const BIRTH = 480;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Angle d'or : réparti les enfants sans jamais les aligner, quel que soit leur nombre. */
const GOLDEN_ANGLE = 2.399963229728653;

/** Rayon de l'anneau d'un niveau. Décroissant : on s'éloigne du centre par paliers de plus en
 *  plus serrés, sinon les notions partent à l'infini. */
const LEVEL_RADIUS = [0, 170, 90, 52];

/**
 * Arbre radial déterministe pour le graphe complet.
 *
 * Chaque nœud est posé autour de son parent, à un rayon qui dépend de sa profondeur et à un
 * angle dérivé de son RANG parmi ses frères — donc stable d'une visite à l'autre. L'excursion
 * verticale reste faible : on lit un volume, pas un nuage.
 */
export function radialTreeLayout(
  nodeIds: string[],
  edges: { source: string; target: string }[],
  rootId = "root",
): Map<string, Vec3> {
  const children = new Map<string, string[]>();
  const parent = new Map<string, string>();
  const present = new Set(nodeIds);

  for (const edge of edges) {
    if (!present.has(edge.source) || !present.has(edge.target)) continue;
    if (parent.has(edge.target)) continue; // un arbre : le premier parent gagne
    parent.set(edge.target, edge.source);
    const siblings = children.get(edge.source);
    if (siblings) siblings.push(edge.target);
    else children.set(edge.source, [edge.target]);
  }

  const at = new Map<string, Vec3>();
  const walk = (id: string, depth: number, origin: Vec3, inherited: number) => {
    at.set(id, origin);
    const kids = children.get(id) ?? [];
    const radius = LEVEL_RADIUS[Math.min(depth + 1, LEVEL_RADIUS.length - 1)];
    kids.forEach((kid, index) => {
      // L'angle hérite de celui du parent : une branche reste groupée dans son secteur au lieu
      // de se disperser sur tout le tour, et l'arbre se lit comme un arbre.
      const angle = inherited + index * GOLDEN_ANGLE;
      walk(
        kid,
        depth + 1,
        {
          x: origin.x + Math.cos(angle) * radius,
          y: origin.y + Math.sin(index * 1.7) * radius * 0.28,
          z: origin.z + Math.sin(angle) * radius,
        },
        angle * 0.5,
      );
    });
  };

  if (present.has(rootId)) walk(rootId, 0, { x: 0, y: 0, z: 0 }, 0);
  // Les orphelins (aucun chemin jusqu'à la racine) ne disparaissent pas : ils se rangent sur un
  // anneau extérieur. Perdre un nœud serait perdre une notion de Massimo.
  let orphan = 0;
  for (const id of nodeIds) {
    if (at.has(id)) continue;
    const angle = orphan * GOLDEN_ANGLE;
    const radius = LEVEL_RADIUS[1] * 2;
    at.set(id, { x: Math.cos(angle) * radius, y: 0, z: Math.sin(angle) * radius });
    orphan += 1;
  }
  return at;
}

export interface RevealSchedule {
  /** Instant de naissance de chaque nœud, en ms depuis le début du rejeu. */
  at: Map<string, number>;
  /** Durée totale, trajet de la dernière étoile compris. */
  total: number;
}

/**
 * L'horloge de RANG : une notion toutes les `STAR_CADENCE`, dans l'ordre de `first_lit`.
 *
 * ⚠️ Choix doctrinal avant d'être technique. Une horloge calendaire traverserait les vacances en
 * ne montrant rien — ce qui EST l'annonce d'une période vide, interdite par le §4. Le rang ne
 * peut pas le faire : il n'a pas de trou.
 *
 * Les ancêtres n'ont pas de date propre et n'en auront jamais : leur naissance est DÉRIVÉE ici,
 * `ANCESTOR_LEAD` avant leur première notion descendante. Aucun appel réseau de plus.
 */
export function revealSchedule(
  orderedSkillIds: string[],
  parentOf: Map<string, string>,
  rootId = "root",
): RevealSchedule {
  const at = new Map<string, number>([[rootId, 0]]);

  orderedSkillIds.forEach((skillId, rank) => {
    const born = rank * STAR_CADENCE;
    at.set(skillId, born);
    // On remonte la chaîne des parents. Le PREMIER descendant gagne : une matière naît avec sa
    // première notion, pas avec la dernière.
    let current = parentOf.get(skillId);
    let height = 1;
    while (current && current !== rootId) {
      if (at.has(current)) break;
      at.set(current, Math.max(0, born - height * ANCESTOR_LEAD));
      current = parentOf.get(current);
      height += 1;
    }
  });

  const last = orderedSkillIds.length === 0 ? 0 : (orderedSkillIds.length - 1) * STAR_CADENCE;
  return { at, total: last + BIRTH };
}

/** Les nœuds nés à l'instant `elapsed`. */
export function bornAt(schedule: RevealSchedule, elapsed: number): Set<string> {
  const visible = new Set<string>();
  for (const [id, born] of schedule.at) {
    if (born <= elapsed) visible.add(id);
  }
  return visible;
}

/** Combien d'étoiles sont allumées — un COMPTE, jamais un pourcentage (ADR-0024 §5). */
export function litCountAt(orderedSkillIds: string[], elapsed: number): number {
  if (orderedSkillIds.length === 0) return 0;
  return Math.max(
    0,
    Math.min(orderedSkillIds.length, Math.floor(elapsed / STAR_CADENCE) + 1),
  );
}
