/**
 * La charge utile de la VUE PAR DÉFAUT de `/galaxy` — le système solaire.
 *
 * Le cerveau au centre, les matières en orbite, RIEN D'AUTRE. Décidé au vu du rendu réel le
 * 2026-07-31 (addendum ADR-0024 §C) : le graphe complet posé par simulation de forces
 * produisait un amas où le cœur était à moitié enseveli et les libellés se chevauchaient.
 *
 * ⚠️ CE FILTRE N'EST PAS LE PLAFOND DE NŒUDS. Le plafond (`GALAXY_MAX_NODES`) a été supprimé
 * le même jour — il cachait la progression de Massimo selon la taille de son écran. Celui-ci
 * reste : c'est une décision de COMPOSITION prise sur rendu réel, pas une supposition de
 * perf. Les deux ont été confondus une fois ; l'addendum « Galaxie animée » §1 le dit en
 * toutes lettres. Ne pas « finir le ménage » en le supprimant aussi.
 *
 * Les notions ne disparaissent pas : elles restent atteignables en ENTRANT dans une
 * constellation. Elles cessent seulement d'être servies toutes en même temps.
 *
 * Extrait de `GalaxyPage` le 2026-07-31 pour être testable hors du canvas — l'invariant
 * « root + subject uniquement » est le genre de chose qu'un refactor bien intentionné casse.
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

  const keep = new Set(
    fullGraph.nodes.filter((n) => n.kind === "root" || n.kind === "subject").map((n) => n.id),
  );
  const nodes = fullGraph.nodes.filter((n) => keep.has(n.id));
  const edges = fullGraph.edges.filter((e) => keep.has(e.source) && keep.has(e.target));

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
