/**
 * Brique ZETIS Galaxy — partie LÉGÈRE (ADR-0024 §3).
 *
 * ⚠️ `GalaxyCanvas` n'est PAS ré-exporté ici, volontairement : il tire
 * `react-force-graph-3d` et Three.js (~600 Ko–1 Mo). Le ré-exporter suffirait à faire
 * entrer Three.js dans le bundle de départ de toute page qui importe ne serait-ce que la
 * légende — un `lazy()` côté page ne rattraperait rien (constaté au build : 3,6 Mo).
 *
 * Le canvas vit dans son propre sous-chemin : `@zetis/ui/galaxy/canvas`, à importer en
 * `lazy()`. Même logique que `@zetis/ui/mindmap` pour React Flow, poussée d'un cran.
 */
export { GalaxyFallbackList } from "./GalaxyFallbackList";
export type { GalaxyFallbackListProps } from "./GalaxyFallbackList";
export { GalaxyLegend } from "./GalaxyLegend";
export type { GalaxyLegendProps } from "./GalaxyLegend";
export { hasWebGL } from "./webgl";
export {
  ANCESTOR_LEAD,
  BIRTH,
  STAR_CADENCE,
  bornAt,
  litCountAt,
  radialTreeLayout,
  revealSchedule,
} from "./replayLayout";
export type { RevealSchedule, Vec3 } from "./replayLayout";
export {
  CORE_IN,
  ORBIT_DRAW,
  PLANET_STAGGER,
  PLANET_TRAVEL,
  arrivalDuration,
  coreOpacity,
  easeOutCubic,
  planetBirth,
  planetIsBorn,
  planetPosition,
  planetProgress,
  ringOpacity,
} from "./arrivalTween";
export {
  MAX_PARTICLES_PER_LINK,
  PARTICLE_BUDGET,
  PARTICLE_FPS_FLOOR,
  isLit,
  linkKey,
  litLinkIds,
  normalizeSearch,
  particleAllowance,
  particlesFor,
  searchMatches,
  statusCounts,
} from "./galaxyGraph";
export {
  CHAPTER_COLOR,
  GOLD,
  GOLD_BRIGHT,
  LINK_DIM,
  STAR_STYLES,
  STATUS_ORDER,
  SUBJECT_COLOR,
  dim,
  starStyle,
} from "./galaxyTheme";
export type { StarStyle } from "./galaxyTheme";
