/**
 * Le dessin du bandeau — sans React, sans DOM réel, testable avec un faux contexte 2D.
 *
 * Deux régimes, et ils n'ont pas le même coût :
 *
 * **La construction** (`drawAt`) se joue à angle nul, donc les étoiles ne bougent plus une fois
 * arrivées. On les blitte alors UNE FOIS sur un calque hors écran, et chaque image ne coûte que
 * ce calque + les étoiles encore en vol (≤ `IN_FLIGHT_BUDGET`). Le coût par image ne dépend pas
 * du nombre de notions.
 *
 * **La vie** (`drawAlive`) fait TOURNER la galaxie : tout bouge, donc le calque ne sert plus et on
 * redessine chaque étoile. ⚠️ Le coût redevient proportionnel à N — c'est le prix explicite de la
 * rotation, demandée après avoir vu le bandeau figé. Il reste très inférieur à ce qu'on a retiré :
 * ~202 blits de sprite à 20 im/s, sans le moindre flou, contre ~38 éléments **filtrés** repeints
 * à 60 im/s par `NeuralCubes` et `NeuralLinks`.
 *
 * ⚠️ INTERDITS, et un test le verrouille : `ctx.shadowBlur` et `ctx.filter`. Ce sont des flous
 * gaussiens appliqués PAR APPEL DE DESSIN — 10 à 50× le coût d'un `fill()`. C'est exactement la
 * faute de `hfx-twinkle` (qui animait `filter: drop-shadow`), transposée en canvas. La lueur vient
 * de sprites pré-rendus une fois au montage.
 */
import type { GalaxyEdge, GalaxyNode, GalaxyStatus } from "@zetis/types";
import {
  CHAPTER_COLOR,
  GOLD,
  LINK_DIM,
  STAR_STYLES,
  SUBJECT_COLOR,
  easeOutCubic,
  starStyle,
} from "@zetis/ui/galaxy";
import {
  type BandOptions,
  type BandPoint,
  type ScreenPoint,
  projectBandPoint,
} from "./headerBandLayout";
import type { HeaderClock } from "./headerGalaxyClock";

/** Côté du sprite d'étoile, en pixels CSS. Assez pour un dégradé doux, assez petit pour être blitté. */
const SPRITE = 16;
/** Rayon dessiné par profondeur : racine, matière, chapitre, notion. La bande fait 96 px. */
const RADIUS = [3.6, 2.8, 2.2, 1.7];
/** Une notion pas encore travaillée : présente, mais discrète. */
const DORMANT_RADIUS = 1.1;
/** Opacité des arêtes de charpente. Au-delà, le bandeau devient un plat de spaghettis. */
const EDGE_ALPHA = 0.22;
/** Un tour complet. Très lent : une galaxie tourne, elle ne pivote pas. */
export const ROTATION_PERIOD = 72_000;
/** Cadence de la vie : 20 im/s suffisent pour une dérive, 60 seraient du gâchis. */
export const BREATH_FRAME_MS = 50;
/** Période du scintillement, superposé à la rotation. */
const BREATH_PERIOD = 2600;
/** Combien d'étoiles scintillent en plus de la rotation. C'est un budget de particules. */
export const BREATH_STARS = 24;
/**
 * Ce que coûte une image de CONSTRUCTION avant la moindre étoile : le calque posé + la couronne.
 *
 * Exporté pour que les tests comptent au même barème que le code, plutôt qu'avec des `+ 1`
 * dispersés qu'on ajusterait un à un — c'est ainsi qu'un budget se relâche sans que personne ne
 * le décide.
 */
export const FIXED_FRAME_DRAWS = 2;
/** Rayon de la couronne solaire. L'emblème fait 42 px de rayon : elle déborde largement. */
const CORONA_RADIUS = 74;
/** Côté du sprite de couronne. Un dégradé se met à l'échelle sans qu'on voie la différence. */
const CORONA_SPRITE = 64;
/** Le temps que met le soleil à s'allumer, au tout début de la construction. */
const CORONA_RAMP = 700;

export interface RendererDeps {
  ctx: CanvasRenderingContext2D;
  /** Fabrique un calque hors écran. Injecté : jsdom ne sait pas peindre. */
  makeLayer: (width: number, height: number) => CanvasRenderingContext2D | null;
}

interface Star {
  id: string;
  at: number;
  point: BandPoint;
  from: BandPoint;
  color: string;
  radius: number;
  /** Notion que Massimo n'a pas encore travaillée : elle est là, en veilleuse. */
  dormant: boolean;
}

function colorOf(node: GalaxyNode, depth: number): string {
  if (node.kind === "skill") return starStyle(node.status as GalaxyStatus | undefined).color;
  if (node.kind === "chapter") return CHAPTER_COLOR;
  if (node.kind === "subject") return SUBJECT_COLOR;
  return depth === 0 ? GOLD : SUBJECT_COLOR;
}

export class HeaderGalaxyRenderer {
  private readonly deps: RendererDeps;
  private readonly clock: HeaderClock;
  private readonly band: BandOptions;
  /** Trié par instant de naissance : le curseur avance, il ne cherche jamais. */
  private readonly stars: Star[];
  /** Charpente seulement : `root→matière` et `matière→chapitre`. */
  private readonly beams: { from: BandPoint; to: BandPoint; at: number; lit: boolean }[];
  private readonly breathers: Star[];
  /** Les identifiants des respirantes, calculés une fois — pas un `Set` reconstruit par image. */
  private readonly twinkling: Set<string>;
  private readonly core: BandPoint | null;
  /** Le plus grand rayon dans le plan — sert à normaliser l'indice de profondeur. */
  private readonly reach: number;
  private readonly sprites = new Map<string, CanvasImageSource>();
  private corona: CanvasImageSource | null = null;
  private layer: CanvasRenderingContext2D | null = null;
  /** Index de la première étoile pas encore posée sur le calque. Ne recule JAMAIS. */
  private settled = 0;
  private settledBeams = 0;

  constructor(
    deps: RendererDeps,
    nodes: readonly GalaxyNode[],
    edges: readonly GalaxyEdge[],
    layout: Map<string, BandPoint>,
    clock: HeaderClock,
    band: BandOptions,
  ) {
    this.deps = deps;
    this.clock = clock;
    this.band = band;

    const parentOf = new Map<string, string>();
    for (const edge of edges) {
      if (!parentOf.has(edge.target)) parentOf.set(edge.target, edge.source);
    }

    this.stars = [];
    for (const node of nodes) {
      const point = layout.get(node.id);
      if (!point) continue;
      const at = clock.bornAtWall.get(node.id);
      // ⚠️ TOUT LE CIEL EST DESSINÉ, pas seulement ce que Massimo a travaillé.
      //
      // Mesuré à l'écran le 2026-08-04 : le graphe réel fait 202 nœuds pour 47 notions ayant une
      // date de première fois. N'en dessiner que 47 laissait la bande vide à 77 %. Les notions
      // encore à découvrir sont donc présentes, en veilleuse (`unknown`, « À découvrir ») : elles
      // peuplent le ciel, et celles de Massimo ressortent par CONTRASTE, pas par la taille.
      const dormant = at === undefined;
      const parent = parentOf.get(node.id);
      this.stars.push({
        id: node.id,
        // Sans calendrier, l'étoile est là depuis toujours : elle se pose à la première image et
        // ne voyage pas. C'est un fond de ciel, pas une naissance.
        at: dormant ? Number.NEGATIVE_INFINITY : (at as number),
        point,
        from: dormant ? point : (parent && layout.get(parent)) || point,
        color: dormant ? STAR_STYLES.unknown.color : colorOf(node, point.depth),
        radius: dormant ? DORMANT_RADIUS : RADIUS[Math.min(point.depth, RADIUS.length - 1)],
        dormant,
      });
    }
    this.stars.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));

    // Les respirantes : un sous-ensemble RÉGULIER des allumées, pris au pas constant pour rester
    // déterministe et réparti. Jamais les dormantes — une notion à découvrir ne doit pas attirer
    // l'œil autant qu'une notion acquise.
    const lit = this.stars.filter((star) => !star.dormant);
    const stride = Math.max(1, Math.ceil(lit.length / BREATH_STARS));
    this.breathers = lit.filter((_, index) => index % stride === 0).slice(0, BREATH_STARS);
    this.twinkling = new Set(this.breathers.map((star) => star.id));

    this.beams = [];
    for (const edge of edges) {
      const from = layout.get(edge.source);
      const to = layout.get(edge.target);
      if (!from || !to) continue;
      // ⚠️ CHARPENTE SEULEMENT. À l'échelle du bandeau, un lien chapitre→notion fait ~6 px : du
      // bruit, pas de l'information. Couper des ARÊTES est une coupe de particules (autorisée par
      // l'addendum ADR-0024 §2) ; couper des ÉTOILES serait le plafond interdit par le §1.
      if (to.depth > 2) continue;
      this.beams.push({
        from,
        to,
        at: clock.bornAtWall.get(edge.target) ?? Number.NEGATIVE_INFINITY,
        lit: to.depth <= 1,
      });
    }
    this.beams.sort((a, b) => a.at - b.at);

    this.core = this.stars.find((star) => star.point.depth === 0)?.point ?? null;
    this.reach = this.stars.reduce(
      (max, star) => Math.max(max, Math.hypot(star.point.u, star.point.v)),
      1,
    );

    for (const status of ["unknown", "weak", "learning", "solid", "mastered"] as GalaxyStatus[]) {
      this.makeSprite(starStyle(status).color);
    }
    for (const color of [GOLD, SUBJECT_COLOR, CHAPTER_COLOR]) this.makeSprite(color);
    this.makeCorona();
  }

  /** Un dégradé radial, calculé UNE FOIS. Ensuite, ce ne sont plus que des `drawImage`. */
  private makeSprite(color: string): void {
    if (this.sprites.has(color)) return;
    const layer = this.deps.makeLayer(SPRITE, SPRITE);
    if (!layer) return;
    const half = SPRITE / 2;
    const gradient = layer.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.35, color);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    layer.fillStyle = gradient;
    layer.fillRect(0, 0, SPRITE, SPRITE);
    this.sprites.set(color, layer.canvas);
  }

  /**
   * La couronne solaire, calculée une fois.
   *
   * Cinq arrêts plutôt que deux : un cœur presque plein, une décroissance lente, puis le vide.
   * Avec un seul palier on obtient un disque flou ; avec celui-ci, une couronne — de la lumière
   * qui s'éteint en s'éloignant, comme celle d'une étoile. Paliers relevés le 2026-08-04, le halo
   * se noyait dans l'emblème.
   */
  private makeCorona(): void {
    const layer = this.deps.makeLayer(CORONA_SPRITE, CORONA_SPRITE);
    if (!layer) return;
    const half = CORONA_SPRITE / 2;
    const gradient = layer.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, "rgba(255, 246, 208, 1)");
    gradient.addColorStop(0.16, "rgba(255, 209, 88, 0.78)");
    gradient.addColorStop(0.42, "rgba(240, 176, 44, 0.36)");
    gradient.addColorStop(0.72, "rgba(214, 145, 28, 0.12)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    layer.fillStyle = gradient;
    layer.fillRect(0, 0, CORONA_SPRITE, CORONA_SPRITE);
    this.corona = layer.canvas;
  }

  private at(point: BandPoint, angle: number): ScreenPoint {
    return projectBandPoint(point, angle, this.band);
  }

  /** Pose la couronne autour du cœur. `intensity` 0 → éteinte, 1 → pleine. */
  private drawCorona(ctx: CanvasRenderingContext2D, intensity: number, angle: number): void {
    if (!this.corona || !this.core || intensity <= 0) return;
    const here = this.at(this.core, angle);
    const r = CORONA_RADIUS * (0.82 + 0.18 * intensity);
    ctx.globalAlpha = Math.min(1, intensity);
    ctx.drawImage(this.corona, here.x - r, here.y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  private star(
    ctx: CanvasRenderingContext2D,
    star: Star,
    x: number,
    y: number,
    scale: number,
  ): void {
    const sprite = this.sprites.get(star.color);
    const r = star.radius * scale * 2.6;
    if (sprite) ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
    else {
      // Repli sans sprite (calque hors écran indisponible) : un disque plat vaut mieux qu'un
      // bandeau vide. Toujours pas de `shadowBlur` — le repli ne rouvre pas l'interdit.
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.5, star.radius * scale), 0, Math.PI * 2);
      ctx.fillStyle = star.color;
      ctx.fill();
    }
  }

  private beam(ctx: CanvasRenderingContext2D, index: number, progress: number, angle: number): void {
    const { from, to, lit } = this.beams[index];
    const a = this.at(from, angle);
    const b = this.at(to, angle);
    const t = Math.min(1, Math.max(0, progress));
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    ctx.strokeStyle = lit ? GOLD : LINK_DIM;
    ctx.globalAlpha = EDGE_ALPHA;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Pose sur le calque tout ce qui est arrivé — une seule fois par étoile et par arête. */
  private settle(elapsed: number): void {
    if (!this.layer) {
      this.layer = this.deps.makeLayer(this.band.width, this.band.height);
      if (this.layer) this.layer.globalCompositeOperation = "lighter";
    }
    const layer = this.layer;
    if (!layer) return;
    const settledBy = elapsed - this.clock.birthWall;
    while (this.settled < this.stars.length && this.stars[this.settled].at <= settledBy) {
      const star = this.stars[this.settled];
      const here = this.at(star.point, 0);
      this.star(layer, star, here.x, here.y, 1);
      this.settled += 1;
    }
    while (this.settledBeams < this.beams.length && this.beams[this.settledBeams].at <= settledBy) {
      this.beam(layer, this.settledBeams, 1, 0);
      this.settledBeams += 1;
    }
  }

  /**
   * La CONSTRUCTION, à angle nul. Rend `true` s'il reste du travail.
   *
   * ⚠️ Le curseur `settled` ne recule jamais : c'est ce qui rend le coût indépendant de N pendant
   * cette phase. Ne pas « simplifier » en redessinant tout à chaque image — c'est le défaut
   * consigné dans `TROUBLESHOOTING.md` (« Réassigner `graphData` à chaque image »), transposé.
   */
  drawAt(elapsed: number): boolean {
    const { ctx } = this.deps;
    this.settle(elapsed);

    ctx.clearRect(0, 0, this.band.width, this.band.height);
    ctx.globalCompositeOperation = "lighter";
    if (this.layer) ctx.drawImage(this.layer.canvas, 0, 0, this.band.width, this.band.height);
    // Le soleil s'allume d'abord : la galaxie sort de quelque chose, elle n'apparaît pas.
    this.drawCorona(ctx, Math.min(1, Math.max(0, elapsed / CORONA_RAMP)), 0);

    for (let i = this.settledBeams; i < this.beams.length; i += 1) {
      const age = elapsed - this.beams[i].at;
      if (age < 0) break;
      this.beam(ctx, i, age / this.clock.birthWall, 0);
    }

    let flying = 0;
    for (let i = this.settled; i < this.stars.length; i += 1) {
      const star = this.stars[i];
      const age = elapsed - star.at;
      if (age < 0) break; // trié : au-delà, rien n'est né
      const t = easeOutCubic(Math.min(1, age / this.clock.birthWall));
      const from = this.at(star.from, 0);
      const to = this.at(star.point, 0);
      this.star(ctx, star, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, 0.6 + 0.4 * t);
      flying += 1;
    }

    ctx.globalCompositeOperation = "source-over";
    return elapsed < this.clock.total || flying > 0;
  }

  /**
   * LA VIE : la galaxie tourne, et quelques étoiles scintillent.
   *
   * ⚠️ Le calque posé ne sert plus ici — tout bouge, donc tout se redessine. Le coût redevient
   * proportionnel à N, et c'est le prix assumé de la rotation. `dispose()` libère le calque au
   * passage à ce régime : ce qui est perdu en coût par image est repris en mémoire.
   *
   * La profondeur n'est pas décorative : une étoile qui passe DEVANT le cœur est un peu plus
   * grosse et plus vive que celle qui passe derrière. C'est ce qui fait qu'on lit une rotation
   * plutôt qu'un glissement latéral.
   */
  drawAlive(elapsed: number): void {
    const { ctx } = this.deps;
    const angle = (elapsed / ROTATION_PERIOD) * Math.PI * 2;
    const breath = Math.sin((elapsed / BREATH_PERIOD) * Math.PI * 2);

    ctx.clearRect(0, 0, this.band.width, this.band.height);
    ctx.globalCompositeOperation = "lighter";
    // La couronne respire à la même horloge que les étoiles : le soleil et sa galaxie sont un
    // seul objet, pas deux effets qui battent chacun dans leur coin.
    this.drawCorona(ctx, 0.78 + 0.22 * breath, angle);
    for (let i = 0; i < this.beams.length; i += 1) this.beam(ctx, i, 1, angle);

    for (const star of this.stars) {
      const here = this.at(star.point, angle);
      const near = here.depthCue / this.reach; // −1 derrière, +1 devant
      const depthScale = 0.78 + 0.22 * near;
      const pulse = this.twinkling.has(star.id) ? 0.12 * breath : 0;
      this.star(ctx, star, here.x, here.y, Math.max(0.2, depthScale + pulse));
    }
    ctx.globalCompositeOperation = "source-over";
  }

  /**
   * L'état final, en une passe, sans trajet ni rotation.
   *
   * C'est le chemin de `prefers-reduced-motion` : l'addendum ADR-0029 §6 veut l'état final
   * d'emblée, et une galaxie qui tourne n'en est pas un.
   */
  drawFinal(): void {
    const { ctx } = this.deps;
    ctx.clearRect(0, 0, this.band.width, this.band.height);
    ctx.globalCompositeOperation = "lighter";
    this.drawCorona(ctx, 1, 0);
    for (let i = 0; i < this.beams.length; i += 1) this.beam(ctx, i, 1, 0);
    for (const star of this.stars) {
      const here = this.at(star.point, 0);
      this.star(ctx, star, here.x, here.y, 1);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  /** Libère le calque posé — il n'a plus de raison d'exister dès que la galaxie tourne. */
  dispose(): void {
    if (this.layer) {
      this.layer.canvas.width = 0;
      this.layer.canvas.height = 0;
      this.layer = null;
    }
    this.settled = 0;
    this.settledBeams = 0;
  }
}
