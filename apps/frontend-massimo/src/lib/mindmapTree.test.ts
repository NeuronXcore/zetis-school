import { describe, expect, it } from "vitest";
import { type MindmapJson } from "@zetis/types";
import {
  childrenOf,
  defaultLayout,
  hiddenNodeIds,
  leafCount,
  maxDepth,
  nodeLevels,
  parentOf,
  placementsPayload,
  randomPasses,
  rootsOf,
  shuffle,
} from "@zetis/ui/mindmap";

// Carte de test (arbre strict) : 2 racines, profondeur 3 (droite → comparer → exemple).
const MM: MindmapJson = {
  center: "Les nombres relatifs",
  nodes: [
    { id: "signe", label: "Signe", parent: null },
    { id: "droite", label: "Droite", parent: null },
    { id: "oppose", label: "Opposé", parent: "signe" },
    { id: "comparer", label: "Comparer", parent: "droite" },
    { id: "exemple", label: "-3 < 2", parent: "comparer" },
  ],
  required_nodes: ["signe", "droite", "oppose", "comparer"],
  optional_nodes: ["exemple"],
};

describe("mindmapTree", () => {
  it("résout enfants et racines", () => {
    expect(rootsOf(MM).map((n) => n.id)).toEqual(["signe", "droite"]);
    expect(childrenOf(MM, "signe").map((n) => n.id)).toEqual(["oppose"]);
    expect(parentOf(MM, "exemple")).toBe("comparer");
    expect(parentOf(MM, "signe")).toBeNull();
  });

  it("calcule profondeur et nombre de feuilles", () => {
    // Profondeur ancrée au centre : centre(1) → droite(2) → comparer(3) → exemple(4).
    expect(maxDepth(MM)).toBe(4);
    expect(leafCount(MM)).toBe(2); // oppose, exemple
  });

  it("defaultLayout : radial si petit et peu profond, sinon horizontal", () => {
    const small: MindmapJson = {
      center: "X",
      nodes: [
        { id: "a", label: "A", parent: null },
        { id: "b", label: "B", parent: null },
      ],
    };
    expect(defaultLayout(small)).toBe("radial"); // depth 1, 2 feuilles
    expect(defaultLayout(MM)).toBe("h"); // depth 3 → horizontal
  });

  it("nodeLevels : une passe par niveau (racines, puis enfants…) couvre tous les nœuds", () => {
    const levels = nodeLevels(MM);
    expect(levels).toEqual([
      ["signe", "droite"], // niveau 1 : racines
      ["oppose", "comparer"], // niveau 2 : leurs enfants
      ["exemple"], // niveau 3
    ]);
    // toute la hiérarchie est couverte (centre exclu)
    expect(levels.flat().sort()).toEqual(MM.nodes.map((n) => n.id).sort());
  });

  it("hiddenNodeIds : required si présents, sinon tous les non-racine", () => {
    expect(hiddenNodeIds(MM)).toEqual(["signe", "droite", "oppose", "comparer"]);
    const noReq: MindmapJson = { center: "X", nodes: MM.nodes };
    expect(hiddenNodeIds(noReq)).toEqual(["oppose", "comparer", "exemple"]);
  });

  it("placementsPayload : emplacement → {node_id étiquette, parent_id de l'emplacement}", () => {
    // L'élève place l'étiquette « oppose » dans l'emplacement « oppose » (parent = signe),
    // et se trompe : met « comparer » dans l'emplacement « oppose ».
    const good = placementsPayload(MM, { oppose: "oppose" });
    expect(good).toEqual([{ node_id: "oppose", parent_id: "signe" }]);
    const swapped = placementsPayload(MM, { oppose: "comparer" });
    expect(swapped).toEqual([{ node_id: "comparer", parent_id: "signe" }]);
  });

  it("randomPasses : nb de passes = ceil(n/perPass), couvre tous les ids, tailles équilibrées", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const passes = randomPasses(ids, 3, () => 0); // rng déterministe
    expect(passes.length).toBe(3); // ceil(8/3)
    expect(passes.flat().sort()).toEqual([...ids].sort()); // tous couverts, une seule fois
    expect(passes.map((p) => p.length)).toEqual([3, 3, 2]); // round-robin équilibré
    // petite carte : au moins une passe
    expect(randomPasses(["x"], 3, () => 0).length).toBe(1);
  });

  it("shuffle : préserve le multiset, déterministe avec un rng injecté", () => {
    const rng = () => 0; // Fisher-Yates avec rng=0 → rotation déterministe
    const a = shuffle(["x", "y", "z"], rng);
    expect([...a].sort()).toEqual(["x", "y", "z"]);
    expect(shuffle(["x", "y", "z"], rng)).toEqual(a); // reproductible
  });
});
