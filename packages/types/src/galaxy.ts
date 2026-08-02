/**
 * ZETIS Galaxy — graphe des connaissances de Massimo (ADR-0024).
 *
 * Contrat des trois routes élève `/api/student/galaxy*`. Surface ENFANT : rien du pilotage
 * Papa n'y entre (ni `validated_by`, ni fraîcheur, ni lacune, ni sévérité).
 */

/** Les cinq états lumineux. Aucun n'est négatif : une notion jamais vue est une étoile
 *  pas encore née (`unknown` → « À découvrir »), pas un échec.
 *
 *  ⚠️ Le serveur connaît un SIXIÈME statut, `in_progress` (verdict de mission
 *  `review_later`), qu'il normalise en `learning` avant d'émettre. Il n'apparaît donc
 *  jamais ici — ne pas l'ajouter à cette union « au cas où ». */
export type GalaxyStatus = "unknown" | "weak" | "learning" | "solid" | "mastered";

/** La panoplie complète de ZETIS pour une notion. */
export type GalaxyActionKind =
  | "cours"
  | "eli5"
  | "fiche"
  | "capsule"
  | "mindmap"
  | "revision"
  | "quiz";

/** Une constellation en vue d'ensemble.
 *
 *  `lit` est un COMPTE d'étoiles allumées, jamais un pourcentage : la page répond à
 *  « où j'en suis », elle ne note pas Massimo et ne classe pas ses matières. */
export interface GalaxySubject {
  subject_id: number;
  name: string;
  slug: string;
  lit: number;
  total: number;
}

export interface GalaxyOverview {
  subjects: GalaxySubject[];
}

export interface GalaxySubjectRef {
  subject_id: number;
  name: string;
  slug: string;
}

/** Nœud du graphe : le cœur de la matière (`subject`), un amas (`chapter`) ou une étoile
 *  (`skill`).
 *
 *  Le nœud `subject` relie les chapitres entre eux. Sans lui, chaque chapitre serait une
 *  composante isolée que le moteur de forces éloignerait : la constellation se disloquerait.
 *
 *  `skill_id`, `chapter_id`, `status` et `intensity` ne sont renseignés que sur une étoile.
 *  `intensity` (0–100) module la LUMINOSITÉ à l'intérieur d'un état — il ne s'affiche
 *  jamais tel quel et n'est pas un pourcentage de réussite. */
export interface GalaxyNode {
  id: string;
  /** `root` n'existe que dans le graphe global (Accueil) : il relie les matières entre elles. */
  kind: "root" | "subject" | "chapter" | "skill";
  label: string;
  skill_id?: number | null;
  chapter_id?: number | null;
  status?: GalaxyStatus | null;
  intensity?: number | null;
  /** Renseigné dans le GRAPHE GLOBAL seulement : permet à un clic (ou à une recherche)
   *  d'ouvrir directement la bonne constellation. Absent dans une constellation, où la
   *  matière est déjà connue. */
  subject_slug?: string | null;
}

/** Arête de STRUCTURE — la seule relation qui existe réellement en base
 *  (`Skill ← lesson_skills → Lesson → Chapter`).
 *
 *  Il n'y a PAS de prérequis dans ZETIS : `prerequisite_skill_ids` n'existe pas et
 *  `parent_skill_id` est NULL partout. Ne pas en inventer côté client. */
export interface GalaxyEdge {
  source: string;
  target: string;
  type: "structure";
}

export interface GalaxyConstellation {
  subject: GalaxySubjectRef;
  nodes: GalaxyNode[];
  edges: GalaxyEdge[];
}

/** `GET /api/student/galaxy/all` — toutes les matières dans un seul graphe (Accueil).
 *
 *  Porte un nœud `root` : sans lui, chaque matière serait une composante isolée que le moteur
 *  de forces éloignerait, et la galaxie se disloquerait. */
export interface GalaxyFullGraph {
  nodes: GalaxyNode[];
  edges: GalaxyEdge[];
}

/** Un jour de la frise. `lit` est CUMULÉ et ne décroît jamais. */
export interface GalaxyTimelinePoint {
  date: string;
  lit: number;
}

/** `GET /api/student/galaxy/timeline` — le chemin parcouru, jamais un recul.
 *
 *  ⚠️ Construite sur la PREMIÈRE fois où chaque notion a été travaillée (`learning_events`,
 *  append-only), et NON sur `SkillMastery`, qui peut régresser. Ne jamais « corriger » cette
 *  courbe avec l'état courant : elle deviendrait décroissante, donc un compteur de pertes. */
export interface GalaxyTimeline {
  points: GalaxyTimelinePoint[];
  total: number;
  /** Renseigné SEULEMENT avec `?with_skills=true` (ADR-0029), pour le rejeu animé. Absent —
   *  et non `null` — quand il n'est pas demandé : la frise ne voit aucun changement. */
  skills?: GalaxySkillFirstLit[];
}

/** Le jour où une notion a été allumée pour la PREMIÈRE fois (ADR-0029 §2).
 *
 *  Deux états seulement dans le rejeu : pas encore née, et allumée. L'état de maîtrise à une
 *  date passée n'est JAMAIS servi — il régresse, et un rejeu bâti dessus montrerait des étoiles
 *  s'éteindre. */
export interface GalaxySkillFirstLit {
  skill_id: number;
  date: string;
}

/** Une activité de ZETIS pour cette notion, disponible ou non.
 *
 *  La panoplie complète est TOUJOURS renvoyée, chaque entrée portant `available`
 *  (révision de l'ADR-0024 §4, 2026-07-28). Le client rend tout, dans l'ordre reçu, et grise
 *  ce qui n'est pas disponible — il n'invente aucune règle de repli.
 *
 *  Une activité indisponible n'est pas un manque de l'enfant : c'est du contenu que Papa
 *  n'a pas encore produit. Ne jamais le formuler comme un échec. */
export interface GalaxyAction {
  kind: GalaxyActionKind;
  available: boolean;
  lesson_id?: number | null;
  fiche_id?: number | null;
  quiz_id?: number | null;
  mindmap_id?: number | null;
  capsule_id?: number | null;
}

export interface GalaxyNotion {
  skill_id: number;
  name: string;
  status: GalaxyStatus;
  chapter_title: string;
  subject_slug: string;
  subject_name: string;
  actions: GalaxyAction[];
}

/** Une notion dans l'index de matière (`/subjects/:slug`).
 *
 *  ⚠️ Il n'y a **ni `mastery_score`, ni `intensity`, ni pourcentage** — et il ne faut pas en
 *  ajouter : `status` seul (ADR-0024 §5). La page matière décrit le catalogue, elle ne note pas
 *  Massimo. Une valeur numérique servie finit toujours par être affichée. */
export interface PanoplyNotion {
  skill_id: number;
  name: string;
  status: GalaxyStatus;
  /** La panoplie complète, TOUJOURS les 7 activités, dans l'ordre pédagogique du serveur
   *  (`cours · eli5 · fiche · capsule · mindmap · revision · quiz`). Le client rend dans
   *  l'ordre reçu et grise ce qui n'est pas disponible — il ne réordonne rien. */
  actions: GalaxyAction[];
}

/** Un chapitre de l'index — ordre du référentiel, jamais un classement par maîtrise. */
export interface PanoplyChapter {
  chapter_id: number;
  title: string;
  notions: PanoplyNotion[];
}

/** `GET /api/student/subjects/{slug}/panoply` — l'index de notions d'une matière
 *  (addendum ADR-0024).
 *
 *  Même modèle que la constellation, rendu en liste : c'est le repli sans WebGL de
 *  `zetis-galaxy.md §11`. La page qui consomme ce contrat ne doit donc importer **aucun**
 *  chunk 3D, ni statiquement ni par `import()`.
 *
 *  `chapters: []` quand la matière n'a encore rien de validé — un état positif, pas une erreur. */
export interface SubjectPanoply {
  subject: GalaxySubjectRef;
  chapters: PanoplyChapter[];
}
