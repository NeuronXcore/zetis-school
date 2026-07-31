/**
 * La galaxie ENTIÈRE, en orbites CIRCULAIRES autour du centre (addendum ADR-0024
 * « constellations complètes »).
 *
 * Le cerveau au centre. Trois anneaux concentriques : les matières sur le premier, les
 * chapitres sur le deuxième, les notions sur le troisième. Tout gravite autour du **même**
 * centre — un vrai système solaire, pas des satellites de satellites.
 *
 * ⚠️ Une première version posait les chapitres autour de LEUR matière et les notions autour de
 * LEUR chapitre : des orbites emboîtées. Lisible sur le papier, illisible à l'écran — on ne
 * voyait plus le centre, seulement des petits amas dispersés. Corrigé au vu du rendu.
 *
 * **Ce qui garde l'arbre lisible malgré les anneaux communs** : chaque matière reçoit un
 * SECTEUR angulaire, et tous ses descendants restent dedans. On lit donc une part de tarte par
 * matière, du centre vers le bord — la hiérarchie se lit en RAYON, l'appartenance en ANGLE.
 *
 * ── Pourquoi c'est possible maintenant, et pas le 2026-07-31 au matin ──────────────────
 *
 * Le §C avait réduit la vue par défaut au cerveau et aux matières, **au vu du rendu réel** :
 * servir tout le graphe à une simulation de forces produisait un amas où le cœur était à
 * moitié enseveli. La cause n'était pas le NOMBRE de nœuds, c'était la **convergence** — un
 * moteur de forces cherche un équilibre, pas une composition.
 *
 * Depuis, la slice B a apporté le mécanisme qui manquait : positions **calculées** et
 * **épinglées**, moteur neutralisé. L'amas ne peut plus se produire, parce que plus rien ne
 * cherche à s'équilibrer.
 *
 * ⚠️ Ne pas en conclure qu'on peut « rallumer les forces maintenant qu'on sait faire ». C'est
 * l'inverse : c'est parce qu'on ne les rallume pas que tout peut être montré.
 *
 * Fonctions PURES et DÉTERMINISTES : la galaxie de Massimo est la même à chaque visite.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ConstellationLayout {
  /** Position imposée de chaque nœud. */
  positions: Map<string, Vec3>;
  /** Rang d'arrivée : celui de la MATIÈRE dont le nœud dépend, pour que chaque constellation
   *  sorte du centre d'un seul tenant plutôt que nœud par nœud. */
  order: Map<string, number>;
  /** Rayons des anneaux concentriques à dessiner, du plus proche au plus lointain. */
  rings: number[];
}

/** Rayon de l'anneau de chaque étage. Croissants : la hiérarchie se lit du centre vers le bord. */
export const RING_RADIUS = { subject: 150, chapter: 260, skill: 370 } as const;

/** Épaisseur verticale d'un anneau, en fraction du rayon : on lit un disque, pas une sphère. */
const TILT = 0.12;

/** Part du secteur d'une matière réellement occupée. Le reste est la respiration entre deux
 *  parts — sans elle, les matières voisines se touchent et l'appartenance devient illisible. */
const SECTOR_FILL = 0.78;

interface NodeLike {
  id: string;
  kind: string;
}

interface EdgeLike {
  source: string;
  target: string;
}

/** Pose des nœuds sur un anneau, répartis dans le secteur angulaire `[from, to]`. */
function arc(ids: string[], radius: number, from: number, to: number, into: Map<string, Vec3>) {
  ids.forEach((id, index) => {
    // Un seul enfant se place au MILIEU de son secteur, pas à son bord : sinon une matière à
    // chapitre unique paraît décalée par rapport à sa propre planète.
    const ratio = ids.length === 1 ? 0.5 : index / (ids.length - 1);
    const angle = from + (to - from) * ratio;
    into.set(id, {
      x: Math.cos(angle) * radius,
      y: Math.sin(index * 1.7) * radius * TILT,
      z: Math.sin(angle) * radius,
    });
  });
}

export function constellationLayout(
  nodes: NodeLike[],
  edges: EdgeLike[],
  rootId = "root",
): ConstellationLayout {
  const present = new Set(nodes.map((n) => n.id));
  const childrenOf = new Map<string, string[]>();
  for (const edge of edges) {
    if (!present.has(edge.source) || !present.has(edge.target)) continue;
    const list = childrenOf.get(edge.source);
    if (list) list.push(edge.target);
    else childrenOf.set(edge.source, [edge.target]);
  }

  const positions = new Map<string, Vec3>([[rootId, { x: 0, y: 0, z: 0 }]]);
  const order = new Map<string, number>([[rootId, 0]]);

  // ⚠️ L'ordre des matières est celui du PROGRAMME, tel qu'il nous est servi. Ni ancienneté ni
  // nombre d'étoiles : l'un ferait de cet écran un mini-rejeu, l'autre un palmarès (§5).
  const subjects = nodes.filter((n) => n.kind === "subject").map((n) => n.id);
  const sector = subjects.length > 0 ? (Math.PI * 2) / subjects.length : Math.PI * 2;
  const half = (sector * SECTOR_FILL) / 2;

  subjects.forEach((subjectId, index) => {
    const center = index * sector;
    positions.set(subjectId, {
      x: Math.cos(center) * RING_RADIUS.subject,
      y: 0,
      z: Math.sin(center) * RING_RADIUS.subject,
    });
    order.set(subjectId, index);

    // Chapitres et notions de cette matière : même secteur, anneaux plus lointains. Ils
    // héritent de SON rang d'arrivée — la constellation sort du centre d'un seul tenant.
    const chapters = childrenOf.get(subjectId) ?? [];
    arc(chapters, RING_RADIUS.chapter, center - half, center + half, positions);

    const skills: string[] = [];
    for (const chapterId of chapters) {
      order.set(chapterId, index);
      for (const skillId of childrenOf.get(chapterId) ?? []) skills.push(skillId);
    }
    // Les notions sont réparties sur TOUT le secteur de la matière, en suivant l'ordre de leurs
    // chapitres : une notion reste ainsi sous le sien, sans qu'on ait à sous-découper le
    // secteur — un chapitre à vingt notions et un chapitre à deux se partageraient mal.
    arc(skills, RING_RADIUS.skill, center - half, center + half, positions);
    for (const skillId of skills) order.set(skillId, index);
  });

  // Aucun nœud ne se perd : perdre un nœud, ce serait perdre une notion de Massimo.
  let orphan = 0;
  const outer = RING_RADIUS.skill + 90;
  for (const node of nodes) {
    if (positions.has(node.id)) continue;
    const angle = orphan * 2.399963229728653;
    positions.set(node.id, { x: Math.cos(angle) * outer, y: 0, z: Math.sin(angle) * outer });
    order.set(node.id, subjects.length);
    orphan += 1;
  }

  return {
    positions,
    order,
    rings: [RING_RADIUS.subject, RING_RADIUS.chapter, RING_RADIUS.skill],
  };
}
