import { describe, expect, it } from "vitest";
import {
  ANCESTOR_LEAD,
  BIRTH,
  STAR_CADENCE,
  bornAt,
  litCountAt,
  radialTreeLayout,
  revealSchedule,
} from "@zetis/ui/galaxy";

// La construction de la galaxie depuis `root` (addendum ADR-0029 §2, réécrit le 2026-07-31).
//
// On teste ce qui est une RÈGLE : l'ordre, la dérivation des ancêtres, le déterminisme, et le
// fait qu'aucune notion ne se perde en route.

const EDGES = [
  { source: "root", target: "subject-1" },
  { source: "subject-1", target: "chapter-1" },
  { source: "chapter-1", target: "skill-1" },
  { source: "chapter-1", target: "skill-2" },
  { source: "root", target: "subject-2" },
  { source: "subject-2", target: "chapter-2" },
  { source: "chapter-2", target: "skill-3" },
];
const IDS = [
  "root",
  "subject-1",
  "chapter-1",
  "skill-1",
  "skill-2",
  "subject-2",
  "chapter-2",
  "skill-3",
];
const PARENT_OF = new Map(EDGES.map((e) => [e.target, e.source]));

describe("horloge de RANG — une notion à la fois", () => {
  it("les notions s'allument dans l'ordre reçu, à cadence fixe", () => {
    const { at } = revealSchedule(["skill-1", "skill-2", "skill-3"], PARENT_OF);
    expect(at.get("skill-1")).toBe(0);
    expect(at.get("skill-2")).toBe(STAR_CADENCE);
    expect(at.get("skill-3")).toBe(2 * STAR_CADENCE);
  });

  it("`root` existe dès le premier instant — c'est le point de départ", () => {
    const { at } = revealSchedule(["skill-1"], PARENT_OF);
    expect(at.get("root")).toBe(0);
  });

  it("le temps réel n'est PAS à l'échelle : deux notions à six mois d'écart se suivent", () => {
    // C'est le choix doctrinal du §1. Une horloge calendaire traverserait les vacances en ne
    // montrant rien — l'annonce d'une période vide, interdite par le §4.
    const { at } = revealSchedule(["skill-1", "skill-3"], PARENT_OF);
    expect(at.get("skill-3")! - at.get("skill-1")!).toBe(STAR_CADENCE);
  });

  it("la durée couvre le trajet de la dernière étoile", () => {
    const { total } = revealSchedule(["skill-1", "skill-2"], PARENT_OF);
    expect(total).toBe(STAR_CADENCE + BIRTH);
  });
});

describe("la naissance des ancêtres est DÉRIVÉE, pas servie", () => {
  it("une matière naît juste avant sa première notion", () => {
    const { at } = revealSchedule(["skill-1"], PARENT_OF);
    // chapitre à -1 cran, matière à -2 : « matière puis chapitre », dans cet ordre.
    expect(at.get("chapter-1")).toBe(Math.max(0, 0 - ANCESTOR_LEAD));
    expect(at.get("subject-1")).toBe(Math.max(0, 0 - 2 * ANCESTOR_LEAD));
    expect(at.get("subject-1")!).toBeLessThanOrEqual(at.get("chapter-1")!);
    expect(at.get("chapter-1")!).toBeLessThanOrEqual(at.get("skill-1")!);
  });

  it("c'est la PREMIÈRE notion descendante qui la fait naître, pas la dernière", () => {
    const { at } = revealSchedule(["skill-1", "skill-2"], PARENT_OF);
    // `skill-2` partage le chapitre de `skill-1` : le chapitre ne renaît pas plus tard.
    expect(at.get("chapter-1")).toBe(Math.max(0, 0 - ANCESTOR_LEAD));
  });

  it("une matière jamais travaillée ne naît pas du tout", () => {
    const { at } = revealSchedule(["skill-1"], PARENT_OF);
    expect(at.has("subject-2")).toBe(false);
    expect(at.has("skill-3")).toBe(false);
  });

  it("un ancêtre est toujours né avant son enfant, à tout instant", () => {
    const schedule = revealSchedule(["skill-1", "skill-2", "skill-3"], PARENT_OF);
    for (let t = 0; t <= schedule.total; t += 20) {
      const visible = bornAt(schedule, t);
      for (const id of visible) {
        const parent = PARENT_OF.get(id);
        if (parent) expect(visible.has(parent)).toBe(true);
      }
    }
  });
});

describe("arbre radial — calculé, donc reproductible", () => {
  it("`root` est au centre", () => {
    const at = radialTreeLayout(IDS, EDGES);
    expect(at.get("root")).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("deux appels donnent exactement la même galaxie", () => {
    // Déterminisme : la galaxie de Massimo doit être la même à chaque visite, sinon ce n'est
    // pas la sienne. Aucun `Math.random` nulle part.
    expect(radialTreeLayout(IDS, EDGES)).toEqual(radialTreeLayout(IDS, EDGES));
  });

  it("aucun nœud n'est perdu, même sans chemin jusqu'à la racine", () => {
    const at = radialTreeLayout([...IDS, "skill-orphelin"], EDGES);
    expect(at.size).toBe(IDS.length + 1);
    expect(at.has("skill-orphelin")).toBe(true);
  });

  it("un enfant n'est jamais posé exactement sur son parent", () => {
    // Sinon la naissance n'aurait aucun trajet à parcourir, et l'étoile surgirait sur place.
    const at = radialTreeLayout(IDS, EDGES);
    for (const [child, parent] of PARENT_OF) {
      const a = at.get(child)!;
      const b = at.get(parent)!;
      const distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      expect(distance).toBeGreaterThan(1);
    }
  });

  it("deux frères ne se superposent pas", () => {
    const at = radialTreeLayout(IDS, EDGES);
    const a = at.get("skill-1")!;
    const b = at.get("skill-2")!;
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThan(1);
  });
});

describe("le compte d'étoiles allumées", () => {
  it("monte d'une étoile par cran, et s'arrête au total", () => {
    const ids = ["skill-1", "skill-2", "skill-3"];
    expect(litCountAt(ids, 0)).toBe(1);
    expect(litCountAt(ids, STAR_CADENCE)).toBe(2);
    expect(litCountAt(ids, 10 * STAR_CADENCE)).toBe(3);
  });

  it("une galaxie vide ne compte rien", () => {
    expect(litCountAt([], 5_000)).toBe(0);
  });
});
