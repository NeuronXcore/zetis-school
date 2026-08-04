import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

const loadFullGraph = vi.fn();
const loadTimelineWithSkills = vi.fn();

vi.mock("../../lib/galaxyShared", () => ({
  loadFullGraph: () => loadFullGraph(),
  loadTimelineWithSkills: () => loadTimelineWithSkills(),
}));

import { HeaderGalaxy, resetHeaderGalaxyPlayback } from "./HeaderGalaxy";
import { BREATH_STARS, FIXED_FRAME_DRAWS } from "./headerGalaxyRenderer";

const GRAPH = {
  nodes: [
    { id: "root", kind: "root", label: "ZETIS" },
    { id: "subject-1", kind: "subject", label: "SVT" },
    { id: "chapter-1", kind: "chapter", label: "Cellule" },
    { id: "skill-1", kind: "skill", label: "Mitose", skill_id: 1, status: "solid" },
    { id: "skill-2", kind: "skill", label: "Méiose", skill_id: 2, status: "weak" },
  ],
  edges: [
    { source: "root", target: "subject-1" },
    { source: "subject-1", target: "chapter-1" },
    { source: "chapter-1", target: "skill-1" },
    { source: "chapter-1", target: "skill-2" },
  ],
};
const TIMELINE = {
  points: [{ date: "2026-09-02", lit: 2 }],
  total: 2,
  skills: [
    { skill_id: 1, first_lit: "2026-09-02" },
    { skill_id: 2, first_lit: "2026-09-05" },
  ],
};

/** jsdom ne peint pas : on lui donne un contexte 2D qui accepte tout et enregistre les appels. */
function stubCanvas() {
  const drawn = { drawImage: 0, arc: 0, clearRect: 0 };
  const context = {
    canvas: { width: 0, height: 0 },
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    shadowBlur: 0,
    filter: "none",
    setTransform: () => {},
    clearRect: () => {
      drawn.clearRect += 1;
    },
    drawImage: () => {
      drawn.drawImage += 1;
    },
    beginPath: () => {},
    arc: () => {
      drawn.arc += 1;
    },
    fill: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fillRect: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  // Le bandeau réel : pleine largeur, `h-24` = 96 px. Sans mesure, la construction ne part pas.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 1200,
    height: 96,
    top: 0,
    left: 0,
    right: 1200,
    bottom: 96,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return drawn;
}

let reducedMotion = false;
let frames: FrameRequestCallback[] = [];
let rafCalls = 0;

/** Fait avancer la boucle image par image, sous notre contrôle. */
function pump(times: number, msPerFrame = 200) {
  let clock = 0;
  for (let i = 0; i < times && frames.length > 0; i += 1) {
    const next = frames.shift() as FrameRequestCallback;
    clock += msPerFrame;
    next(clock);
  }
}

beforeEach(() => {
  resetHeaderGalaxyPlayback();
  reducedMotion = false;
  frames = [];
  rafCalls = 0;
  loadFullGraph.mockReset().mockResolvedValue(GRAPH);
  loadTimelineWithSkills.mockReset().mockResolvedValue(TIMELINE);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reducedMotion,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  // Pas de `requestIdleCallback` : c'est le cas de Safari, donc celui de l'iPhone de Massimo.
  vi.stubGlobal("requestIdleCallback", undefined);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafCalls += 1;
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("HeaderGalaxy — la galaxie de Massimo dans son bandeau", () => {
  it("🔒 AUCUNE requête avant la première peinture", async () => {
    // Le bandeau est sur les 21 routes : il ne doit jamais concurrencer les données de la page
    // que Massimo est venu voir. Leçon de `HomeGalaxyCard.tsx:79-94`, appliquée avec un report
    // plus long encore.
    stubCanvas();
    vi.useFakeTimers();
    render(<HeaderGalaxy />);

    expect(loadFullGraph).not.toHaveBeenCalled();
    expect(loadTimelineWithSkills).not.toHaveBeenCalled();

    vi.advanceTimersByTime(800);
    expect(loadFullGraph).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("🔒 `prefers-reduced-motion` : requestAnimationFrame n'est JAMAIS appelé", async () => {
    // ⚠️ Pas « appelé puis annulé » — le chemin de code n'existe pas. Le dépôt respecte cette
    // règle en RETIRANT les nœuds animés du DOM (`NeuralLinks.tsx:98`) ; l'équivalent exact pour
    // un canvas est de ne pas armer la boucle. L'état final est rendu d'emblée (ADR-0029 §6).
    reducedMotion = true;
    const drawn = stubCanvas();
    render(<HeaderGalaxy />);

    await waitFor(() => expect(drawn.drawImage).toBeGreaterThan(0), { timeout: 3000 });
    expect(rafCalls).toBe(0);
  });

  it("🔒 la construction se TERMINE et cède la place à une respiration BORNÉE", async () => {
    // ⚠️ CE CAS A CHANGÉ DE NATURE LE 2026-08-04, et c'est une décision, pas un assouplissement.
    //
    // Il exigeait l'arrêt complet de la boucle. Vu à l'écran, ce gel donnait un bandeau mort : la
    // construction dure 3,2 s et Massimo arrive presque toujours après. Le dépôt disait d'ailleurs
    // déjà l'inverse pour le rejeu (addendum ADR-0029 §5 : « à la fin ça ne se fige pas »).
    //
    // Ce qui reste protégé, et c'est l'essentiel : la construction se TERMINE (elle ne boucle pas
    // indéfiniment), et ce qui la suit est BORNÉ — un blit plus au plus `BREATH_STARS` sprites,
    // quel que soit le nombre de notions. C'est ce qui sépare une respiration des 78 animations
    // infinies qu'on a retirées.
    const drawn = stubCanvas();
    const { container } = render(<HeaderGalaxy />);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;

    await waitFor(() => expect(frames.length).toBeGreaterThan(0), { timeout: 3000 });
    expect(canvas.dataset.state).toBe("growing");
    pump(60);
    expect(canvas.dataset.state).toBe("alive");

    const before = drawn.drawImage;
    pump(1, 5000);
    expect(drawn.drawImage - before).toBeLessThanOrEqual(BREATH_STARS + FIXED_FRAME_DRAWS);
  });

  it("🔒 la respiration est CADENCÉE — elle ne repeint pas à chaque image", async () => {
    // 20 im/s suffisent pour un scintillement. Sans ce frein, on repeindrait 60 fois par seconde
    // sur les 21 routes — le coût qu'on venait de supprimer, rentré par la porte de derrière.
    const drawn = stubCanvas();
    render(<HeaderGalaxy />);
    await waitFor(() => expect(frames.length).toBeGreaterThan(0), { timeout: 3000 });
    pump(60);

    const before = drawn.drawImage;
    pump(6, 8); // six images rapprochées : moins d'un intervalle de respiration en tout
    expect(drawn.drawImage - before).toBeLessThanOrEqual(BREATH_STARS + FIXED_FRAME_DRAWS);
  });

  it("🔒 la CONSTRUCTION ne rejoue pas au remontage — une seule par chargement de page", async () => {
    // Depuis que la respiration existe, un compte d'images ne distingue plus rien : le témoin
    // d'état, lui, dit ce qui s'est passé. Au remontage on doit aller directement à `alive`,
    // sans jamais repasser par `growing`.
    stubCanvas();
    const first = render(<HeaderGalaxy />);
    await waitFor(() => expect(frames.length).toBeGreaterThan(0), { timeout: 3000 });
    pump(60);
    first.unmount();

    const { container } = render(<HeaderGalaxy />);
    await waitFor(() => expect(loadFullGraph).toHaveBeenCalledTimes(2), { timeout: 3000 });
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;

    await waitFor(() => expect(canvas.dataset.state).toBe("alive"), { timeout: 3000 });
  });

  it("🔒 réseau en panne : silence complet, aucun plantage", async () => {
    // Un décor ne dit jamais qu'il a échoué. Le bandeau garde l'emblème et sa lueur.
    stubCanvas();
    loadFullGraph.mockRejectedValue(new Error("Erreur 503"));
    loadTimelineWithSkills.mockRejectedValue(new Error("Erreur 503"));
    const { container } = render(<HeaderGalaxy />);

    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(container.textContent).toBe("");
    expect(rafCalls).toBe(0);
  });

  it("🔒 Massimo tout neuf (aucune notion allumée) : pas un état d'erreur", async () => {
    stubCanvas();
    loadTimelineWithSkills.mockResolvedValue({ points: [], total: 0, skills: [] });
    render(<HeaderGalaxy />);

    await waitFor(() => expect(frames.length).toBeGreaterThan(0), { timeout: 3000 });
    expect(() => pump(60)).not.toThrow();
  });

  it("🔒 largeur nulle (avant mesure) : rien ne part", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}),
    });
    render(<HeaderGalaxy />);

    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(rafCalls).toBe(0);
  });

  it("🔒 sans contexte 2D, le composant se monte quand même", async () => {
    // Sinon TOUS les tests de page rendant `MassimoLayout` casseraient — et sur l'iPad de
    // Massimo, un contexte perdu sous pression mémoire viderait son bandeau.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { container } = render(<HeaderGalaxy />);

    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(container.querySelector("canvas")).not.toBeNull();
    expect(rafCalls).toBe(0);
  });

  it("🔒 c'est un DÉCOR : aria-hidden, jamais cliquable", async () => {
    stubCanvas();
    const { container } = render(<HeaderGalaxy />);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;

    expect(canvas.getAttribute("aria-hidden")).toBe("true");
    expect(canvas.className).toContain("pointer-events-none");
  });
});
