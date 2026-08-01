/**
 * Canvas 3D de ZETIS Galaxy (ADR-0024 §3).
 *
 * Contrat repris de `MindmapWorkspace` : **zéro fetch, zéro logique métier**. Le composant
 * rend ce qu'on lui donne et remonte les clics. Toute la maîtrise vient du serveur.
 *
 * Trois obligations, pas des options (ADR-0024 §6) :
 * - `prefers-reduced-motion` fige le moteur de forces et coupe la rotation de caméra ;
 * - sans WebGL, on ne rend RIEN ici — l'appelant affiche son repli en liste ;
 * - le drag de nœud est actif : Massimo peut étirer une étoile, les liens suivent.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import {
  AdditiveBlending,
  BackSide,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  RingGeometry,
  SphereGeometry,
  type Object3D,
} from "three";
import SpriteText from "three-spritetext";
import type { GalaxyEdge, GalaxyNode, GalaxyStatus } from "@zetis/types";
import { BRAIN_LOBE, BRAIN_LOBES, BRAIN_LOBE_SCALE } from "./brainGeometry";
import { orbitLayout } from "./orbitLayout";
import {
  PARTICLE_FPS_FLOOR,
  linkKey,
  litLinkIds,
  particleAllowance,
  particlesFor,
} from "./galaxyGraph";
import {
  arrivalDuration,
  easeOutCubic,
  planetIsBorn,
  planetPosition,
  ringOpacity,
} from "./arrivalTween";
import { BIRTH } from "./replayLayout";
import {
  CHAPTER_COLOR,
  GOLD,
  GOLD_BRIGHT,
  LINK_DIM,
  NERVE,
  NERVE_BRIGHT,
  SUBJECT_COLOR,
  dim,
  starStyle,
} from "./galaxyTheme";

export interface GalaxyCanvasProps {
  nodes: GalaxyNode[];
  edges: GalaxyEdge[];
  /** Remonté au clic sur une ÉTOILE uniquement (un amas n'ouvre pas de panneau). */
  onNodeClick?: (node: GalaxyNode) => void;
  /** Clic dans le vide, entre les étoiles. Sert à agrandir / refermer, jamais à naviguer. */
  onBackgroundClick?: () => void;
  /** Étoile sélectionnée — reçoit un anneau de sélection. */
  selectedId?: string | null;
  /** État mis en évidence par la légende. Les autres sont ATTÉNUÉS, jamais masqués. */
  highlightStatus?: GalaxyStatus | null;
  /** Ids d'étoiles trouvées par la recherche : mises en avant, et la caméra les cadre. */
  matchedIds?: Set<string> | null;
  /**
   * Positions IMPOSÉES, par id — le rejeu construit depuis `root` (addendum ADR-0029 §2).
   *
   * Quand elle est fournie, le moteur de forces est neutralisé et chaque nœud est épinglé à sa
   * place calculée. Un nœud qui APPARAÎT naît aux coordonnées de son parent et rejoint la
   * sienne en `BIRTH` ms : c'est ce qui fait lire une croissance et non un surgissement.
   *
   * Pourquoi imposer plutôt que laisser converger : `three-forcegraph` réchauffe la simulation
   * à `alpha(1)` à CHAQUE changement de `graphData`, et n'expose aucun moyen de l'en empêcher.
   * Une croissance nœud par nœud sur simulation vivante ré-explose donc à chaque étoile.
   */
  pinned?: Map<string, { x: number; y: number; z: number }> | null;
  /**
   * `"force"` (défaut) : simulation de forces — le rendu d'une constellation, où l'on ne sait
   * pas d'avance combien d'étoiles il y aura.
   *
   * `"orbit"` : les matières sont POSÉES sur des orbites autour du cœur, dans un plan aplati,
   * et chaque orbite est dessinée. C'est la vue d'arrivée de `/galaxy` — une composition, pas
   * un équilibre : avec le cerveau et huit matières, le moteur de forces produisait un amas où
   * le cœur était à moitié enseveli.
   */
  layout?: "force" | "orbit";
  /**
   * Portée du « une fois par visite » de l'animation d'arrivée.
   *
   * Deux surfaces montent la vue en orbite — `/galaxy` et la carte d'Accueil — et elles ne
   * doivent pas se voler leur arrivée : sans portée distincte, ouvrir l'Accueil consommerait
   * celle de `/galaxy`, qui s'afficherait alors composée d'emblée.
   */
  arrivalScope?: string;
  /**
   * Rang d'arrivée par nœud — tout ce qui descend d'une matière porte LE rang de sa matière.
   *
   * Sans lui, l'animation d'arrivée sortirait les nœuds un par un dans l'ordre où ils arrivent :
   * une constellation se disloquerait en vol. Avec lui, chaque matière emmène ses chapitres et
   * ses notions d'un seul tenant.
   */
  arrivalOrder?: Map<string, number> | null;
  /**
   * Rayons des anneaux d'orbite à dessiner, du plus proche au plus lointain.
   *
   * Sans lui, un anneau est tracé par MATIÈRE (le système solaire du §C). Avec lui, les anneaux
   * sont **concentriques** et marquent les étages — matières, chapitres, notions.
   */
  orbitRings?: number[] | null;
  height?: number;
}

/** Force du fondu appliqué à ce qui n'est pas concerné par le filtre. */
const DIM_AMOUNT = 0.82;

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Le centre : là où naît `root`, et le repli quand un nœud n'a pas de parent connu. */
const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

/** Opacité pleine d'un trait d'orbite : présent, jamais appuyé — c'est du décor. */
const RING_OPACITY = 0.16;

/**
 * Clé de session : l'arrivée joue UNE FOIS PAR VISITE.
 *
 * Revoir la même chorégraphie à chaque aller-retour vers une constellation, ce serait
 * l'animation subie qu'on bannit partout ailleurs (addendum ADR-0024 §3). `sessionStorage`
 * et non `localStorage` : à la visite suivante, la galaxie a le droit de renaître.
 */
const ARRIVAL_KEY = "zetis.galaxy.arrival";

function arrivalAlreadyPlayed(scope: string): boolean {
  try {
    return window.sessionStorage?.getItem(`${ARRIVAL_KEY}.${scope}`) === "1";
  } catch {
    // Navigation privée, stockage refusé : on rejoue l'arrivée plutôt que de planter.
    return false;
  }
}

function rememberArrival(scope: string): void {
  try {
    window.sessionStorage?.setItem(`${ARRIVAL_KEY}.${scope}`, "1");
  } catch {
    /* sans stockage, l'arrivée rejouera — c'est le défaut le moins grave. */
  }
}

// Volumes des repères. En construisant nous-mêmes les sphères, `nodeVal` et `nodeRelSize`
// ne s'appliquent plus : on reproduit ici la formule de la lib (`∛volume × rayon de base`),
// sinon les étoiles rapetissent d'un coup et redeviennent inatteignables au doigt.
const NODE_VOLUME: Record<string, number> = { subject: 11, chapter: 7 };
const REL_SIZE = 6;
const radiusOf = (volume: number) => Math.cbrt(volume) * REL_SIZE;

/** Géométrie partagée par toutes les étoiles — une seule allocation, mise à l'échelle ensuite. */
const SPHERE = new SphereGeometry(1, 32, 24);

// Le cœur et les amas ne portent pas d'état de maîtrise : ce sont des repères, pas des
// notions. Seule une étoile a une luminosité.
const NODE_COLOR: Record<string, string> = { subject: SUBJECT_COLOR, chapter: CHAPTER_COLOR };

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function GalaxyCanvas({
  nodes,
  edges,
  onNodeClick,
  onBackgroundClick,
  selectedId = null,
  highlightStatus = null,
  matchedIds = null,
  layout = "force",
  pinned = null,
  arrivalScope = "galaxy",
  arrivalOrder = null,
  orbitRings = null,
  height = 540,
}: GalaxyCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  /** Les anneaux d'orbite, partagés entre l'effet qui les crée et celui qui les trace. */
  const ringsRef = useRef<Mesh[]>([]);
  /** Objets nœuds réutilisés d'un rendu à l'autre — c'est leur IDENTITÉ qui porte la position. */
  const nodeCacheRef = useRef(new Map<string, any>());
  /** Ce qui était déjà à l'écran, pour distinguer une NAISSANCE d'un simple re-rendu. */
  const seenRef = useRef(new Set<string>());
  /** Lu par `handleEngineStop`, dont les dépendances sont vides par construction. */
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;
  const [width, setWidth] = useState(0);
  const reduced = useMemo(prefersReducedMotion, []);

  // ── Garde de perf n°1 : le flux doré s'éteint si l'appareil décroche ────────────────
  //
  // Remplace le plafond de nœuds supprimé le 2026-07-31 (addendum ADR-0024 §2). On mesure
  // le framerate réel plutôt que de deviner la puissance de l'appareil d'après la largeur
  // de son écran — c'est précisément la supposition qui rendait l'ancien plafond
  // indéfendable. Et ce qui tombe, c'est le DÉCOR, jamais une étoile de Massimo.
  //
  // Sans retour en arrière : une fois dégradé, on y reste pour la durée de la vue. Un seuil
  // qu'on repasse dans les deux sens ferait clignoter le flux, ce qui est pire que son
  // absence.
  const [degraded, setDegraded] = useState(false);
  useEffect(() => {
    if (reduced || degraded) return;
    let frames = 0;
    let since = performance.now();
    let raf = 0;
    const tick = () => {
      frames += 1;
      const now = performance.now();
      const span = now - since;
      // On juge sur une seconde pleine : un à-coup isolé (un GC, un onglet qui reprend la
      // main) ne doit pas éteindre le flux pour de bon.
      if (span >= 1000) {
        if ((frames * 1000) / span < PARTICLE_FPS_FLOOR) {
          setDegraded(true);
          return;
        }
        frames = 0;
        since = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, degraded]);


  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Écartement des étoiles. Les réglages par défaut tassent les nœuds les uns sur les
  // autres dès qu'un amas a une dizaine de notions : les sphères se recouvrent et les noms
  // deviennent illisibles. On repousse, pour que chaque étoile soit lisible ET atteignable
  // au doigt.
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph?.d3Force) return;
    // En orbite, on ne cherche pas un équilibre : les positions sont IMPOSÉES (`fx/fy/fz`
    // ci-dessous), donc les forces n'ont rien à faire — les laisser actives ferait vibrer les
    // planètes autour de leur point fixe.
    // Positions imposées — orbite, ou rejeu construit depuis `root` : les forces n'ont rien à
    // faire. Les laisser actives ferait vibrer les nœuds autour de leur point fixe.
    if (layout === "orbit" || pinned) {
      graph.d3Force("charge")?.strength(0);
      graph.d3Force("link")?.distance(0);
      return;
    }
    graph.d3Force("charge")?.strength(-190);
    graph.d3Force("link")?.distance(62);
    graph.d3ReheatSimulation?.();
  }, [nodes, edges, layout]);

  // ── Vue en orbite : les positions des matières, imposées ────────────────────────────
  //
  // Le placement est calculé ici et injecté dans `data` (plus bas) : c'est le seul chemin
  // fiable, `graphData()` n'étant pas exposée par cette version de la lib.
  const orbits = useMemo(() => {
    if (layout !== "orbit") return new Map<string, { x: number; y: number; z: number }>();
    const subjects = nodes.filter((n) => n.kind === "subject").map((n) => n.id);
    return new Map(orbitLayout(subjects).map((p) => [p.id, { x: p.x, y: p.y, z: p.z }]));
  }, [layout, nodes]);

  // ── Les anneaux d'orbite ────────────────────────────────────────────────────────────
  //
  // Ajoutés directement à la scène : ce ne sont pas des nœuds du graphe (ils ne se cliquent
  // pas, ne portent aucune donnée), seulement le décor qui rend l'idée d'orbite lisible.
  useEffect(() => {
    const graph = graphRef.current;
    if (layout !== "orbit" || typeof graph?.scene !== "function" || width === 0) return;

    // Deux façons de tracer les anneaux, et elles ne disent pas la même chose : un anneau PAR
    // MATIÈRE (chacune sur son orbite), ou des anneaux CONCENTRIQUES marquant les étages —
    // matières, chapitres, notions. Le second est celui de la galaxie complète.
    const radii =
      orbitRings ??
      orbitLayout(nodes.filter((n) => n.kind === "subject").map((n) => n.id)).map(
        (p) => p.radius,
      );

    // La caméra est placée EN SURPLOMB, pas dans le plan : vue par la tranche, un système
    // solaire se lit comme une ligne droite et les anneaux disparaissent (constaté au rendu).
    // ~35° d'élévation, l'angle auquel un disque se lit comme un disque.
    const far = (radii.at(-1) ?? 200) * 2.1;
    graph.cameraPosition?.({ x: 0, y: far * 0.62, z: far }, { x: 0, y: 0, z: 0 }, 0);

    const scene = graph.scene();
    const rings = radii.map((radius) => {
      const ring = new Mesh(
        new RingGeometry(radius - 0.6, radius + 0.6, 96),
        new MeshBasicMaterial({
          color: "#6d8bff",
          transparent: true,
          // Naît INVISIBLE : l'anneau se trace derrière sa planète, à son arrivée, jamais
          // avant (addendum ADR-0024 §3 et §4). C'est l'effet d'arrivée qui le fait monter
          // jusqu'à `RING_OPACITY` — et qui l'y met d'emblée quand il n'y a pas d'arrivée
          // à jouer (mouvement réduit, ou retour d'une constellation).
          opacity: 0,
          side: DoubleSide,
          depthWrite: false,
        }),
      );
      // Le `RingGeometry` naît dans le plan XY : on le couche pour qu'il devienne l'écliptique.
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);
      return ring;
    });
    ringsRef.current = rings;

    return () => {
      ringsRef.current = [];
      for (const ring of rings) {
        scene.remove(ring);
        ring.geometry.dispose();
        (ring.material as { dispose: () => void }).dispose();
      }
    };
  }, [layout, nodes, width, orbitRings]);

  // Rotation de la constellation. `controlType="orbit"` expose `autoRotate` ; le moteur de
  // rendu appelle déjà `controls.update(delta)` à chaque frame, donc aucune boucle
  // d'animation à écrire ici.
  //
  // Deux conditions d'arrêt :
  // - `prefers-reduced-motion` — obligation ferme, jamais assouplie (ADR-0024 §6) ;
  // - une étoile ouverte — sinon la cible que Massimo vient de toucher s'échappe pendant
  //   qu'il lit son panneau. Ça repart à la fermeture.
  // ⚠️ `width` DOIT rester dans les dépendances : le `<ForceGraph3D>` n'est monté que lorsque
  // `width > 0`. Sans cette dépendance, l'effet ne s'exécute qu'avant le montage, ne trouve
  // aucun contrôle, et n'est jamais rejoué — la rotation ne démarre alors jamais.
  useEffect(() => {
    const controls = graphRef.current?.controls?.();
    if (!controls) return;
    controls.autoRotate = !reduced && !selectedId;
    controls.autoRotateSpeed = 1.2;
  }, [reduced, selectedId, nodes, width]);

  // Sous `prefers-reduced-motion`, on laisse le moteur de forces se stabiliser puis on le FIGE.
  useEffect(() => {
    if (!reduced || !graphRef.current) return;
    const timer = window.setTimeout(() => graphRef.current?.pauseAnimation?.(), 600);
    return () => window.clearTimeout(timer);
  }, [reduced, nodes]);

  // Étiquette 3D d'un nœud. Un amas (chapitre) est écrit plus gros et plus haut : c'est le
  // repère, pas la destination.
  // Chaque nœud est une VRAIE sphère : matériau spéculaire (reflet net d'un côté, ombre de
  // l'autre) et légère émission pour les étoiles allumées, qui doivent rayonner par
  // elles-mêmes. Le matériau par défaut de la lib est purement diffus : sans reflet, une
  // sphère se lit comme une pastille découpée, quel que soit l'éclairage.
  const nodeObject = useCallback(
    (n: any): Object3D => {
      const group = new Group();

      // ── Le soleil de la constellation : la matière elle-même ──────────────────────
      // Sphère texturée de son pictogramme de marque (le même que partout ailleurs), et
      // couronne dorée. C'est le point fixe autour duquel tout le reste s'organise.
      // Le cœur du graphe global : le SAVOIR de Massimo, rendu comme un cerveau de lumière.
      // Deux lobes à circonvolutions, générés par le code (aucun maillage à charger).
      // Ce n'est pas une destination — c'est le point qui empêche les matières de se
      // disperser, et l'image de ce que la galaxie représente.
      if (n.kind === "root") {
        // En orbite, le cerveau est le SOLEIL : à la taille d'une matière il se lit comme un
        // nœud parmi d'autres, alors que tout est censé graviter autour de lui.
        const radius = radiusOf(NODE_VOLUME.subject) * (layout === "orbit" ? 2.4 : 0.85);
        const material = new MeshPhongMaterial({
          color: "#a9b6ff",
          // Émission FAIBLE : au-delà, les plis s'auto-éclairent uniformément et le cerveau
          // redevient une masse lisse (même piège que le soleil des matières).
          emissive: "#2f3a72",
          emissiveIntensity: 0.35,
          specular: "#ffffff",
          shininess: 45,
        });
        // Le cerveau PULSE : c'est la seule chose vivante au centre de la galaxie.
        material.userData.brainCore = { base: 0.35 };
        for (const { x, tilt } of BRAIN_LOBES) {
          const half = new Mesh(BRAIN_LOBE, material);
          half.scale.set(
            radius * BRAIN_LOBE_SCALE.x,
            radius * BRAIN_LOBE_SCALE.y,
            radius * BRAIN_LOBE_SCALE.z,
          );
          half.position.set(x * radius, 0, 0);
          half.rotation.z = tilt;
          group.add(half);
        }

        // L'éclat est porté par des AURES, pas par la surface : monter l'émission du
        // matériau aplatirait les circonvolutions (piège déjà rencontré sur le soleil).
        // Trois coques électriques, du cyan proche au violet lointain — sidéral.
        const auras = [
          { factor: 1.35, opacity: 0.3, color: "#22d3ee" },
          { factor: 1.9, opacity: 0.16, color: "#6d8bff" },
          { factor: 2.6, opacity: 0.08, color: "#a855f7" },
        ];
        for (const { factor, opacity, color } of auras) {
          const aura = new Mesh(
            SPHERE,
            new MeshBasicMaterial({
              color,
              transparent: true,
              opacity,
              side: BackSide,
              blending: AdditiveBlending,
              depthWrite: false,
            }),
          );
          aura.scale.setScalar(radius * factor);
          aura.userData.brainAura = { base: radius * factor, opacity };
          group.add(aura);
        }
        return group;
      }

      if (n.kind === "subject") {
        // À peine plus gros qu'un amas : dans l'espace, une étoile n'écrase pas ce qui
        // l'entoure par sa TAILLE, elle se distingue par son ÉCLAT.
        const sunRadius = radiusOf(NODE_VOLUME.subject);
        const sun = new Mesh(
          SPHERE,
          new MeshPhongMaterial({
            color: "#f0bd57",
            // ⚠️ Émission FAIBLE, à dessein. Un matériau très émissif s'éclaire lui-même de
            // façon uniforme : plus de côté clair ni de côté sombre, plus de reflet — la
            // sphère redevient un disque plat. Le doré vient de la couleur, le volume vient
            // de l'ombrage, et c'est le volume qu'on veut voir.
            emissive: "#8a5f14",
            emissiveIntensity: 0.25,
            specular: "#fff6dd",
            shininess: 70,
          }),
        );
        sun.scale.setScalar(sunRadius);
        group.add(sun);

        // Pas de pictogramme sur le soleil, et c'est un choix : un panneau face caméra est
        // PLAT par construction — il masque le limbe ombré et le reflet, c'est-à-dire
        // exactement ce qui fait lire une sphère. Entre identifier la matière deux fois et
        // obtenir un vrai volume, on garde le volume : le nom est déjà écrit juste au-dessus,
        // et le pictogramme reste présent sur l'écran d'ensemble, où il sert à choisir.

        // Couronne : deux coques concentriques rendues par leur face INTERNE, en fondu
        // additif — la lumière est donc la plus dense au ras du limbe et s'éteint vite,
        // comme la vraie couronne d'une étoile.
        //
        // Volontairement SERRÉE et DISCRÈTE : une couronne large et opaque se lit comme une
        // bulle posée devant la scène, elle masque les étoiles et écrase la constellation.
        // Dans l'espace, ce qui distingue une étoile c'est l'intensité de son cœur, pas
        // l'étendue de son halo.
        for (const [factor, opacity] of [
          [1.09, 0.11],
          [1.26, 0.045],
        ] as const) {
          const corona = new Mesh(
            SPHERE,
            new MeshBasicMaterial({
              color: "#f5c451",
              transparent: true,
              opacity,
              side: BackSide,
              blending: AdditiveBlending,
              depthWrite: false,
            }),
          );
          corona.scale.setScalar(sunRadius * factor);
          // Repéré par la boucle de pulsation, qui n'a ainsi aucun registre à tenir.
          corona.userData.sunCorona = { base: sunRadius * factor, opacity };
          group.add(corona);
        }

        const name = new SpriteText(n.label as string);
        name.color = "#ffe9b0";
        name.textHeight = 6;
        name.fontWeight = "700";
        name.position.set(0, sunRadius * 2.1, 0);
        group.add(name);
        return group;
      }
      const style = starStyle(n.status);
      const radius = radiusOf(NODE_VOLUME[n.kind as string] ?? style.size);
      const selected = n.id === selectedId;
      // Une recherche en cours prime sur le filtre par état : c'est le geste le plus récent
      // et le plus intentionnel de Massimo.
      const searching = Boolean(matchedIds?.size);
      const matched = searching && matchedIds!.has(n.id);
      const faded = searching
        ? !matched && n.kind === "skill"
        : Boolean(highlightStatus) && n.status !== highlightStatus;
      const focused = searching ? matched : Boolean(highlightStatus) && n.status === highlightStatus;

      const base = selected
        ? "#22d3ee"
        : matched
          ? "#22d3ee"
          : (NODE_COLOR[n.kind as string] ?? style.color);
      const color = faded ? dim(base, DIM_AMOUNT) : base;

      const mesh = new Mesh(
        SPHERE,
        new MeshPhongMaterial({
          color,
          // Le halo interne : une étoile bien acquise rayonne, une étoile à découvrir non.
          emissive: color,
          emissiveIntensity: faded ? 0.04 : 0.12 + style.glow * 0.5,
          specular: "#ffffff",
          shininess: 55,
        }),
      );
      const scale = radius * (selected ? 1.75 : focused ? 1.35 : 1);
      mesh.scale.setScalar(scale);
      group.add(mesh);

      // Halo des étoiles trouvées (et de celle qu'on lit). Une coque rendue par sa face
      // INTERNE en fondu additif : on ne voit que son bord, ce qui donne une auréole autour
      // de la sphère plutôt qu'une bulle opaque devant. Grossir l'étoile ne suffit pas —
      // dans une constellation dense, on ne repère pas une taille, on repère une lueur.
      if (matched || selected) {
        const halo = new Mesh(
          SPHERE,
          new MeshBasicMaterial({
            color: "#22d3ee",
            transparent: true,
            opacity: 0.3,
            side: BackSide,
            blending: AdditiveBlending,
            // Sans cela, le halo masquerait les étoiles situées derrière lui.
            depthWrite: false,
          }),
        );
        halo.scale.setScalar(scale * 2.1);
        group.add(halo);
      }

      const big = n.kind === "subject" || n.kind === "chapter";
      const sprite = new SpriteText(n.label as string);
      sprite.color = faded ? "#6b7392" : big ? "#c7d2fe" : "#e8ecf8";
      sprite.textHeight = n.kind === "subject" ? 6 : n.kind === "chapter" ? 4.6 : 3.2;
      sprite.fontWeight = big ? "700" : "500";
      sprite.position.set(0, scale + 6, 0);
      group.add(sprite);

      return group;
    },
    [selectedId, highlightStatus, matchedIds, layout],
  );

  // Cadre TOUTES les correspondances d'un coup : Massimo voit du même regard combien il y
  // en a et où elles sont. `zoomToFit` accepte un filtre de nœuds — on lui donne les
  // trouvailles. Sans résultat, on ne bouge pas la caméra : un recadrage sur une recherche
  // infructueuse donnerait l'impression que quelque chose s'est passé.
  useEffect(() => {
    if (!matchedIds?.size || !graphRef.current?.zoomToFit) return;
    const timer = window.setTimeout(
      () => graphRef.current?.zoomToFit?.(700, 120, (n: any) => matchedIds.has(n.id)),
      60,
    );
    return () => window.clearTimeout(timer);
  }, [matchedIds]);

  // Cadre la constellation entière dès qu'elle est stabilisée : Massimo ne doit pas avoir
  // à chercher ses étoiles ni à dézoomer pour les trouver.
  const handleEngineStop = useCallback(() => {
    // L'ancrage du soleil ne sert qu'à LA MISE EN PLACE : une fois la constellation posée,
    // on le relâche pour qu'il redevienne déplaçable comme n'importe quelle étoile. Il ne
    // bouge pas pour autant — il est déjà à sa place, il n'est simplement plus cloué.
    //
    // ⚠️ INERTE, constaté au read-before-code du 2026-07-31 : `graphData` ne fait PAS partie
    // des méthodes liées au ref par `react-force-graph-3d` 1.29.1 (`methodNames` en expose
    // 18, celle-ci n'y est pas). `graphRef.current.graphData` vaut donc `undefined`, le `?.`
    // avale l'appel, et la boucle tourne sur un tableau vide : le soleil n'a jamais été
    // déclouté. Laissé en l'état — le rendre effectif changerait un comportement en place
    // depuis le 2026-07-28, ce qui n'est pas au périmètre de ce chantier. Écart consigné
    // dans `zetis-galaxy.md`.
    const all = graphRef.current?.graphData?.()?.nodes ?? [];
    const anchor = all.some((n: any) => n.kind === "root") ? "root" : "subject";
    for (const node of all) {
      if (node.kind === anchor) {
        node.fx = undefined;
        node.fy = undefined;
        node.fz = undefined;
      }
    }
    // ⚠️ AUCUN RECADRAGE quand les positions sont épinglées.
    //
    // `onEngineStop` se déclenche à CHAQUE changement de données, donc à chaque naissance
    // pendant une construction. Recadrer là-dessus donnait le défaut constaté : la galaxie se
    // construisait « en grand » — trois étoiles cadrées serré — puis dézoomait par à-coups à
    // mesure qu'elle poussait. La caméra est posée une fois pour l'étendue FINALE (effet
    // ci-dessous), qu'on connaît d'avance puisque la disposition est calculée.
    if (pinnedRef.current) return;
    graphRef.current?.zoomToFit?.(600, fitPadding);
  }, []);

  // Relief des étoiles. L'éclairage par défaut de la lib est très ambiant : toutes les faces
  // d'une sphère reçoivent la même lumière, donc aucun dégradé, donc aucun volume — les
  // étoiles se lisent comme des pastilles découpées. On baisse l'ambiante et on renforce la
  // directionnelle pour recréer un côté éclairé et un côté sombre.
  //
  // On modifie les lumières EXISTANTES (via `lights()`) plutôt que d'en construire : ça évite
  // d'importer `three`, dont cette version ne livre aucun typage.
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph?.lights) return;
    for (const light of graph.lights() ?? []) {
      if (light?.isAmbientLight) light.intensity = 0.75;
      else if (light?.isDirectionalLight) light.intensity = 3.4;
    }
  }, [width, nodes]);

  // Pulsation de la couronne — c'est elle qui rend le soleil « électrique » plutôt que
  // décoratif. On parcourt la scène à chaque frame plutôt que de tenir un registre d'objets :
  // les nœuds sont reconstruits à chaque changement de filtre, un registre se périmerait.
  //
  // Coupée sous `prefers-reduced-motion` : la couronne reste, elle cesse simplement de battre.
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const scene = graphRef.current?.scene?.();
      if (scene) {
        const t = (now - start) / 1000;
        scene.traverse((obj: any) => {
          // Le cerveau : décharges ÉLECTRIQUES. Fréquences plus hautes que la respiration
          // du soleil, et une composante en |sin| qui donne des pics brefs plutôt qu'une
          // ondulation régulière — ça crépite au lieu de respirer.
          const aura = obj.userData?.brainAura;
          if (aura) {
            const surge =
              0.72 + 0.28 * Math.abs(Math.sin(t * 3.1)) + 0.12 * Math.sin(t * 7.9);
            obj.material.opacity = aura.opacity * surge;
            obj.scale.setScalar(aura.base * (1 + 0.05 * Math.sin(t * 2.4)));
            return;
          }
          const core = obj.material?.userData?.brainCore;
          if (core) {
            obj.material.emissiveIntensity = core.base * (0.85 + 0.45 * Math.abs(Math.sin(t * 3.1)));
            return;
          }

          const corona = obj.userData?.sunCorona;
          if (!corona) return;
          // Deux sinusoïdes déphasées : le battement n'est pas régulier, il respire.
          // Amplitudes faibles à dessein — une étoile scintille, elle ne clignote pas ; un
          // battement visible attirerait l'œil en permanence loin des notions.
          const pulse = 1 + Math.sin(t * 1.6) * 0.018 + Math.sin(t * 3.1) * 0.008;
          obj.scale.setScalar(corona.base * pulse);
          obj.material.opacity = corona.opacity * (0.88 + Math.sin(t * 2.2) * 0.12);
        });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, nodes]);

  // Recadre quand la surface change (passage en plein écran, rotation d'écran) : sans cela,
  // la constellation reste au cadrage de la vignette et laisse la moitié de la page vide.
  useEffect(() => {
    // Même motif : sur un graphe épinglé, c'est l'effet de caméra ci-dessous qui recadre, et il
    // dépend déjà de `width`/`height`.
    if (pinned || !graphRef.current?.zoomToFit) return;
    const timer = window.setTimeout(() => graphRef.current?.zoomToFit?.(500, fitPadding), 120);
    return () => window.clearTimeout(timer);
  }, [width, height, pinned]);

  // ── La caméra, posée UNE FOIS pour l'étendue FINALE ────────────────────────────────
  //
  // Quand les positions sont épinglées, on connaît d'avance jusqu'où va la galaxie : on cadre
  // donc tout de suite pour l'état d'arrivée, et plus rien ne bouge ensuite. Les premières
  // étoiles apparaissent petites au centre et la galaxie se remplit vers l'extérieur — au lieu
  // de naître en gros plan et de reculer.
  useLayoutEffect(() => {
    const graph = graphRef.current;
    if (!pinned || pinned.size === 0 || width === 0 || typeof graph?.cameraPosition !== "function")
      return;
    let far = 0;
    for (const at of pinned.values()) {
      far = Math.max(far, Math.hypot(at.x, at.y, at.z));
    }
    if (far === 0) return;
    // Même cadrage en surplomb (~35°) que la vue en orbite : vu par la tranche, un disque se
    // lit comme une ligne droite.
    const distance = far * 2.4;
    graph.cameraPosition({ x: 0, y: distance * 0.62, z: distance }, { x: 0, y: 0, z: 0 }, 0);
  }, [pinned, width, height]);

  // Marge de cadrage proportionnée au cadre : 90 px sur un aperçu de 340 px laisserait plus
  // de vide que de galaxie.
  const fitPadding = height < 400 ? 24 : 90;

  // Liens parcourus par l'or : calculé une fois, en dehors du rendu.
  const lit = useMemo(() => litLinkIds(nodes, edges), [nodes, edges]);

  // ── Garde de perf n°2 : le budget de particules ─────────────────────────────────────
  //
  // Réparti sur toute la scène, pas décidé lien par lien : c'est le TOTAL par image qui
  // coûte. Une galaxie très fournie voit son flux s'amincir (2 → 1 → 0) pendant que ses
  // étoiles, elles, restent toutes là (addendum ADR-0024 §2).
  const allowance = useMemo(
    () => particleAllowance(lit.size, { reducedMotion: reduced, degraded }),
    [lit, reduced, degraded],
  );

  const data = useMemo(
    () => ({
      // Le cœur de matière est ÉPINGLÉ à l'origine (`fx/fy/fz`) : c'est le soleil, tout
      // gravite autour. Sans épinglage, le moteur de forces le laisse dériver et la
      // constellation n'a plus de centre lisible.
      // Dans une constellation c'est la matière qui fait soleil ; dans le graphe global,
      // c'est la racine. On épingle celui des deux qui est présent.
      // En mode ORBITE, chaque matière reçoit en plus sa position imposée : le placement
      // voyage dans les DONNÉES, pas par l'API du ref (`graphData()` n'est pas exposée par
      // cette version de la lib — constaté à l'exécution).
      // ⚠️ L'IDENTITÉ DES OBJETS NŒUDS EST PRÉSERVÉE d'un rendu à l'autre (cache par id).
      //
      // Un `{...n}` neuf à chaque changement de données perd les positions calculées par le
      // moteur : le graphe se réorganise entièrement dès qu'on ajoute un nœud. C'est la
      // deuxième cause du rejeu saccadé diagnostiquée par l'addendum ADR-0029, et c'est aussi
      // ce qui permet à une naissance en cours de survivre au pas de rejeu suivant (120 ms,
      // là où un trajet en dure 480).
      //
      // Le tableau, lui, est neuf : c'est ce que la lib regarde pour détecter un changement.
      nodes: nodes.map((n) => {
        const anchor = nodes.some((x) => x.kind === "root") ? "root" : "subject";
        const node: any = nodeCacheRef.current.get(n.id) ?? {};
        // Libellé et statut sont rafraîchis ; `x/y/z` et `__threeObj` survivent — `GalaxyNode`
        // ne porte aucune coordonnée, la copie ne peut donc pas les écraser.
        Object.assign(node, n);
        const placement = pinned?.get(n.id) ?? orbits.get(n.id);
        if (n.kind === anchor && !placement) {
          node.fx = 0;
          node.fy = 0;
          node.fz = 0;
        } else if (placement) {
          node.x = node.fx = placement.x;
          node.y = node.fy = placement.y;
          node.z = node.fz = placement.z;
        } else {
          // Sans placement imposé, on DÉCLOUE : un `fx` hérité d'une vue précédente figerait
          // le nœud là où il n'a plus rien à faire.
          node.fx = node.fy = node.fz = undefined;
        }
        nodeCacheRef.current.set(n.id, node);
        return node;
      }),
      links: edges.map((e) => ({ source: e.source, target: e.target })),
    }),
    // `orbits` fait partie des dépendances : sans lui, basculer en mode orbite sans que
    // `nodes` change laisserait les placements de la vue précédente.
    [nodes, edges, orbits],
  );

  // ── L'arrivée de la vue par défaut (addendum ADR-0024 §3) ───────────────────────────
  //
  // Le cerveau apparaît seul, puis les matières naissent au centre et rejoignent leur
  // créneau ; l'anneau se trace derrière sa planète. Rythme et invariants : `arrivalTween.ts`.
  //
  // ⚠️ ÉCART ASSUMÉ AVEC LA LETTRE DE L'ADDENDUM, constaté à l'exécution. Le §3 prescrit
  // « n'affecter `fx/fy/fz` qu'à l'arrivée, animer `x/y/z` avant ». Ça ne marche pas ici :
  // en mode orbite le moteur est éteint (forces à zéro, `cooldownTicks` atteint), et la lib
  // ne recopie `x/y/z` vers les objets 3D que pendant un tick de simulation — un `x` animé
  // sur un moteur arrêté ne déplace rien. On écrit donc les trois à la fois, sur la position
  // COURANTE du tween : l'objet 3D bouge tout de suite, et si un tick survient il repose la
  // planète exactement là où on l'a mise, au lieu de la ramener à son créneau.
  //
  // Ce que le §3 interdit vraiment reste respecté : ce qui téléporte, c'est d'épingler la
  // position FINALE dès l'affectation. Ici on n'épingle jamais que l'instant présent.
  //
  // Aucun `refresh()` dans la boucle : il reconstruit tous les objets de la scène. À
  // 60 images par seconde ce serait le remède pire que le mal.
  const arrivalRef = useRef(false);
  useLayoutEffect(() => {
    if (layout !== "orbit" || width === 0) return;
    const graph = graphRef.current;
    if (!graph) return;

    // L'ORDRE DU PROGRAMME, celui dans lequel les matières nous sont servies. Ni ancienneté
    // ni nombre d'étoiles : l'un ferait un mini-rejeu, l'autre un palmarès (ADR-0024 §5).
    //
    // Les positions viennent de `pinned` quand il est fourni (galaxie complète en orbites
    // emboîtées) et de `orbits` sinon (matières seules). Le RANG vient de `arrivalOrder` : tout
    // ce qui descend d'une matière porte le rang de sa matière, donc chaque constellation sort
    // du centre d'un seul tenant au lieu de se disloquer en vol.
    const slots = pinned ?? orbits;
    const planets: {
      node: any;
      slot: { x: number; y: number; z: number };
      rank: number;
    }[] = [];
    for (const node of data.nodes as any[]) {
      const slot = slots.get(node.id);
      // `root` est le point de départ : il ne voyage pas, il est déjà chez lui.
      if (!slot || node.kind === "root") continue;
      planets.push({ node, slot, rank: arrivalOrder?.get(node.id) ?? planets.length });
    }
    if (planets.length === 0) return;

    // La durée se compte en RANGS distincts, pas en nœuds : cent notions d'une même matière
    // arrivent ensemble, elles n'allongent pas la chorégraphie d'un cran chacune.
    const rankCount = new Set(planets.map((p) => p.rank)).size;

    const place = (node: any, at: { x: number; y: number; z: number }) => {
      node.x = node.fx = at.x;
      node.y = node.fy = at.y;
      node.z = node.fz = at.z;
      node.__threeObj?.position?.set(at.x, at.y, at.z);
    };

    /** La composition finale : c'est aussi l'état de repli quand il n'y a rien à jouer. */
    const settle = () => {
      for (const { node, slot } of planets) {
        place(node, slot);
        if (node.__threeObj) node.__threeObj.visible = true;
      }
      for (const ring of ringsRef.current) {
        (ring.material as MeshBasicMaterial).opacity = RING_OPACITY;
      }
    };

    // `prefers-reduced-motion` → composition finale immédiate, aucun trajet. Idem au retour
    // d'une constellation : l'arrivée ne joue qu'UNE FOIS PAR VISITE.
    if (reduced || arrivalRef.current || arrivalAlreadyPlayed(arrivalScope)) {
      settle();
      return;
    }
    arrivalRef.current = true;
    rememberArrival(arrivalScope);

    const total = arrivalDuration(rankCount);
    const apply = (elapsed: number) => {
      planets.forEach(({ node, slot, rank }) => {
        place(node, planetPosition(elapsed, rank, slot));
        // Avant de partir, la matière attend DANS le cerveau : invisible, sinon huit
        // planètes empilées à l'origine se liraient comme un défaut d'affichage.
        if (node.__threeObj) node.__threeObj.visible = planetIsBorn(elapsed, rank);
      });
      ringsRef.current.forEach((ring, index) => {
        (ring.material as MeshBasicMaterial).opacity = ringOpacity(
          elapsed,
          index,
          RING_OPACITY,
        );
      });
    };

    // L'état à t=0 est posé AVANT la première peinture (`useLayoutEffect`) : sans lui, la
    // première image montrerait les planètes déjà à leur créneau — un flash à l'arrivée,
    // suivi d'un retour au centre.
    apply(0);

    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const elapsed = now - start;
      if (elapsed >= total) {
        settle();
        return;
      }
      apply(elapsed);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [layout, width, data, orbits, pinned, arrivalOrder, reduced, arrivalScope]);

  // ── La naissance d'une étoile, depuis son parent (addendum ADR-0029 §2 réécrit) ─────
  //
  // Un nœud qui apparaît ne surgit pas à sa place : il naît AUX COORDONNÉES DE SON PARENT et
  // rejoint la sienne en `BIRTH` ms. Sans ça, chaque étoile arriverait de l'origine en
  // traversant l'écran — ou pire, apparaîtrait d'un coup, ce qui ne se lit pas comme une
  // croissance.
  //
  // Rien ici ne réchauffe la simulation : tout est épinglé, le moteur est neutralisé. C'est
  // précisément ce qui remplace le `d3ReheatSimulation` à alpha bas que la lib n'expose pas.
  useLayoutEffect(() => {
    const current = data.nodes as any[];
    if (!pinned) {
      // Hors rejeu, on mémorise sans animer : au retour, rien ne doit « renaître ».
      seenRef.current = new Set(current.map((n) => n.id));
      return;
    }

    const parentOf = new Map<string, string>();
    for (const edge of edges) {
      if (!parentOf.has(edge.target)) parentOf.set(edge.target, edge.source);
    }

    const newborns: { node: any; from: Vec3; to: Vec3 }[] = [];
    for (const node of current) {
      if (seenRef.current.has(node.id)) continue;
      const to = pinned.get(node.id);
      if (!to) continue;
      const parentId = parentOf.get(node.id);
      // `root` n'a pas de parent : il naît chez lui, au centre. C'est le point de départ.
      newborns.push({ node, from: (parentId && pinned.get(parentId)) || ORIGIN, to });
    }
    for (const node of current) seenRef.current.add(node.id);

    // `prefers-reduced-motion` → état final d'emblée, aucune construction.
    if (newborns.length === 0 || reduced) return;

    const put = (node: any, at: Vec3) => {
      node.x = node.fx = at.x;
      node.y = node.fy = at.y;
      node.z = node.fz = at.z;
      node.__threeObj?.position?.set(at.x, at.y, at.z);
    };
    const apply = (elapsed: number) => {
      const k = easeOutCubic(Math.min(1, elapsed / BIRTH));
      for (const { node, from, to } of newborns) {
        put(node, {
          x: from.x + (to.x - from.x) * k,
          y: from.y + (to.y - from.y) * k,
          z: from.z + (to.z - from.z) * k,
        });
      }
    };

    apply(0);
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const elapsed = now - start;
      if (elapsed >= BIRTH) {
        for (const { node, to } of newborns) put(node, to);
        return;
      }
      apply(elapsed);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [data, pinned, edges, reduced]);

  // Un lien reste franc s'il mène à une étoile de l'état filtré ; sinon il s'efface.
  const linkIsFocused = useCallback(
    (link: any) => {
      if (!highlightStatus) return true;
      const target = typeof link.target === "object" ? link.target : null;
      return target?.status === highlightStatus;
    },
    [highlightStatus],
  );

  const isLitLink = useCallback(
    (link: any) => {
      const source = typeof link.source === "object" ? link.source.id : link.source;
      const target = typeof link.target === "object" ? link.target.id : link.target;
      return lit.has(linkKey(source, target));
    },
    [lit],
  );

  /** Les liens qui partent du cerveau : ce sont des NERFS, pas des traits de structure. */
  const isNerve = useCallback((link: any) => {
    const source = typeof link.source === "object" ? link.source : null;
    return source?.kind === "root";
  }, []);

  return (
    <div ref={wrapRef} style={{ height }} className="h-full w-full">
      {width > 0 && (
        <ForceGraph3D
          ref={graphRef}
          width={width}
          height={height}
          graphData={data}
          backgroundColor="rgba(0,0,0,0)"
          showNavInfo={false}
          enableNodeDrag
          // `orbit` (et non le `trackball` par défaut) : c'est le seul type de contrôle qui
          // expose `autoRotate`. Le drag de nœud reste actif — la lib désactive les contrôles
          // le temps du glissement.
          controlType="orbit"
          // Rayon de base généreux : la sphère rendue EST la cible de touche. Au doigt, une
          // étoile de quelques pixels est inatteignable — on vise le confort tactile de
          // l'iPad et de l'iPhone, pas la finesse du trackpad (ADR-0024 §6).
          nodeRelSize={6}
          // Le nom de chaque étoile est GRAVÉ dans la scène 3D, pas laissé à une infobulle
          // de survol : le survol n'existe pas au doigt (iPhone, iPad), et une galaxie dont
          // on ne peut pas lire les noms ne dit rien à Massimo (ADR-0024 §6).
          nodeLabel={() => ""}
          // Sphères construites ici : taille, couleur, atténuation et sélection sont portées
          // par l'objet lui-même (`nodeVal`/`nodeColor` ne s'appliquent plus).
          nodeThreeObject={nodeObject}
          // L'or ne coule que vers ce que Massimo a vraiment travaillé : c'est une
          // information, pas un décor (ADR-0024). Les liens vers les étoiles à découvrir
          // restent sombres et immobiles.
          linkColor={(link: any) => {
            if (!linkIsFocused(link)) return LINK_DIM;
            // Les nerfs partant du cerveau sont électriques, pas dorés : ils portent
            // l'influx, là où les autres liens portent l'appartenance.
            if (isNerve(link)) return NERVE;
            return isLitLink(link) ? GOLD : LINK_DIM;
          }}
          linkWidth={(link: any) => {
            if (!linkIsFocused(link)) return 0.5;
            if (isNerve(link)) return 2.2;
            return isLitLink(link) ? 1.4 : 0.5;
          }}
          linkOpacity={0.7}
          linkDirectionalParticles={(link: any) => {
            if (!linkIsFocused(link)) return 0;
            // Un train de particules sur les nerfs : plusieurs impulsions se suivent le long
            // de la fibre, comme une salve de potentiels d'action. Il s'éteint avec le
            // budget — mouvement réduit, ou appareil qui décroche.
            if (isNerve(link)) return allowance > 0 ? 5 : 0;
            return particlesFor(isLitLink(link), reduced, allowance);
          }}
          linkDirectionalParticleColor={(link: any) =>
            isNerve(link) ? NERVE_BRIGHT : GOLD_BRIGHT
          }
          // Les influx filent plus vite que le flux doré : un nerf conduit, il ne s'écoule pas.
          linkDirectionalParticleSpeed={(link: any) => (isNerve(link) ? 0.014 : 0.006)}
          linkDirectionalParticleWidth={(link: any) => (isNerve(link) ? 1.8 : 1.1)}
          // Tous les nœuds remontent, y compris amas et soleils : c'est à l'APPELANT de
          // décider ce qu'un clic signifie. Filtrer ici sur `kind === "skill"` avalait les
          // clics sur les matières dans le graphe global (bug constaté).
          onNodeClick={(n: any) => onNodeClick?.(n as GalaxyNode)}
          onBackgroundClick={() => onBackgroundClick?.()}
          cooldownTicks={reduced ? 40 : 120}
          warmupTicks={reduced ? 40 : 0}
          onEngineStop={handleEngineStop}
        />
      )}
    </div>
  );
}
