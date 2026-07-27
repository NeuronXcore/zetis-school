import { describe, expect, it } from "vitest";
import {
  addNotion,
  countNotions,
  type EditableGroup,
  findCrossGroupDuplicates,
  flattenNotions,
  removeNotion,
  setNotion,
} from "./skillsBackfill";

const GROUPS: EditableGroup[] = [
  { scaffold_chapter: "Nombres relatifs", notions: ["Relatifs", "Comparaison"] },
  { scaffold_chapter: "Fractions", notions: ["Addition de fractions"] },
];

describe("skillsBackfill — édition pure des notions", () => {
  it("removeNotion retire la bonne notion sans muter l'original", () => {
    const next = removeNotion(GROUPS, 0, 1);
    expect(next[0].notions).toEqual(["Relatifs"]);
    expect(GROUPS[0].notions).toEqual(["Relatifs", "Comparaison"]); // original intact
    expect(next[1]).toBe(GROUPS[1]); // groupe non touché conservé par référence
  });

  it("setNotion renomme uniquement la notion visée", () => {
    const next = setNotion(GROUPS, 0, 0, "Nombres relatifs");
    expect(next[0].notions).toEqual(["Nombres relatifs", "Comparaison"]);
    expect(GROUPS[0].notions[0]).toBe("Relatifs");
  });

  it("addNotion ajoute en fin de groupe (vide par défaut)", () => {
    expect(addNotion(GROUPS, 1)[1].notions).toEqual(["Addition de fractions", ""]);
    expect(addNotion(GROUPS, 1, "Fractions égales")[1].notions).toEqual([
      "Addition de fractions",
      "Fractions égales",
    ]);
  });

  it("countNotions ignore les notions vides ou blanches", () => {
    expect(countNotions(GROUPS)).toBe(3);
    expect(countNotions(addNotion(GROUPS, 0, "  "))).toBe(3); // le blanc ne compte pas
    expect(countNotions(addNotion(GROUPS, 0, "Droite graduée"))).toBe(4);
  });

  it("flattenNotions produit la charge utile { scaffold_chapter, name }, vides écartés", () => {
    const edited = addNotion(setNotion(GROUPS, 0, 1, "  "), 1, "Fractions égales");
    expect(flattenNotions(edited)).toEqual([
      { scaffold_chapter: "Nombres relatifs", name: "Relatifs" },
      // « Comparaison » remplacée par du blanc → écartée
      { scaffold_chapter: "Fractions", name: "Addition de fractions" },
      { scaffold_chapter: "Fractions", name: "Fractions égales" },
    ]);
  });

  it("flattenNotions normalise les espaces internes et de bord", () => {
    const groups: EditableGroup[] = [
      { scaffold_chapter: "S", notions: ["  Nombres   relatifs  "] },
    ];
    expect(flattenNotions(groups)).toEqual([
      { scaffold_chapter: "S", name: "Nombres relatifs" },
    ]);
  });
});

describe("findCrossGroupDuplicates — signalement non bloquant", () => {
  it("marque les deux occurrences avec le chapitre de l'autre groupe", () => {
    const groups: EditableGroup[] = [
      { scaffold_chapter: "Nombres relatifs", notions: ["Addition", "Comparaison"] },
      { scaffold_chapter: "Fractions", notions: ["Addition"] },
    ];
    const dups = findCrossGroupDuplicates(groups);
    expect(dups.get("0:0")).toEqual(["Fractions"]); // « Addition » du groupe 0
    expect(dups.get("1:0")).toEqual(["Nombres relatifs"]); // « Addition » du groupe 1
    expect(dups.has("0:1")).toBe(false); // « Comparaison » unique → non marquée
  });

  it("insensible à la casse et aux espaces", () => {
    const groups: EditableGroup[] = [
      { scaffold_chapter: "A", notions: ["Droite  graduée"] },
      { scaffold_chapter: "B", notions: ["droite graduée"] },
    ];
    const dups = findCrossGroupDuplicates(groups);
    expect(dups.get("0:0")).toEqual(["B"]);
    expect(dups.get("1:0")).toEqual(["A"]);
  });

  it("ne marque PAS un doublon interne à un même groupe (dédup serveur déjà faite)", () => {
    const groups: EditableGroup[] = [
      { scaffold_chapter: "A", notions: ["Relatifs", "Relatifs"] },
    ];
    expect(findCrossGroupDuplicates(groups).size).toBe(0);
  });

  it("ignore les notions vides et cumule plusieurs autres chapitres", () => {
    const groups: EditableGroup[] = [
      { scaffold_chapter: "A", notions: ["Ratio", "  "] },
      { scaffold_chapter: "B", notions: ["Ratio"] },
      { scaffold_chapter: "C", notions: ["ratio"] },
    ];
    const dups = findCrossGroupDuplicates(groups);
    expect(dups.get("0:0")).toEqual(["B", "C"]);
    expect(dups.has("0:1")).toBe(false); // notion vide ignorée
  });
});
