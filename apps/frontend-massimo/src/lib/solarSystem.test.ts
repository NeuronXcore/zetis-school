import { describe, expect, it } from "vitest";
import type { GalaxyFullGraph } from "@zetis/types";
import { solarSystemOf } from "./solarSystem";

// La vue par défaut de `/galaxy` rend la galaxie ENTIÈRE depuis le 2026-07-31 au soir.
//
// ⚠️ Ce fichier testait l'INVERSE quelques heures plus tôt : « ne rend que root + subject »,
// non-régression du §C. Ces cas sont SUPPRIMÉS, pas assouplis — le filtre est révoqué, et un
// test qui décrit un comportement disparu ne protège rien, il induit en erreur.
//
// Ce qui reste vrai et testé : aucune notion ne se perd, et une matière encore vide a quand
// même sa planète.

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

describe("la vue par défaut rend TOUT le graphe", () => {
  it("les chapitres et les notions ne sont plus retirés", () => {
    const solar = solarSystemOf(GRAPH, [])!;
    expect(solar.nodes.map((n) => n.id)).toEqual([
      "root",
      "subject-1",
      "chapter-3",
      "skill-7",
      "skill-8",
    ]);
  });

  it("les liens qui les portent restent, eux aussi", () => {
    const solar = solarSystemOf(GRAPH, [])!;
    expect(solar.edges).toHaveLength(4);
    expect(solar.edges).toContainEqual({
      source: "chapter-3",
      target: "skill-7",
      type: "structure",
    });
  });

  it("une notion PAS ENCORE travaillée est rendue comme les autres", () => {
    // `skill-8` est en `unknown`. Une étoile pas encore née se montre : c'est la carte du
    // programme, pas le tableau des acquis.
    const solar = solarSystemOf(GRAPH, [])!;
    expect(solar.nodes.some((n) => n.id === "skill-8")).toBe(true);
  });

  it("le graphe n'est pas muté au passage", () => {
    // La fonction copie : `GRAPH` est partagé entre les tests, et une matière ajoutée par
    // effet de bord se retrouverait dans le suivant.
    const before = GRAPH.nodes.length;
    solarSystemOf(GRAPH, [{ subject_id: 42, name: "Latin", slug: "latin" }]);
    expect(GRAPH.nodes).toHaveLength(before);
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
    expect(solar.nodes.some((n) => n.id === "subject-9")).toBe(true);
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
