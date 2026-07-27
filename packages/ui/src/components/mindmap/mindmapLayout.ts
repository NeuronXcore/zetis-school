// Moteur de layout des mindmaps (ADR-0016) — le placement des nœuds est de la PRÉSENTATION, donc
// 100 % client. Le backend produit un `mindmap_json` SANS positions ; elk calcule les coordonnées.
// Une seule lib (elkjs) couvre radial / horizontal / vertical ; « équilibrée » = glue maison
// (miroir d'une moitié des branches autour du centre) au-dessus d'un layout horizontal.
//
// Layout ASYNCHRONE (`await elk.layout`) : l'appelant gère l'état de chargement.
import ELK from "elkjs/lib/elk.bundled.js";
import { type MindmapJson } from "@zetis/types";
import { childrenOf, rootsOf, type LayoutKind } from "./mindmapTree";

export const CENTER_ID = "__center__";

export interface NodeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LayoutResult = Record<string, NodeBox>; // clés = ids de nœuds + CENTER_ID

const elk = new ELK();

// Estimation de la taille d'un nœud (elk en a besoin pour l'espacement). Le rendu réel est fait par
// React Flow ; ces tailles n'ont qu'à être cohérentes avec le style des nœuds.
function boxFor(label: string, isCenter: boolean): { width: number; height: number } {
  const len = label.length;
  if (isCenter) return { width: Math.min(230, Math.max(120, len * 9 + 40)), height: 56 };
  return { width: Math.min(200, Math.max(72, len * 7.5 + 26)), height: 44 };
}

function elkOptions(kind: LayoutKind): Record<string, string> {
  if (kind === "radial") {
    return {
      "elk.algorithm": "org.eclipse.elk.radial",
      "elk.radial.radius": "160",
      "elk.spacing.nodeNode": "40",
    };
  }
  // h | v | bal : layered (Sugiyama). « bal » part d'un horizontal puis on miroir une moitié.
  const direction = kind === "v" ? "DOWN" : "RIGHT";
  return {
    "elk.algorithm": "org.eclipse.elk.layered",
    "elk.direction": direction,
    "elk.layered.spacing.nodeNodeBetweenLayers": "70",
    "elk.spacing.nodeNode": "26",
    "elk.edgeRouting": "ORTHOGONAL",
  };
}

/** Construit le graphe elk : centre + nœuds, arêtes centre→racines et parent→enfant. */
function toElk(mm: MindmapJson, kind: LayoutKind) {
  const centerBox = boxFor(mm.center, true);
  const children = [
    { id: CENTER_ID, ...centerBox },
    ...mm.nodes.map((n) => ({ id: n.id, ...boxFor(n.label, false) })),
  ];
  const edges = [
    ...rootsOf(mm).map((r) => ({ id: `e_c_${r.id}`, sources: [CENTER_ID], targets: [r.id] })),
    ...mm.nodes
      .filter((n) => n.parent !== null)
      .map((n) => ({ id: `e_${n.parent}_${n.id}`, sources: [n.parent as string], targets: [n.id] })),
  ];
  return {
    id: "root",
    layoutOptions: elkOptions(kind),
    children,
    edges,
  };
}

function normalize(result: LayoutResult): LayoutResult {
  const boxes = Object.values(result);
  if (boxes.length === 0) return result;
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const out: LayoutResult = {};
  for (const [id, b] of Object.entries(result)) {
    out[id] = { ...b, x: b.x - minX + 20, y: b.y - minY + 20 };
  }
  return out;
}

/** Miroir « équilibrée » : réfléchit les sous-arbres d'une moitié des racines autour du centre. */
function mirrorHalf(mm: MindmapJson, laid: LayoutResult): LayoutResult {
  const center = laid[CENTER_ID];
  if (!center) return laid;
  const cx = center.x + center.width / 2;
  const roots = rootsOf(mm);
  const leftRoots = roots.filter((_, i) => i % 2 === 1); // une racine sur deux part à gauche
  const toMirror = new Set<string>();
  const collect = (id: string) => {
    toMirror.add(id);
    for (const kid of childrenOf(mm, id)) collect(kid.id);
  };
  leftRoots.forEach((r) => collect(r.id));

  const out: LayoutResult = {};
  for (const [id, b] of Object.entries(laid)) {
    if (toMirror.has(id)) {
      out[id] = { ...b, x: 2 * cx - (b.x + b.width) }; // miroir de la boîte autour de cx
    } else {
      out[id] = b;
    }
  }
  return out;
}

/**
 * Calcule les positions des nœuds pour une présentation donnée (asynchrone). Retourne une boîte
 * par nœud + le centre (`CENTER_ID`). L'appelant passe le résultat à `toReactFlow`.
 */
export async function computeLayout(mm: MindmapJson, kind: LayoutKind): Promise<LayoutResult> {
  // « bal » se calcule sur un layout horizontal, puis on miroir une moitié des branches.
  const elkKind: LayoutKind = kind === "bal" ? "h" : kind;
  const graph = toElk(mm, elkKind);
  const laid = await elk.layout(graph);
  const result: LayoutResult = {};
  for (const child of laid.children ?? []) {
    result[child.id] = {
      x: child.x ?? 0,
      y: child.y ?? 0,
      width: child.width ?? 100,
      height: child.height ?? 44,
    };
  }
  return normalize(kind === "bal" ? mirrorHalf(mm, result) : result);
}
