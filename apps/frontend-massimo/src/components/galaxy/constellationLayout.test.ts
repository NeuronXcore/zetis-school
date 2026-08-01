import { describe, expect, it } from "vitest";
import { constellationLayout } from "@zetis/ui/galaxy";

// Les orbites CIRCULAIRES de la vue par défaut (addendum « constellations complètes »).
//
// Ce qui se teste : que rien ne se perde, que rien ne se superpose, et que la galaxie de
// Massimo soit la même à chaque visite. Le rendu, lui, se juge à l'œil.

const NODES = [
  { id: "root", kind: "root" },
  { id: "subject-1", kind: "subject" },
  { id: "chapter-1", kind: "chapter" },
  { id: "skill-1", kind: "skill" },
  { id: "skill-2", kind: "skill" },
  { id: "subject-2", kind: "subject" },
  { id: "chapter-2", kind: "chapter" },
  { id: "skill-3", kind: "skill" },
];
const EDGES = [
  { source: "root", target: "subject-1" },
  { source: "subject-1", target: "chapter-1" },
  { source: "chapter-1", target: "skill-1" },
  { source: "chapter-1", target: "skill-2" },
  { source: "root", target: "subject-2" },
  { source: "subject-2", target: "chapter-2" },
  { source: "chapter-2", target: "skill-3" },
];

const distance = (a: { x: number; y: number; z: number }, b: typeof a) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe("tout est posé, et rien ne se perd", () => {
  it("chaque nœud a sa place, jusqu'aux notions", () => {
    const { positions } = constellationLayout(NODES, EDGES);
    expect(positions.size).toBe(NODES.length);
    // Le point du §C révoqué : les notions ne sont plus retirées de la vue par défaut.
    expect(positions.has("skill-3")).toBe(true);
  });

  it("le cerveau est au centre", () => {
    const { positions } = constellationLayout(NODES, EDGES);
    expect(positions.get("root")).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("un nœud sans chemin jusqu'à une matière n'est pas jeté", () => {
    // Perdre un nœud, ce serait perdre une notion de Massimo.
    const { positions } = constellationLayout(
      [...NODES, { id: "skill-orphelin", kind: "skill" }],
      EDGES,
    );
    expect(positions.has("skill-orphelin")).toBe(true);
  });
});

describe("les orbites sont CIRCULAIRES autour du centre", () => {
  // ⚠️ Une première version posait les chapitres autour de LEUR matière et les notions autour
  // de LEUR chapitre — des orbites emboîtées. Illisible à l'écran : on ne voyait plus le
  // centre, seulement des amas dispersés. Ces cas testent l'inverse, et ce n'est pas un
  // assouplissement : c'est une autre décision.

  const radius = (p: { x: number; y: number; z: number }) => Math.hypot(p.x, p.z);

  it("tous les nœuds d'un même étage sont sur le MÊME anneau", () => {
    const { positions } = constellationLayout(NODES, EDGES);
    expect(radius(positions.get("chapter-1")!)).toBeCloseTo(
      radius(positions.get("chapter-2")!),
      6,
    );
    expect(radius(positions.get("skill-1")!)).toBeCloseTo(radius(positions.get("skill-3")!), 6);
  });

  it("les anneaux s'éloignent en descendant la hiérarchie", () => {
    const { positions } = constellationLayout(NODES, EDGES);
    expect(radius(positions.get("subject-1")!)).toBeLessThan(
      radius(positions.get("chapter-1")!),
    );
    expect(radius(positions.get("chapter-1")!)).toBeLessThan(radius(positions.get("skill-1")!));
  });

  it("les descendants d'une matière restent dans SON secteur angulaire", () => {
    // C'est ce qui garde l'arbre lisible malgré les anneaux communs : la hiérarchie se lit en
    // RAYON, l'appartenance en ANGLE.
    const { positions } = constellationLayout(NODES, EDGES);
    const angle = (id: string) => {
      const p = positions.get(id)!;
      return Math.atan2(p.z, p.x);
    };
    const gap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    // `chapter-1` et `skill-1` descendent de `subject-1` : ils sont angulairement plus proches
    // de lui que de `subject-2`.
    expect(gap(angle("chapter-1"), angle("subject-1"))).toBeLessThan(
      gap(angle("chapter-1"), angle("subject-2")),
    );
    expect(gap(angle("skill-1"), angle("subject-1"))).toBeLessThan(
      gap(angle("skill-1"), angle("subject-2")),
    );
  });

  it("deux nœuds ne se superposent jamais", () => {
    const { positions } = constellationLayout(NODES, EDGES);
    const all = [...positions.values()];
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        expect(distance(all[i], all[j])).toBeGreaterThan(1);
      }
    }
  });

  it("il y a un anneau par ÉTAGE, pas un par matière", () => {
    const { rings } = constellationLayout(NODES, EDGES);
    expect(rings).toHaveLength(3);
    expect(rings[0]).toBeLessThan(rings[1]);
    expect(rings[1]).toBeLessThan(rings[2]);
  });

  it("le nombre d'anneaux ne dépend pas du nombre de matières", () => {
    const many = constellationLayout(
      [...NODES, { id: "subject-3", kind: "subject" }, { id: "subject-4", kind: "subject" }],
      [...EDGES, { source: "root", target: "subject-3" }, { source: "root", target: "subject-4" }],
    );
    expect(many.rings).toHaveLength(3);
  });
});

describe("l'arrivée sort une constellation d'un seul tenant", () => {
  it("tout ce qui descend d'une matière porte SON rang", () => {
    // Sans ça, les nœuds sortiraient du centre un par un et la constellation se disloquerait
    // en vol.
    const { order } = constellationLayout(NODES, EDGES);
    expect(order.get("chapter-1")).toBe(order.get("subject-1"));
    expect(order.get("skill-1")).toBe(order.get("subject-1"));
    expect(order.get("skill-2")).toBe(order.get("subject-1"));
    expect(order.get("skill-3")).toBe(order.get("subject-2"));
  });

  it("deux matières ont des rangs distincts", () => {
    const { order } = constellationLayout(NODES, EDGES);
    expect(order.get("subject-1")).not.toBe(order.get("subject-2"));
  });
});

describe("déterminisme", () => {
  it("deux appels donnent exactement la même galaxie", () => {
    // La galaxie de Massimo doit être la même à chaque visite, sinon ce n'est pas la sienne.
    // Aucun `Math.random` nulle part.
    expect(constellationLayout(NODES, EDGES).positions).toEqual(
      constellationLayout(NODES, EDGES).positions,
    );
  });

  it("l'ordre des matières est celui REÇU, jamais un classement", () => {
    // Trier par nombre d'étoiles ferait de la galaxie un palmarès (ADR-0024 §5).
    const { order } = constellationLayout(NODES, EDGES);
    expect(order.get("subject-1")).toBe(0);
    expect(order.get("subject-2")).toBe(1);
  });
});
