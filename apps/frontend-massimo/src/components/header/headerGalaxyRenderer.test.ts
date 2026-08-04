import { describe, expect, it } from "vitest";
import type { GalaxyEdge, GalaxyNode } from "@zetis/types";
import { revealSchedule } from "@zetis/ui/galaxy";
import { headerBandLayout } from "./headerBandLayout";
import { IN_FLIGHT_BUDGET, headerClock } from "./headerGalaxyClock";
import {
  FIXED_FRAME_DRAWS,
  HeaderGalaxyRenderer,
  ROTATION_PERIOD,
  type RendererDeps,
} from "./headerGalaxyRenderer";

const BAND = { width: 1200, height: 96, centerX: 600, centerY: 38.4, coreRadius: 46, padding: 6 };

/** Un contexte 2D qui n'affiche rien mais raconte tout. jsdom ne peint pas — on ne cherche pas
 *  à peindre, on cherche à savoir CE QUI est demandé, et combien de fois. */
function spyContext() {
  const calls = { drawImage: 0, arc: 0, stroke: 0, clearRect: 0, fillRect: 0 };
  /** Les abscisses où les sprites atterrissent — c'est ce qui prouve qu'une rotation a lieu. */
  const xs: number[] = [];
  /** ⚠️ Ce qu'on surveille vraiment : toute écriture non nulle est un flou gaussien par appel. */
  const banned = { shadowBlur: [] as number[], filter: [] as string[] };
  const target = {
    canvas: { width: BAND.width, height: BAND.height },
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "" as unknown,
    strokeStyle: "",
    lineWidth: 1,
    shadowBlur: 0,
    filter: "none",
    drawImage: (_image: unknown, x?: number) => {
      calls.drawImage += 1;
      xs.push(x ?? 0);
    },
    beginPath: () => {},
    arc: () => {
      calls.arc += 1;
    },
    fill: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {
      calls.stroke += 1;
    },
    clearRect: () => {
      calls.clearRect += 1;
    },
    fillRect: () => {
      calls.fillRect += 1;
    },
    createRadialGradient: () => ({ addColorStop: () => {} }),
  };
  const ctx = new Proxy(target, {
    set(obj, prop, value) {
      if (prop === "shadowBlur" && value !== 0) banned.shadowBlur.push(value as number);
      if (prop === "filter" && value !== "none") banned.filter.push(value as string);
      return Reflect.set(obj, prop, value);
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, banned, xs };
}

function deps(ctx: CanvasRenderingContext2D): { deps: RendererDeps; layers: number } {
  let layers = 0;
  const made: RendererDeps = {
    ctx,
    makeLayer: () => {
      layers += 1;
      return spyContext().ctx;
    },
  };
  return { deps: made, get layers() {
    return layers;
  } };
}

function galaxy(subjects: number, chapters: number, skills: number) {
  const nodes: GalaxyNode[] = [{ id: "root", kind: "root", label: "ZETIS" } as GalaxyNode];
  const edges: GalaxyEdge[] = [];
  const ordered: string[] = [];
  const parentOf = new Map<string, string>();
  for (let s = 0; s < subjects; s += 1) {
    const subject = `subject-${s}`;
    nodes.push({ id: subject, kind: "subject", label: subject } as GalaxyNode);
    edges.push({ source: "root", target: subject } as GalaxyEdge);
    parentOf.set(subject, "root");
    for (let c = 0; c < chapters; c += 1) {
      const chapter = `chapter-${s}-${c}`;
      nodes.push({ id: chapter, kind: "chapter", label: chapter } as GalaxyNode);
      edges.push({ source: subject, target: chapter } as GalaxyEdge);
      parentOf.set(chapter, subject);
      for (let k = 0; k < skills; k += 1) {
        const skill = `skill-${s}-${c}-${k}`;
        nodes.push({ id: skill, kind: "skill", status: "solid", label: skill } as GalaxyNode);
        edges.push({ source: chapter, target: skill } as GalaxyEdge);
        parentOf.set(skill, chapter);
        ordered.push(skill);
      }
    }
  }
  return { nodes, edges, ordered, parentOf };
}

function build(subjects = 8, chapters = 5, skills = 8) {
  const { nodes, edges, ordered, parentOf } = galaxy(subjects, chapters, skills);
  const layout = headerBandLayout(nodes, edges, BAND);
  const clock = headerClock(revealSchedule(ordered, parentOf));
  const spy = spyContext();
  const d = deps(spy.ctx);
  const renderer = new HeaderGalaxyRenderer(d.deps, nodes, edges, layout, clock, BAND);
  return { renderer, clock, spy, nodes };
}

describe("HeaderGalaxyRenderer — le coût par image ne dépend pas de N", () => {
  it("🔒 budget de particules : jamais plus d'étoiles en vol que IN_FLIGHT_BUDGET", () => {
    // C'EST LA PROPRIÉTÉ QUI TIENT LE CHANTIER. Le bandeau est sur les 21 routes ; si le coût par
    // image montait avec le nombre de notions, on aurait déplacé le problème qu'on prétend
    // corriger (78 animations infinies).
    const { renderer, clock, spy } = build(10, 5, 9); // 511 nœuds
    let worst = 0;

    for (let t = 0; t <= clock.total; t += 16) {
      const before = spy.calls.drawImage;
      renderer.drawAt(t);
      // On retire le coût fixe (calque posé + couronne) : ce qu'on mesure ici, c'est ce qui
      // varie avec le nombre de notions.
      worst = Math.max(worst, spy.calls.drawImage - before - FIXED_FRAME_DRAWS);
    }

    expect(worst).toBeLessThanOrEqual(IN_FLIGHT_BUDGET);
  });

  it("🔒 `shadowBlur` et `filter` ne sont JAMAIS écrits", () => {
    // ⚠️ Ce sont des flous gaussiens appliqués PAR APPEL DE DESSIN, 10 à 50× le coût d'un `fill()`.
    // C'est exactement `hfx-twinkle` (qui animait `filter: drop-shadow` sur 22 éléments) réinventé
    // en canvas. La lueur vient de sprites pré-rendus, et de rien d'autre.
    const { renderer, clock, spy } = build();
    for (let t = 0; t <= clock.total; t += 40) renderer.drawAt(t);
    renderer.drawFinal();

    expect(spy.banned.shadowBlur).toEqual([]);
    expect(spy.banned.filter).toEqual([]);
  });

  it("🔒 une étoile posée n'est plus jamais redessinée sur le canvas visible", () => {
    // Le curseur ne recule pas. Sans ça, on redessinerait 500 étoiles par image — le défaut
    // consigné dans TROUBLESHOOTING.md (« Réassigner `graphData` à chaque image »), transposé.
    const { renderer, clock, spy } = build();

    for (let t = 0; t <= clock.total; t += 16) renderer.drawAt(t);
    const settledFrame = spy.calls.drawImage;
    renderer.drawAt(clock.total);
    // Une image après la fin : le coût fixe, et rien d'autre — aucune étoile redessinée.
    expect(spy.calls.drawImage - settledFrame).toBe(FIXED_FRAME_DRAWS);
  });

  it("🔒 `drawAt` finit par rendre `false` — la boucle DOIT pouvoir s'arrêter", () => {
    // Un rAF qui ne s'arrête jamais dans le chrome de l'app, c'est le coût permanent qu'on
    // supprime, réintroduit autrement.
    const { renderer, clock } = build();

    expect(renderer.drawAt(0)).toBe(true);
    expect(renderer.drawAt(clock.total + 1)).toBe(false);
  });

  it("🔒 `drawFinal` dessine TOUTES les étoiles en une passe", () => {
    // Le chemin de `prefers-reduced-motion` et du retour d'onglet caché. Aucune notion ne doit
    // manquer à l'appel — même verrou anti-plafond que les deux modules purs.
    const { renderer, spy, nodes } = build(3, 2, 4); // 1 + 3 + 6 + 24 = 34
    spy.calls.drawImage = 0;
    renderer.drawFinal();

    expect(nodes).toHaveLength(34);
    expect(spy.calls.drawImage).toBe(nodes.length + 1); // + la couronne solaire
  });

  it("🔒 sans calque hors écran, ça dessine quand même (repli, pas plantage)", () => {
    // `makeLayer` peut rendre `null` : contexte perdu sous pression mémoire sur iPad, canvas
    // désactivé. Un bandeau dégradé vaut mieux qu'un écran blanc.
    const { nodes, edges, ordered, parentOf } = galaxy(2, 2, 2);
    const layout = headerBandLayout(nodes, edges, BAND);
    const clock = headerClock(revealSchedule(ordered, parentOf));
    const spy = spyContext();
    const renderer = new HeaderGalaxyRenderer(
      { ctx: spy.ctx, makeLayer: () => null },
      nodes,
      edges,
      layout,
      clock,
      BAND,
    );

    expect(() => renderer.drawFinal()).not.toThrow();
    expect(spy.calls.arc).toBeGreaterThan(0); // le repli disque, pas le sprite
    expect(spy.banned.shadowBlur).toEqual([]); // et il ne rouvre pas l'interdit
  });

  it("🔒 galaxie vide (Massimo tout neuf) — aucun plantage, rien à dessiner", () => {
    const nodes: GalaxyNode[] = [{ id: "root", kind: "root", label: "ZETIS" } as GalaxyNode];
    const layout = headerBandLayout(nodes, [], BAND);
    const clock = headerClock(revealSchedule([], new Map()));
    const spy = spyContext();
    const renderer = new HeaderGalaxyRenderer(
      { ctx: spy.ctx, makeLayer: () => spyContext().ctx },
      nodes,
      [],
      layout,
      clock,
      BAND,
    );

    expect(() => renderer.drawAt(0)).not.toThrow();
    expect(() => renderer.drawFinal()).not.toThrow();
  });

  it("🔒 TOUT le ciel est dessiné, pas seulement les notions travaillées", () => {
    // ⚠️ MESURÉ À L'ÉCRAN LE 2026-08-04, et c'est ce qui a corrigé la conception : le graphe réel
    // de Massimo fait 202 nœuds pour 47 notions ayant une date de première fois. Ne dessiner que
    // les 47 laissait la bande vide à 77 % — les étoiles flottaient seules et se voyaient à peine.
    // Les notions encore à découvrir peuplent donc le ciel, en veilleuse.
    //
    // Ce cas échoue si quelqu'un « optimise » en ne gardant que les notions au calendrier.
    const { nodes, edges, ordered, parentOf } = galaxy(4, 3, 6); // 1 + 4 + 12 + 72 = 89
    const layout = headerBandLayout(nodes, edges, BAND);
    // Seules les 10 premières notions sont travaillées : les 62 autres sont dormantes.
    const clock = headerClock(revealSchedule(ordered.slice(0, 10), parentOf));
    const spy = spyContext();
    const renderer = new HeaderGalaxyRenderer(
      { ctx: spy.ctx, makeLayer: () => spyContext().ctx },
      nodes,
      edges,
      layout,
      clock,
      BAND,
    );

    expect(nodes).toHaveLength(89);
    expect(clock.bornAtWall.size).toBeLessThan(nodes.length); // il y a bien des dormantes
    spy.calls.drawImage = 0;
    renderer.drawFinal();
    expect(spy.calls.drawImage).toBe(nodes.length + 1); // + la couronne solaire
  });

  it("🔒 la phase VIVANTE redessine tout — le prix explicite de la rotation", () => {
    // ⚠️ CE CAS A CHANGÉ DE NATURE LE 2026-08-04, ET C'EST UN AVEU, PAS UN ASSOUPLISSEMENT.
    //
    // Il exigeait un coût borné par `BREATH_STARS`. C'était vrai tant que la galaxie était
    // immobile : le calque posé se blittait d'un coup. Dès qu'elle TOURNE, plus rien n'est
    // immobile — le calque ne sert plus et chaque étoile se redessine. Le coût redevient
    // proportionnel à N, et il faut que ce soit ÉCRIT quelque part plutôt que découvert au
    // profileur.
    //
    // Ce qu'on protège désormais : pas de multiplication cachée. Une image = la couronne + une
    // étoile par nœud, et rien de plus. Un `drawImage` de sprite reste très loin d'un
    // `filter: drop-shadow`, ce que faisaient les 22 cubes retirés à 60 im/s.
    const { renderer, spy, nodes } = build(10, 5, 9); // 511 nœuds
    spy.calls.drawImage = 0;
    renderer.drawAlive(1000);

    expect(nodes).toHaveLength(511);
    expect(spy.calls.drawImage).toBe(nodes.length + 1); // + la couronne solaire
  });

  it("🔒 la galaxie TOURNE vraiment", () => {
    // Contre-épreuve du mécanisme : si `drawAlive` ignorait l'angle, le cas ci-dessus passerait
    // quand même au vert et le bandeau resterait figé — exactement ce qu'on vient de corriger.
    // On regarde donc OÙ les sprites atterrissent, à un quart de tour d'écart.
    const { renderer, spy } = build(4, 3, 4);

    renderer.drawAlive(0);
    const debut = [...spy.xs];
    spy.xs.length = 0;
    renderer.drawAlive(ROTATION_PERIOD / 4);
    const apres = spy.xs;

    expect(debut).toHaveLength(apres.length);
    const bouge = debut.filter((x, i) => Math.abs(x - apres[i]) > 1).length;
    expect(bouge / debut.length).toBeGreaterThan(0.7);
  });

  it("🔒 `dispose` libère le calque posé", () => {
    // ~2 Mo de texture qui n'ont plus de raison d'exister une fois la scène figée.
    const { renderer, clock } = build(2, 2, 2);
    renderer.drawAt(clock.total);

    expect(() => renderer.dispose()).not.toThrow();
  });
});
