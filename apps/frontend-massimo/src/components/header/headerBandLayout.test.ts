import { describe, expect, it } from "vitest";
import { type BandOptions, headerBandLayout, projectBandPoint } from "./headerBandLayout";

// Le bandeau réel : pleine largeur desktop, `h-24` = 96 px, emblème centré à 40 % de la hauteur
// (cf. `MassimoBannerHeader.tsx`, `top-[40%]`, `h-[5.25rem]` = 84 px de diamètre).
const BAND: BandOptions = {
  width: 1200,
  height: 96,
  centerX: 600,
  centerY: 38.4,
  coreRadius: 46,
  padding: 6,
};

/** Un tour complet, échantillonné. La galaxie tourne : les invariants valent à TOUS les angles. */
const ANGLES = Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2);

type Node = { id: string; kind: string };
type Edge = { source: string; target: string };

/** Une galaxie réaliste : 1 racine, 8 matières, 5 chapitres chacune, 8 notions chacun = 369. */
function galaxy(subjects = 8, chapters = 5, skills = 8) {
  const nodes: Node[] = [{ id: "root", kind: "root" }];
  const edges: Edge[] = [];
  for (let s = 0; s < subjects; s += 1) {
    const subject = `subject-${s}`;
    nodes.push({ id: subject, kind: "subject" });
    edges.push({ source: "root", target: subject });
    for (let c = 0; c < chapters; c += 1) {
      const chapter = `chapter-${s}-${c}`;
      nodes.push({ id: chapter, kind: "chapter" });
      edges.push({ source: subject, target: chapter });
      for (let k = 0; k < skills; k += 1) {
        const skill = `skill-${s}-${c}-${k}`;
        nodes.push({ id: skill, kind: "skill" });
        edges.push({ source: chapter, target: skill });
      }
    }
  }
  return { nodes, edges };
}

const screenAt = (map: ReturnType<typeof headerBandLayout>, angle: number) =>
  [...map.values()].map((p) => projectBandPoint(p, angle, BAND));

const allFinite = (map: ReturnType<typeof headerBandLayout>) =>
  ANGLES.every((a) =>
    screenAt(map, a).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
  );

describe("headerBandLayout — la pose de la galaxie dans le bandeau", () => {
  it("🔒 AUCUN nœud n'est perdu — 369 entrées pour 369 notions", () => {
    // ⚠️ TEST-VERROU ANTI-PLAFOND. L'addendum ADR-0024 §1 a SUPPRIMÉ `GALAXY_MAX_NODES` avec ce
    // motif : « il cache la progression de l'enfant selon un critère matériel », « Jamais un
    // plafond de nœuds déguisé ». Ce cas échoue si quelqu'un ajoute un `.slice()` « pour la
    // perf ». Le coût se règle sur les PARTICULES, jamais sur les étoiles.
    const { nodes, edges } = galaxy();
    const at = headerBandLayout(nodes, edges, BAND);

    expect(nodes).toHaveLength(369);
    expect(at.size).toBe(nodes.length);
  });

  it("🔒 déterministe — la galaxie de Massimo est la même à chaque visite", () => {
    const { nodes, edges } = galaxy();
    const a = headerBandLayout(nodes, edges, BAND);
    const b = headerBandLayout(nodes, edges, BAND);

    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it("🔒 le cœur reste au centre de l'emblème À TOUS LES ANGLES", () => {
    // C'est l'invariant de composition : Massimo ne voit pas un décor posé à côté du logo, il voit
    // sa galaxie SORTIR de l'emblème ZETIS. Et comme la galaxie tourne AUTOUR de ce cœur, il ne
    // doit pas bouger d'un pixel quand elle tourne — sinon le soleil dérive de sa propre galaxie.
    const { nodes, edges } = galaxy();
    const at = headerBandLayout(nodes, edges, BAND);
    const root = at.get("root");

    expect(root).toEqual({ u: 0, v: 0, lift: 0, depth: 0 });
    for (const angle of ANGLES) {
      const here = projectBandPoint(root!, angle, BAND);
      expect(here.x).toBeCloseTo(BAND.centerX, 6);
      expect(here.y).toBeCloseTo(BAND.centerY, 6);
    }
  });

  it("🔒 tout tient dans la bande, à TOUS les angles", () => {
    // La pose borne le rayon par construction plutôt que de clamper à l'écran : un clamp
    // déformerait la rotation (les étoiles s'agglutineraient contre le bord au lieu de tourner).
    // Ce cas vérifie que la borne est la bonne, sur un tour complet.
    const { nodes, edges } = galaxy();
    const at = headerBandLayout(nodes, edges, BAND);

    for (const angle of ANGLES) {
      for (const p of screenAt(at, angle)) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(BAND.width);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(BAND.height);
      }
    }
  });

  it("🔒 la galaxie ne S'EFFONDRE PAS en tournant", () => {
    // ⚠️ C'EST LA RAISON D'ÊTRE DE LA RÉÉCRITURE DU 2026-08-04.
    //
    // La pose d'avant alternait les matières à gauche et à droite : elles se retrouvaient toutes
    // à l'angle 0 ou π, donc elles traversaient le centre EN MÊME TEMPS. À chaque demi-tour, la
    // galaxie se serait repliée sur l'emblème. Réparties sur tout le tour, chaque étoile parcourt
    // son orbite pendant que l'ENSEMBLE garde sa silhouette.
    const { nodes, edges } = galaxy();
    const at = headerBandLayout(nodes, edges, BAND);
    const extents = ANGLES.map((angle) => {
      const xs = screenAt(at, angle).map((p) => p.x);
      return Math.max(...xs) - Math.min(...xs);
    });

    expect(Math.min(...extents)).toBeGreaterThan(Math.max(...extents) * 0.7);
  });

  it("🔒 ça ne se tasse PAS au centre — la galaxie occupe la largeur", () => {
    // Le défaut qu'on aurait eu en projetant `radialTreeLayout` : à 12,5:1, tout s'écrase derrière
    // l'emblème. Deux mesures, parce qu'une seule se contourne : l'étendue occupée, ET la densité
    // de la zone centrale.
    //
    // ⚠️ Le seuil est à 0,6 et non 0,8, et c'est un ARBITRAGE assumé, pas un test qu'on a relâché
    // pour qu'il passe. Pousser la masse vers les angles horizontaux montait le remplissage à
    // 90 % — au prix d'une silhouette qui s'effondrait à 52 % en tournant (voir le cas
    // ci-dessus). Un disque uniforme remplit un peu moins et tourne sans se replier ; le bandeau
    // passe sa vie à tourner et trois secondes à se construire.
    const { nodes, edges } = galaxy();
    const xs = screenAt(headerBandLayout(nodes, edges, BAND), 0).map((p) => p.x);
    const usable = BAND.width - 2 * BAND.padding;

    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(usable * 0.6);

    const central = xs.filter((x) => Math.abs(x - BAND.centerX) < BAND.width * 0.05).length;
    expect(central / xs.length).toBeLessThan(0.25);
  });

  it("🔒 la rotation DÉPLACE vraiment les étoiles", () => {
    // Contre-épreuve du mécanisme lui-même : si la projection ignorait l'angle, tous les cas
    // ci-dessus passeraient quand même au vert, et le bandeau resterait figé.
    const { nodes, edges } = galaxy(4, 3, 5);
    const at = headerBandLayout(nodes, edges, BAND);
    const before = screenAt(at, 0);
    const after = screenAt(at, Math.PI / 2);
    const moved = before.filter((p, i) => Math.abs(p.x - after[i].x) > 1).length;

    expect(moved / before.length).toBeGreaterThan(0.8);
  });

  it("🔒 les orphelins sont CONSERVÉS, jamais jetés", () => {
    const nodes: Node[] = [
      { id: "root", kind: "root" },
      { id: "perdu-1", kind: "skill" },
      { id: "perdu-2", kind: "skill" },
    ];
    const at = headerBandLayout(nodes, [], BAND);

    expect(at.size).toBe(3);
    expect(at.get("perdu-1")).toBeDefined();
    expect(at.get("perdu-2")).toBeDefined();
  });

  it("🔒 les profondeurs sont correctes — le rendu s'en sert pour la taille", () => {
    const { nodes, edges } = galaxy(1, 1, 1);
    const at = headerBandLayout(nodes, edges, BAND);

    expect(at.get("root")?.depth).toBe(0);
    expect(at.get("subject-0")?.depth).toBe(1);
    expect(at.get("chapter-0-0")?.depth).toBe(2);
    expect(at.get("skill-0-0-0")?.depth).toBe(3);
  });

  describe("dégénérescences — aucune ne doit produire NaN ni Infinity, à aucun angle", () => {
    it("aucun nœud", () => {
      expect(headerBandLayout([], [], BAND).size).toBe(0);
    });

    it("un seul nœud (Massimo tout neuf)", () => {
      // Le cas normal du premier jour, PAS un état d'erreur.
      const at = headerBandLayout([{ id: "root", kind: "root" }], [], BAND);
      expect(at.size).toBe(1);
      expect(allFinite(at)).toBe(true);
    });

    it("500 nœuds", () => {
      const { nodes, edges } = galaxy(10, 5, 9); // 1 + 10 + 50 + 450 = 511
      const at = headerBandLayout(nodes, edges, BAND);
      expect(at.size).toBe(nodes.length);
      expect(allFinite(at)).toBe(true);
    });

    it("largeur nulle (premier rendu, avant le ResizeObserver)", () => {
      const { nodes, edges } = galaxy(3, 2, 2);
      const at = headerBandLayout(nodes, edges, { ...BAND, width: 0, centerX: 0 });
      expect(at.size).toBe(nodes.length);
      expect(allFinite(at)).toBe(true);
    });

    it("graphe SANS racine — les nœuds de tête deviennent les matières", () => {
      const nodes: Node[] = [
        { id: "subject-0", kind: "subject" },
        { id: "subject-1", kind: "subject" },
        { id: "chapter-0", kind: "chapter" },
      ];
      const at = headerBandLayout(nodes, [{ source: "subject-0", target: "chapter-0" }], BAND);

      expect(at.size).toBe(3);
      expect(allFinite(at)).toBe(true);
      expect(at.get("subject-0")?.depth).toBe(1);
      expect(at.get("chapter-0")?.depth).toBe(2);
    });

    it("un cycle dans les arêtes ne fait pas boucler à l'infini", () => {
      // Le premier parent gagne, donc `b → a` est ignoré et l'arbre reste un arbre.
      const nodes: Node[] = [
        { id: "root", kind: "root" },
        { id: "a", kind: "subject" },
        { id: "b", kind: "chapter" },
      ];
      const edges: Edge[] = [
        { source: "root", target: "a" },
        { source: "a", target: "b" },
        { source: "b", target: "a" },
      ];
      const at = headerBandLayout(nodes, edges, BAND);

      expect(at.size).toBe(3);
      expect(allFinite(at)).toBe(true);
    });
  });
});
