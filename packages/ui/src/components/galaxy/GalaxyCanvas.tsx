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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { linkKey, litLinkIds, particlesFor } from "./galaxyGraph";
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
   * `"force"` (défaut) : simulation de forces — le rendu d'une constellation, où l'on ne sait
   * pas d'avance combien d'étoiles il y aura.
   *
   * `"orbit"` : les matières sont POSÉES sur des orbites autour du cœur, dans un plan aplati,
   * et chaque orbite est dessinée. C'est la vue d'arrivée de `/galaxy` — une composition, pas
   * un équilibre : avec le cerveau et huit matières, le moteur de forces produisait un amas où
   * le cœur était à moitié enseveli.
   */
  layout?: "force" | "orbit";
  height?: number;
}

/** Force du fondu appliqué à ce qui n'est pas concerné par le filtre. */
const DIM_AMOUNT = 0.82;

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
  height = 540,
}: GalaxyCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const [width, setWidth] = useState(0);
  const reduced = useMemo(prefersReducedMotion, []);


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
    if (layout === "orbit") {
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

    const placements = orbitLayout(nodes.filter((n) => n.kind === "subject").map((n) => n.id));

    // La caméra est placée EN SURPLOMB, pas dans le plan : vue par la tranche, un système
    // solaire se lit comme une ligne droite et les anneaux disparaissent (constaté au rendu).
    // ~35° d'élévation, l'angle auquel un disque se lit comme un disque.
    const far = (placements.at(-1)?.radius ?? 200) * 2.1;
    graph.cameraPosition?.({ x: 0, y: far * 0.62, z: far }, { x: 0, y: 0, z: 0 }, 0);

    const scene = graph.scene();
    const rings = placements.map(({ radius }) => {
      const ring = new Mesh(
        new RingGeometry(radius - 0.6, radius + 0.6, 96),
        new MeshBasicMaterial({
          color: "#6d8bff",
          transparent: true,
          opacity: 0.16,
          side: DoubleSide,
          depthWrite: false,
        }),
      );
      // Le `RingGeometry` naît dans le plan XY : on le couche pour qu'il devienne l'écliptique.
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);
      return ring;
    });

    return () => {
      for (const ring of rings) {
        scene.remove(ring);
        ring.geometry.dispose();
        (ring.material as { dispose: () => void }).dispose();
      }
    };
  }, [layout, nodes, width]);

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
    const all = graphRef.current?.graphData?.()?.nodes ?? [];
    const anchor = all.some((n: any) => n.kind === "root") ? "root" : "subject";
    for (const node of all) {
      if (node.kind === anchor) {
        node.fx = undefined;
        node.fy = undefined;
        node.fz = undefined;
      }
    }
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
    if (!graphRef.current?.zoomToFit) return;
    const timer = window.setTimeout(() => graphRef.current?.zoomToFit?.(500, fitPadding), 120);
    return () => window.clearTimeout(timer);
  }, [width, height]);

  // Marge de cadrage proportionnée au cadre : 90 px sur un aperçu de 340 px laisserait plus
  // de vide que de galaxie.
  const fitPadding = height < 400 ? 24 : 90;

  // Liens parcourus par l'or : calculé une fois, en dehors du rendu.
  const lit = useMemo(() => litLinkIds(nodes, edges), [nodes, edges]);

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
      nodes: nodes.map((n) => {
        const anchor = nodes.some((x) => x.kind === "root") ? "root" : "subject";
        if (n.kind === anchor) return { ...n, fx: 0, fy: 0, fz: 0 };
        const placement = orbits.get(n.id);
        if (placement) {
          return { ...n, ...placement, fx: placement.x, fy: placement.y, fz: placement.z };
        }
        return { ...n };
      }),
      links: edges.map((e) => ({ source: e.source, target: e.target })),
    }),
    [nodes, edges],
  );

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
            // de la fibre, comme une salve de potentiels d'action.
            if (isNerve(link)) return reduced ? 0 : 5;
            return particlesFor(isLitLink(link), reduced);
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
