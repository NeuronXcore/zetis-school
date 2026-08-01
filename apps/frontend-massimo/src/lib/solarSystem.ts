/**
 * La charge utile de la VUE PAR DÉFAUT de `/galaxy` — la galaxie ENTIÈRE.
 *
 * Le cerveau, les matières, leurs chapitres et leurs notions : tout est rendu, posé en orbites
 * emboîtées par `constellationLayout`.
 *
 * ⚠️ Cette fonction FILTRAIT, jusqu'au 2026-07-31 au soir : elle ne gardait que `root` et
 * `subject` (§C, décidé au vu du rendu réel). Le filtre est **révoqué** — voir le corps de la
 * fonction pour le motif, qui tient en une phrase : la cause de l'amas était la CONVERGENCE,
 * et il n'y a plus de convergence.
 *
 * Ce qu'elle fait encore, et qui n'a jamais eu de rapport avec la perf : donner sa planète à
 * chaque matière, y compris celles que le graphe n'a pas parce qu'elles sont encore vides.
 */
import type { GalaxyEdge, GalaxyFullGraph, GalaxyNode } from "@zetis/types";

/** Ce dont on a besoin d'une matière du sommaire : de quoi lui faire une planète. */
export interface SubjectLike {
  subject_id: number;
  name: string;
  slug: string;
}

export interface SolarSystem {
  nodes: GalaxyNode[];
  edges: GalaxyEdge[];
}

export function solarSystemOf(
  fullGraph: GalaxyFullGraph | null | undefined,
  subjects: SubjectLike[] | null | undefined,
): SolarSystem | null {
  if (!fullGraph) return null;

  // ⚠️ IL N'Y A PLUS DE FILTRE ICI. Jusqu'au 2026-07-31 au soir, cette fonction ne gardait que
  // `root` et `subject` (§C). Ce filtre existait parce que servir tout le graphe à une
  // SIMULATION DE FORCES produisait un amas — le cœur à moitié enseveli, les libellés
  // superposés. La cause était la convergence, pas le nombre de nœuds.
  //
  // Depuis, les positions sont CALCULÉES et épinglées (`constellationLayout`), moteur
  // neutralisé : l'amas ne peut plus se produire, et le filtre perdait sa raison d'être. Il
  // reste à cette fonction son autre rôle, qui n'a jamais eu de rapport avec la perf : donner
  // sa planète à chaque matière, même vide.
  const keep = new Set(fullGraph.nodes.map((n) => n.id));
  const nodes = [...fullGraph.nodes];
  const edges = [...fullGraph.edges];

  // Les matières ENCORE VIDES ont aussi leur planète.
  //
  // `GET /api/student/galaxy/all` les exclut volontairement (« un soleil sans planète
  // n'apprend rien et encombre la vue ») — ce raisonnement valait pour un graphe dense. Dans
  // un système solaire il s'inverse : la carte de l'année doit montrer TOUTES les planètes,
  // y compris celles qui ne sont pas encore allumées. Une matière absente se lirait comme
  // une matière qui n'existe pas ; une planète éteinte se lit comme « pas encore ».
  for (const subject of subjects ?? []) {
    const id = `subject-${subject.subject_id}`;
    if (keep.has(id)) continue;
    keep.add(id);
    nodes.push({ id, kind: "subject", label: subject.name, subject_slug: subject.slug });
    edges.push({ source: "root", target: id, type: "structure" });
  }

  return { nodes, edges };
}
