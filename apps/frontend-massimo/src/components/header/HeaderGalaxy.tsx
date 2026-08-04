import { useEffect, useRef, useState } from "react";
import type { GalaxyFullGraph, GalaxyTimeline } from "@zetis/types";
import { revealSchedule } from "@zetis/ui/galaxy";
import { loadFullGraph, loadTimelineWithSkills } from "../../lib/galaxyShared";
import { prefersReducedMotion } from "../../lib/motion";
import { headerBandLayout } from "./headerBandLayout";
import { headerClock } from "./headerGalaxyClock";
import { BREATH_FRAME_MS, HeaderGalaxyRenderer } from "./headerGalaxyRenderer";

/**
 * La galaxie de Massimo, qui se construit dans son bandeau puis se fige.
 *
 * Remplace `NeuralCubes` (22 cubes, 44 animations CSS infinies dont une sur `filter`) et
 * `NeuralLinks` (32 `<animate>` SMIL en `repeatCount="indefinite"`). Ce décor-là était joli mais
 * ne disait rien, et il coûtait ~38 repaints par image, sur les 21 routes, POUR TOUJOURS. Celui-ci
 * dit quelque chose de vrai, et son coût en régime établi est **nul** : une texture.
 *
 * ⚠️ TENSION ASSUMÉE AVEC L'ADDENDUM ADR-0029 §6 (« aucune animation ne démarre sur une surface
 * que Massimo n'a pas ouverte pour elle »). Le §6 vise l'animation SUBIE et PERMANENTE sur une
 * page d'atterrissage — le défaut du 2026-07-28. La surface que Massimo ouvre ici n'est pas
 * `/chat` ni `/subjects/:slug` : c'est l'APPLICATION, dont ce bandeau est la porte d'entrée. La
 * construction se joue à son arrivée, UNE FOIS, dure ~3,2 s, est `aria-hidden`, ne se répète
 * jamais d'une page à l'autre, et se termine sur un graphe immobile. Elle est donc plus stricte
 * que l'exception déjà accordée à `HomeGalaxyCard`, qui tourne indéfiniment sur la page la plus
 * visitée. Cadré par un addendum — ne pas « corriger » sans l'avoir lu.
 */

/** Rayon de l'emblème ZETIS (`h-[5.25rem]` = 84 px de diamètre) : les matières le contournent. */
const CORE_RADIUS = 46;
const PADDING = 6;
/** En dessous, il n'y a pas de bandeau à peindre — c'est le premier rendu, avant mesure. */
const MIN_WIDTH = 40;
const MIN_HEIGHT = 20;

/**
 * ⚠️ VERROU DE MODULE, ET IL SE POSE À LA FIN, PAS AU DÉBUT.
 *
 * Le poser au démarrage paraît plus simple et casse le mode dev : `StrictMode` monte, démonte et
 * remonte chaque effet, donc le premier passage marquerait « déjà joué » et le second n'animerait
 * plus rien. À la fin, une construction interrompue (déconnexion, remontage) n'est pas comptée —
 * ce qui est aussi le bon comportement en production.
 */
let alreadyPlayed = false;

/** Réservé aux tests. */
export function resetHeaderGalaxyPlayback(): void {
  alreadyPlayed = false;
}

interface Loaded {
  graph: GalaxyFullGraph;
  timeline: GalaxyTimeline | null;
}

export function HeaderGalaxy() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Lu à l'INITIALISATION, pas dans un effet : aucune image ne doit partir avant qu'on sache.
  const [reduced] = useState(prefersReducedMotion);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // ── Les données, APRÈS la première peinture ────────────────────────────────────────────
  //
  // Patron de `HomeGalaxyCard`, avec un report plus long : le bandeau est sur toutes les pages et
  // ne doit jamais concurrencer les données de la page que Massimo est venu voir. Safari n'a pas
  // `requestIdleCallback` — et c'est le navigateur de son iPhone, donc le repli est le cas
  // courant, pas un cas de bord.
  useEffect(() => {
    let active = true;
    const start = () => {
      Promise.allSettled([loadFullGraph(), loadTimelineWithSkills()]).then(([g, t]) => {
        // Repli silencieux : sans graphe, le bandeau reste l'emblème et sa lueur. Jamais de
        // message d'erreur dans le chrome de l'app pour un décor.
        if (!active || g.status !== "fulfilled") return;
        setLoaded({ graph: g.value, timeline: t.status === "fulfilled" ? t.value : null });
      });
    };
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback;
    if (idle) {
      const handle = idle(start, { timeout: 2000 });
      return () => {
        active = false;
        (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(handle);
      };
    }
    const timer = window.setTimeout(start, 800);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  // ── La mesure ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => {
      const box = canvas.getBoundingClientRect();
      setSize((current) =>
        current.width === box.width && current.height === box.height
          ? current // même objet → pas de re-rendu, donc pas de relance de la construction
          : { width: box.width, height: box.height },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      // jsdom, et les WebKit très anciens. Un `resize` de fenêtre suffit largement pour un décor.
      window.addEventListener("resize", measure, { passive: true });
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // ── La construction ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loaded) return;
    if (size.width < MIN_WIDTH || size.height < MIN_HEIGHT) return;
    const ctx = canvas.getContext("2d");
    // Contexte indisponible (canvas désactivé, mémoire) : c'est le « repli sans WebGL » de
    // l'addendum ADR-0024 §2, transposé. On ne dessine rien et rien ne casse.
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const makeLayer = (width: number, height: number) => {
      const layer = document.createElement("canvas");
      layer.width = Math.max(1, Math.round(width * dpr));
      layer.height = Math.max(1, Math.round(height * dpr));
      const layerCtx = layer.getContext("2d");
      layerCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      return layerCtx;
    };

    const { nodes, edges } = loaded.graph;
    const parentOf = new Map<string, string>();
    for (const edge of edges) if (!parentOf.has(edge.target)) parentOf.set(edge.target, edge.source);
    // Les notions dans l'ordre de leur PREMIÈRE fois — même convention d'identifiant que
    // `useGalaxyGrowth`, et c'est le serveur qui fixe l'ordre.
    const ordered = (loaded.timeline?.skills ?? []).map((skill) => `skill-${skill.skill_id}`);

    const clock = headerClock(revealSchedule(ordered, parentOf));
    // Une seule description de la bande : la pose et le rendu doivent projeter avec EXACTEMENT le
    // même repère, sinon la rotation décale la galaxie de son propre soleil.
    const band = {
      width: size.width,
      height: size.height,
      centerX: size.width / 2,
      // 40 % de la hauteur : le centre exact de l'emblème (`top-[40%]` dans le bandeau). La
      // galaxie SORT du logo au lieu d'être posée à côté.
      centerY: size.height * 0.4,
      coreRadius: CORE_RADIUS,
      padding: PADDING,
    };
    const layout = headerBandLayout(nodes, edges, band);
    const renderer = new HeaderGalaxyRenderer({ ctx, makeLayer }, nodes, edges, layout, clock, band);

    let raf: number | null = null;

    // `prefers-reduced-motion` : ni construction, ni respiration. `requestAnimationFrame` n'est
    // JAMAIS appelé — pas « appelé puis annulé », le chemin n'existe pas (addendum ADR-0029 §6).
    if (reduced) {
      renderer.drawFinal();
      canvas.dataset.state = "final";
      return () => renderer.dispose();
    }

    /**
     * La vie du bandeau après la construction (addendum « La galaxie dans le bandeau » §5bis).
     *
     * ⚠️ Elle est BORNÉE et ce n'est pas l'ancien décor déguisé : un blit + au plus
     * `BREATH_STARS` sprites, à `BREATH_FRAME_MS` — environ un cinquième de ce que coûtaient les
     * cubes et les liens retirés, et sans aucun flou gaussien. Le coût ne dépend pas du nombre de
     * notions. `requestAnimationFrame` se met en pause tout seul quand l'onglet passe en fond.
     */
    const breathe = () => {
      // ⚠️ Le calque posé est libéré ICI : la galaxie tourne, donc plus rien n'est immobile et un
      // calque statique ne sert plus à rien. Ce qu'on perd en coût par image, on le reprend en
      // mémoire — ~2 Mo qui ne sont plus retenus.
      renderer.dispose();
      // Témoin d'état, lisible par les tests et à l'inspecteur : `growing` → `alive`. C'est ce qui
      // permet de vérifier qu'un remontage ne REJOUE pas la construction, là où un simple compte
      // d'images ne distingue plus rien depuis que la rotation existe.
      canvas.dataset.state = "alive";
      let lastPaint = Number.NEGATIVE_INFINITY;
      const tick = (now: number) => {
        if (now - lastPaint >= BREATH_FRAME_MS) {
          renderer.drawAlive(now);
          lastPaint = now;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    // Déjà jouée dans cet onglet, ou onglet en arrière-plan : on ne rejoue pas la construction —
    // Massimo l'a vue, ou il l'a ratée et la lui rejouer serait une animation qu'il n'a pas
    // demandée. On passe directement à l'état vivant.
    if (alreadyPlayed || document.visibilityState === "hidden") {
      breathe();
      return () => {
        if (raf !== null) cancelAnimationFrame(raf);
        renderer.dispose();
      };
    }

    const startedAt = performance.now();
    canvas.dataset.state = "growing";
    const step = (now: number) => {
      // Au retour d'un onglet caché, `now - startedAt` a bondi de plusieurs minutes : on ne
      // reprend pas au milieu, on va droit à l'état vivant.
      if (document.hidden || !renderer.drawAt(now - startedAt)) {
        alreadyPlayed = true;
        breathe();
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      renderer.dispose();
    };
  }, [loaded, size, reduced]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-testid="header-galaxy"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
