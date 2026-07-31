import { describe, expect, it } from "vitest";
import type { GalaxyFullGraph } from "@zetis/types";
import { solarSystemOf } from "./solarSystem";

// Non-régression du §C (addendum ADR-0024, 2026-07-31) : la vue par défaut de `/galaxy`
// rend le cerveau et les matières, RIEN D'AUTRE.
//
// Ce test existe parce que l'addendum « Galaxie animée » supprime le plafond de nœuds le
// même jour, et que les deux ont déjà été confondus une fois. Supprimer ce filtre en
// croyant « finir le ménage » ferait revenir l'amas corrigé au rendu réel.

const GRAPH: GalaxyFullGraph = {
  nodes: [
    { id: "root", kind: "root", label: "ZETIS" },
    { id: "subject-1", kind: "subject", label: "SVT", subject_slug: "svt" },
    { id: "chapter-3", kind: "chapter", label: "La cellule", chapter_id: 3 },
    { id: "skill-7", kind: "skill", label: "Mitose", skill_id: 7, status: "solid" },
    { id: "skill-8", kind: "skill", label: "Méiose", skill_id: 8, status: "unknown" },
  ],
  edges: [
    { source: "root", target: "subject-1", type: "structure" },
    { source: "subject-1", target: "chapter-3", type: "structure" },
    { source: "chapter-3", target: "skill-7", type: "structure" },
    { source: "chapter-3", target: "skill-8", type: "structure" },
  ],
} as GalaxyFullGraph;

describe("la vue par défaut ne rend que le cerveau et les matières", () => {
  it("aucun chapitre, aucune notion", () => {
    const solar = solarSystemOf(GRAPH, [])!;
    expect(solar.nodes.map((n) => n.id)).toEqual(["root", "subject-1"]);
    expect(solar.nodes.every((n) => n.kind === "root" || n.kind === "subject")).toBe(true);
  });

  it("les liens vers ce qui n'est plus rendu partent avec", () => {
    const solar = solarSystemOf(GRAPH, [])!;
    expect(solar.edges).toEqual([{ source: "root", target: "subject-1", type: "structure" }]);
  });

  it("une notion travaillée ne fait PAS revenir son chapitre", () => {
    // `skill-7` est en `solid` : le filtre ne doit pas faire d'exception pour les étoiles
    // allumées, sinon la vue se re-densifie à mesure que Massimo progresse.
    const solar = solarSystemOf(GRAPH, [])!;
    expect(solar.nodes.some((n) => n.id === "chapter-3")).toBe(false);
  });
});

describe("les matières encore vides ont quand même leur planète", () => {
  // Une matière absente se lirait comme une matière qui n'existe pas ; une planète éteinte
  // se lit comme « pas encore ».
  it("celles que le graphe n'a pas sont ajoutées", () => {
    const solar = solarSystemOf(GRAPH, [
      { subject_id: 1, name: "SVT", slug: "svt" },
      { subject_id: 9, name: "Anglais", slug: "anglais" },
    ])!;
    expect(solar.nodes.map((n) => n.id)).toEqual(["root", "subject-1", "subject-9"]);
    expect(solar.edges).toContainEqual({
      source: "root",
      target: "subject-9",
      type: "structure",
    });
  });

  it("une matière déjà présente n'est pas dédoublée", () => {
    const solar = solarSystemOf(GRAPH, [{ subject_id: 1, name: "SVT", slug: "svt" }])!;
    expect(solar.nodes.filter((n) => n.id === "subject-1")).toHaveLength(1);
  });
});

describe("états dégénérés", () => {
  it("sans graphe, il n'y a rien à composer", () => {
    expect(solarSystemOf(null, [])).toBeNull();
    expect(solarSystemOf(undefined, null)).toBeNull();
  });
});
