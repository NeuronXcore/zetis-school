/**
 * La pose de la galaxie dans le bandeau — PURE, déterministe, aucune simulation.
 *
 * ⚠️ POURQUOI PAS `radialTreeLayout` (`@zetis/ui/galaxy`), qui fait déjà ce travail en 3D.
 *
 * Ses `LEVEL_RADIUS = [0, 170, 90, 52]` cumulent une étendue de ±312 px pour un bandeau de
 * ~1200 × 96 — un rapport de 12,5:1. Une échelle uniforme réduit la galaxie à un carré de 84 px,
 * c'est-à-dire exactement derrière l'emblème, donc invisible ; une échelle anisotrope écrase les
 * chapitres en traînées de 5 px et la structure disparaît. On garde de `replayLayout.ts` ce qui
 * porte la doctrine (l'horloge de rang) et on pose pour la forme réelle du support.
 *
 * ⚠️ LES POSITIONS SONT DANS LE PLAN DU DISQUE, PAS À L'ÉCRAN — réécrit le 2026-08-04 pour que la
 * galaxie puisse TOURNER.
 *
 * Chaque nœud porte `(u, v)`, ses coordonnées dans le plan de la galaxie, et `lift`, son épaisseur
 * hors plan. L'écran s'obtient en tournant `(u, v)` puis en écrasant `v` (`FLATTEN`) : on regarde
 * le disque presque par la tranche, ce qui EST la forme d'un bandeau.
 *
 * La version précédente posait directement des `x` d'écran, en alternant gauche/droite. Ça remplit
 * bien la bande — mais toutes les matières s'y retrouvent à l'angle 0 ou π, donc elles traversent
 * le centre EN MÊME TEMPS : à chaque demi-tour, la galaxie s'effondrait sur l'emblème. Réparti sur
 * tout le tour, l'ensemble garde sa silhouette pendant que chaque étoile parcourt son orbite.
 *
 * Déterministe, et c'est une exigence produit avant d'être technique : la galaxie de Massimo doit
 * se construire de la même façon à chaque visite, sinon ce n'est pas la sienne.
 */

/** Angle d'or : répartit les enfants sans jamais les aligner, quel que soit leur nombre. */
const GOLDEN_ANGLE = 2.399963229728653;

/** Écart entre le bord de l'emblème et la première matière. */
const FIRST_GAP = 26;

/**
 * Inclinaison : la part de la profondeur qui se voit en hauteur. On regarde presque par la tranche.
 *
 * ⚠️ La valeur est contrainte par le haut, et serrée. L'emblème est à 40 % de la hauteur, donc il
 * n'y a que ~38 px au-dessus du cœur dans une bande de 96 : à `0,085`, une étoile du bord
 * extérieur sortait de la bande dès le quart de tour. `0,035` laisse ~21 px d'excursion, ce qui
 * se voit nettement sans jamais déborder.
 */
export const FLATTEN = 0.035;

export interface BandPoint {
  /** Coordonnées DANS LE PLAN de la galaxie, relatives au cœur. Ce n'est pas de l'écran. */
  u: number;
  v: number;
  /** Épaisseur hors plan : le disque n'est pas une feuille. En pixels d'écran, non tournés. */
  lift: number;
  /** 0 = racine, 1 = matière, 2 = chapitre, 3+ = notion. Le rendu s'en sert pour la taille. */
  depth: number;
}

export interface BandOptions {
  width: number;
  height: number;
  /** Centre de l'emblème ZETIS — le cœur s'y pose, la galaxie SORT du logo. */
  centerX: number;
  centerY: number;
  /** Rayon de l'emblème, que les matières contournent au lieu de se cacher dessous. */
  coreRadius: number;
  padding: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** −1 = derrière le cœur, +1 = devant. Sert d'indice de profondeur au rendu. */
  depthCue: number;
}

/**
 * Projette un point du plan à l'écran, pour un angle de rotation donné.
 *
 * Une rotation dans le plan, puis un écrasement de la profondeur. `angle = 0` rend la pose telle
 * qu'elle a été calculée — c'est ce qui permet à la construction de se jouer sans rotation puis
 * d'enchaîner sans le moindre saut.
 */
export function projectBandPoint(
  point: BandPoint,
  angle: number,
  opts: Pick<BandOptions, "centerX" | "centerY">,
): ScreenPoint {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const along = point.u * cos - point.v * sin;
  const depth = point.u * sin + point.v * cos;
  return {
    x: opts.centerX + along,
    y: opts.centerY + point.lift + depth * FLATTEN,
    depthCue: depth,
  };
}

interface Plane {
  u: number;
  v: number;
  lift: number;
}

/**
 * Pose chaque nœud dans le plan de la galaxie.
 *
 * - **racine** au cœur ;
 * - **matières** réparties sur tout le tour (angle d'or), à des rayons croissants — elles occupent
 *   le disque au lieu de s'aligner, ce qui est la condition pour que la rotation tienne ;
 * - **chapitres** en amas autour de leur matière, dans le plan ;
 * - **notions** en amas plus serré autour de leur chapitre, rayon modulé en `√rang` pour ne pas
 *   dessiner un anneau parfait.
 *
 * Le rayon maximal est **borné par construction** (`maxRadius`), ce qui garantit que la galaxie
 * tient dans la bande à TOUS les angles — un clamp à l'écran, lui, déformerait la rotation.
 */
export function headerBandLayout(
  nodes: readonly { id: string; kind?: string }[],
  edges: readonly { source: string; target: string }[],
  opts: BandOptions,
): Map<string, BandPoint> {
  const at = new Map<string, BandPoint>();
  if (nodes.length === 0) return at;

  const ids = new Set(nodes.map((n) => n.id));
  const parent = new Map<string, string>();
  const children = new Map<string, string[]>();
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    if (parent.has(edge.target)) continue; // un arbre : le premier parent gagne
    parent.set(edge.target, edge.source);
    const siblings = children.get(edge.source);
    if (siblings) siblings.push(edge.target);
    else children.set(edge.source, [edge.target]);
  }

  const maxRadius = Math.max(0, opts.width / 2 - opts.padding);
  const chapterR = Math.max(12, maxRadius * 0.09);
  // ⚠️ On réserve la place des amas AVANT de répartir les matières, et il faut réserver la SOMME
  // de la série, pas seulement les deux premiers termes : chaque niveau ajoute `× 0,52` du
  // précédent, donc `chapterR × (1 + 0,52 + 0,52² + …)` ≈ `chapterR × 2,08`. Avec la réserve
  // tronquée à deux termes, une notion du bord sortait de la bande — constaté par le test.
  const clusterReach = chapterR * 2.1;
  const armSpan = Math.max(0, maxRadius - opts.coreRadius - FIRST_GAP - clusterReach);
  const liftUnit = opts.height * 0.05;

  const put = (id: string, plane: Plane, depth: number) => {
    at.set(id, { u: plane.u, v: plane.v, lift: plane.lift, depth });
  };

  const roots = nodes.filter((n) => n.kind === "root" && !parent.has(n.id)).map((n) => n.id);
  const trueRoot = roots.length > 0 ? roots[0] : null;

  const placeCluster = (parentId: string, depth: number, radius: number) => {
    const kids = children.get(parentId);
    const anchor = at.get(parentId);
    if (!kids || !anchor) return;
    // La phase dépend du parent : deux fratries voisines ne partent pas du même angle, sinon
    // leurs amas se calquent l'un sur l'autre.
    const phase = (parentId.length * GOLDEN_ANGLE) % (Math.PI * 2);
    kids.forEach((kid, index) => {
      const angle = phase + index * GOLDEN_ANGLE;
      // `√rang` : les premiers enfants serrés, les suivants plus au large — un amas, pas un anneau.
      const spread = 0.55 + 0.45 * Math.sqrt((index + 1) / kids.length);
      put(
        kid,
        {
          u: anchor.u + Math.cos(angle) * radius * spread,
          v: anchor.v + Math.sin(angle) * radius * spread,
          lift: anchor.lift + (index % 2 === 0 ? 1 : -1) * liftUnit * 0.35,
        },
        depth,
      );
      placeCluster(kid, depth + 1, radius * 0.52);
    });
  };

  const placeSubjects = (subjectIds: string[]) => {
    const count = Math.max(1, subjectIds.length);
    // ⚠️ Réparti sur TOUT LE TOUR, et non de part et d'autre. C'est ce qui empêche la galaxie de
    // s'effondrer sur l'emblème à chaque demi-tour de rotation.
    // ⚠️ ARBITRAGE MESURÉ, ET LES DEUX OBJECTIFS SE CONTREDISENT.
    //
    // J'ai d'abord attribué les grands rayons aux matières les plus ALIGNÉES avec la bande
    // (`|cos|` décroissant) : la largeur occupée à l'arrêt passait de 65 % à 90 %. Mais c'est
    // précisément ce qui remet la masse aux angles 0 et π — et la silhouette s'effondrait à
    // 52 % en tournant. Autrement dit, ça reconstruisait le défaut que cette réécriture existe
    // pour supprimer, sous une autre forme.
    //
    // Rayons attribués dans l'ordre, angles répartis uniformément : un peu moins de largeur à
    // l'instant zéro, une silhouette stable sur tout le tour. C'est la rotation qui décide, parce
    // que le bandeau passe sa vie à tourner et trois secondes à se construire.
    subjectIds.forEach((id, index) => {
      const angle = index * GOLDEN_ANGLE;
      const radius = opts.coreRadius + FIRST_GAP + ((index + 0.5) / count) * armSpan;
      put(
        id,
        {
          u: Math.cos(angle) * radius,
          v: Math.sin(angle) * radius,
          lift: (index % 2 === 0 ? 1 : -1) * liftUnit,
        },
        1,
      );
    });
    for (const id of subjectIds) placeCluster(id, 2, chapterR);
  };

  if (trueRoot) {
    put(trueRoot, { u: 0, v: 0, lift: 0 }, 0);
    placeSubjects(children.get(trueRoot) ?? []);
  } else {
    // Pas de racine : les nœuds sans parent DEVIENNENT les matières, et la galaxie s'organise
    // autour du cœur comme si de rien n'était.
    placeSubjects(nodes.filter((n) => !parent.has(n.id)).map((n) => n.id));
  }

  // ⚠️ Les orphelins (aucun chemin jusqu'à une racine) ne disparaissent PAS : ils prennent place
  // sur l'anneau extérieur. Perdre un nœud serait perdre une notion de Massimo — même doctrine
  // que `radialTreeLayout`, et l'addendum ADR-0024 §1 interdit tout plafond, déguisé ou non.
  const strays = nodes.filter((n) => !at.has(n.id));
  strays.forEach((node, index) => {
    const angle = index * GOLDEN_ANGLE;
    const radius = opts.coreRadius + FIRST_GAP + armSpan;
    put(
      node.id,
      { u: Math.cos(angle) * radius, v: Math.sin(angle) * radius, lift: 0 },
      3,
    );
  });

  return at;
}
