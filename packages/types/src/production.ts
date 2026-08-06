// Couverture de production (page Papa « Couverture ») — contrat de `GET /api/production/*`.
// Décisions : addendum ADR-0011 §E (fraîcheur) et §F (provenance), ADR-0023.

/** État d'une cellule de la matrice, pour UN dérivé d'UNE leçon.
 * `stale` prime sur `validated` : un dérivé périmé EST validé, et c'est précisément
 * l'information que le ✓ ne doit pas masquer. */
export type CellState = "absent" | "pending" | "validated" | "stale" | "blocked";

/** Deux causes de blocage distinctes, parce que l'action à mener diffère :
 * `blocked_lesson` → agir dans Programme ; `blocked_no_course` → rédiger le cours ici. */
export type RowState = "blocked_lesson" | "blocked_no_course" | "ready" | "complete";

/** QUI a laissé passer le contenu (§F) — jamais totalisé, jamais transformé en relance.
 * `null` sur un objet validé = antérieur à la traçabilité (« provenance inconnue »).
 *
 * L'échelle `parent` → `parent_bulk` → `parent_rule` est celle du §G.1 : une décision humaine à
 * granularité d'attention décroissante (la pièce, le lot, la règle). `system` n'est pas dessus —
 * il dit « servi sans relecture PAR DOCTRINE », et reste réservé au quiz.
 *
 * ⚠️ `parent_rule` est **légale et non émise** (ADR-0032) : elle suppose un lot que personne n'a
 * demandé, ce qui n'existe pas encore. Le type l'accepte avant que la donnée la porte. */
export type ValidatedBy = "parent" | "parent_bulk" | "parent_rule" | "system";

export interface CoverageCell {
  state: CellState;
  derived_at: string | null;
  validated_by: ValidatedBy | null;
  /** Cible d'un « Régénérer » (la leçon pour la colonne Cours). `null` si `absent`/`blocked`. */
  object_id: number | null;
}

/** Colonne notion-centrée : une fraction, et **aucun état de fraîcheur** (§E.5). */
export interface CoverageFraction {
  covered: number;
  total: number;
}

/** Une notion de la leçon, et ce qu'elle porte de consommable.
 *  `skill_id` est la cible des générations lancées depuis la matrice. */
export interface CoverageNotionItem {
  skill_id: number;
  name: string;
  has_card: boolean;
  has_capsule: boolean;
}

export interface CoverageNotions {
  cards: CoverageFraction;
  capsules: CoverageFraction;
  items: CoverageNotionItem[];
}

export interface CoverageCells {
  cours: CoverageCell;
  quiz: CoverageCell;
  fiche: CoverageCell;
  mindmap: CoverageCell;
}

/** Les quatre colonnes leçon-centrées, dans l'ordre d'affichage de la matrice. */
export type CoverageCellKey = keyof CoverageCells;

export interface CoverageLesson {
  id: number;
  title: string;
  row_state: RowState;
  cells: CoverageCells;
  notions: CoverageNotions;
}

export interface CoverageChapter {
  id: number;
  title: string;
  lessons: CoverageLesson[];
}

export interface CoverageSubject {
  id: number;
  name: string;
  slug: string;
  chapters: CoverageChapter[];
}

export interface CoverageSchoolYear {
  id: number;
  label: string;
  level: string;
}

export interface CoverageTotals {
  lessons: number;
  lessons_validated: number;
  courses_written: number;
  /** Porte sur quiz · fiche · mindmap UNIQUEMENT — le cours en est la condition, pas un dérivé. */
  derivatives_percent: number;
  pending_count: number;
  stale_count: number;
  orphan_count: number;
}

export interface Coverage {
  school_year: CoverageSchoolYear | null;
  totals: CoverageTotals;
  subjects: CoverageSubject[];
}

export type OrphanType = "fiche" | "mindmap" | "quiz";

export interface ProductionOrphan {
  type: OrphanType;
  id: number;
  title: string;
  subject: string | null;
  archived_at: string | null;
  /** Vrai → suppression désactivée : on n'efface pas l'historique de Massimo pour faire propre. */
  has_history: boolean;
}

// --- Production en lot (ADR-0031) --------------------------------------------------------------

/** Une notion dans l'aperçu d'un lot. `reason` renseigné = bloquée par le gate du §7. */
export interface ProductionNotion {
  skill_id: number;
  name: string;
  reason?: string | null;
}

/** Ce qu'un lot ferait, SANS rien créer. Le gate doit être visible AVANT le clic : sans lui, un
 *  chapitre neuf rendrait « rien produit », que Papa lirait comme un échec. */
export interface ProductionPreview {
  chapter_id: number;
  eligible: ProductionNotion[];
  blocked: ProductionNotion[];
  pending_backlog: number;
  max_pending: number;
}

export type ProductionRunStatus = "queued" | "running" | "done" | "failed";

/** État d'un lot. Un ÉTAT, jamais du contenu. */
export interface ProductionRun {
  id: number;
  status: ProductionRunStatus;
  trigger: string;
  authorized_by: string;
  chapter_id: number | null;
  /** Scope de PIÈCE (ADR-0036 §2) — exclusif de `chapter_id`. `null` = lot de chapitre. */
  scope_skill_id: number | null;
  /** Une valeur de `PIECES` : `cours` | `fiche` | `srs` | `quiz` | `mindmap`.
   *
   *  ⚠️ Le vocabulaire des LOTS, pas celui des demandes : ici c'est `srs`, jamais `card`. */
  scope_kind: string | null;
  /** Nom de la notion visée (jointure serveur) — « une fiche sur la notion 17 » ne se lit pas. */
  scope_skill_name: string | null;
  total_notions: number | null;
  done_notions: number | null;
  /** Avancement RÉEL (0-100), calculé serveur.
   *
   *  ⚠️ **Il compte des NOTIONS, pas des secondes** — donc il ne dit rien d'utile sur un lot-pièce,
   *  qui n'en a qu'une : 0 % pendant toute la durée, puis le lot disparaît. Constaté à l'écran le
   *  2026-08-03. Là où la granularité manque (`total_notions <= 1`), l'affichage doit basculer sur
   *  une estimation — et le dire. Le champ, lui, ne ment pas : il n'a simplement rien à dire. */
  progress_pct: number;
  created_at: string;
  /** Instant de DÉMARRAGE réel — `null` tant que le lot attend son tour.
   *
   *  ⚠️ **C'est lui qui rend l'avancement continu d'une page à l'autre.** Là où le serveur n'a
   *  pas de granularité (lot-pièce), l'écran estime ; une estimation ancrée sur le montage du
   *  composant repart de zéro à chaque navigation, et Papa revoyait « 0 % » sur une production
   *  commencée depuis une minute (constaté le 2026-08-05). Ancrée sur cet instant, elle mesure le
   *  temps écoulé — c'est-à-dire ce qu'elle prétend mesurer. */
  started_at: string | null;
  finished_at: string | null;
  /** 🔴 Durée attendue, **MESURÉE** par le serveur (ADR-0041 §9) — médiane des exécutions
   *  réussies du type de travail que ce lot exécute, × son nombre de notions.
   *
   *  ⚠️ Ajouté le 2026-08-06 pour réparer une régression que la slice C venait d'introduire : les
   *  composants ont cessé d'estimer en dur, or cette vue ne portait pas de quoi estimer — un
   *  lot-PIÈCE retrouvé au retour sur la page perdait sa barre. */
  estimated_ms: number;
}

/** `GET /api/production/runs/active` — le lot en cours, augmenté de **qui l'exécute**.
 *
 *  ⚠️ Ce champ ne vit que sur cette route : la question coûte un aller-retour Redis, et le
 *  Journal aligne des dizaines de lots par page. */
export interface ActiveProductionRun extends ProductionRun {
  /** Un worker écoute-t-il la file ?
   *
   *  ⚠️ **`false` ne veut pas dire « ça va être long », il veut dire « personne ne viendra ».**
   *  Un lot en file sans consommateur n'attend pas son tour : il est arrêté. Le 2026-08-05,
   *  quatre lots ont attendu six heures pendant que l'écran affichait « en file d'attente » — une
   *  vérité littérale qui laissait croire à une file qui avance. */
  worker_alive: boolean;
}

// --- Journal de production et veto (ADR-0034) ---------------------------------------------------

/** ⚠️ `stale` est RENDU par le serveur, jamais stocké : un lot dont le battement de cœur a expiré.
 *  La base ne connaît que quatre statuts, l'écran en montre cinq. */
export type JournalRunStatus = ProductionRunStatus | "stale";

export type PieceKind = "cours" | "fiche" | "mindmap" | "quiz" | "srs";

/** `blocked` porte sur la NOTION (`piece: null`) : le gate du §7 l'a écartée avant production.
 *  Une notion silencieusement omise se lirait comme un échec, alors que c'est un gate qui marche. */
export type EventOutcome = "generated" | "skipped" | "error" | "blocked";

/** Où aller pour débloquer une notion écartée — les trois ids de la convention `pilotageLinks`.
 *
 *  ⚠️ **Résolus SERVEUR.** « Quelle est la leçon de cette notion » a UNE réponse dans le dépôt
 *  (ADR-0037) ; la deviner ici à partir d'un `skill_id` en ferait une quatrième. */
export interface BlockedTarget {
  lesson_id: number;
  chapter_id: number;
  subject_id: number | null;
  /** L'objet PRODUIT, quand la ligne en a produit un — le `?focus=` des pages de pilotage.
   *  `null` sur une ligne bloquée (rien n'a été produit) et sur un cours, qui EST la leçon. */
  object_id: number | null;
}

export interface JournalEvent {
  skill_id: number | null;
  skill_name: string | null;
  piece: PieceKind | null;
  outcome: EventOutcome;
  detail: string | null;
  created_at: string;
  /** `null` s'il n'y a rien à ouvrir : ligne non bloquée, ou notion sans aucune leçon — auquel cas
   *  le motif le dit déjà, et un lien qui mènerait quelque part malgré tout serait pire. */
  target: BlockedTarget | null;
  /** La cause de ce blocage tient-elle **encore** ? `null` hors d'une ligne bloquée.
   *
   *  ⚠️ **Une annotation au PRÉSENT, jamais une correction du passé.** Le motif d'origine reste
   *  exact — il dit ce qui s'est passé — mais il se lit comme un problème actuel une fois la cause
   *  levée. Deux temps, deux phrases : « non produit, cours jamais rédigé · **depuis résolu** ».
   *
   *  ⚠️ `true` = **plus aucun blocage**, pas « le motif d'origine a disparu ». Une notion passée de
   *  « jamais rédigé » à « à valider » reste bloquée : annoncer résolu ferait renoncer Papa au
   *  geste qui reste. */
  resolved: boolean | null;
}

export interface JournalPiece {
  kind: PieceKind;
  id: number;
  label: string;
  /** `null` sur les cartes SRS : aucune étape de validation n'existe pour elles (constat de code,
   *  pas un oubli — c'est pourquoi A0b est verrouillée au palier 3). Jamais « non validé ». */
  validated_by: ValidatedBy | null;
  /** Où ouvrir cette pièce — la liste des pièces est toujours visible, contrairement au détail.
   *  `null` si la leçon n'est pas résoluble (hors année active, chapitre non validé). */
  target: BlockedTarget | null;
  skill_id: number | null;
  skill_name: string | null;
  /** LA question du veto : la consommation ferme la fenêtre, pas l'horloge. */
  consumed: boolean;
}

/** Le régime nommé, tel qu'il a été CAPTURÉ sur le lot.
 *
 *  `"sur_mesure"` = des paliers qui ne composent aucun préréglage — un état légitime, que
 *  `niveau_de` rend déjà. `null` = lot antérieur à la capture : **non enregistré**, jamais
 *  reconstitué depuis les réglages d'aujourd'hui (doctrine §F.4). */
export type JournalZetisMode = "manuel" | "semi" | "autonome" | "sur_mesure";

export interface JournalRun {
  id: number;
  status: JournalRunStatus;
  trigger: string;
  authorized_by: string;
  /** ⚠️ **Le régime de CE lot, pas celui d'aujourd'hui.** C'est lui qui rend le résultat lisible :
   *  un lot qui n'a rien produit sous *Manual* n'est pas une panne, c'est un gate qui a
   *  fonctionné. Sans ce mot, les deux se ressemblent — les lots #21/#22 du 2026-08-04 ont été
   *  lus comme des échecs. */
  zetis_mode: JournalZetisMode | null;
  /** D'où vient `zetis_mode` : `"capture"` (le lot l'a enregistré au démarrage, il fait foi) ou
   *  `"deduit"` (reconstitué de ce que le lot a **fait** — un cours qu'il a rédigé, un dérivé qu'il
   *  a laissé à relire, une origine que seul le régime *Autonome* peut produire). `null` quand rien
   *  ne le prouve.
   *
   *  ⚠️ **Jamais lu des réglages d'aujourd'hui** : ceux-là ont pu changer depuis. La déduction ne
   *  regarde que des actes, qui n'ont pas changé. */
  zetis_mode_source: "capture" | "deduit" | null;
  chapter_id: number | null;
  total_notions: number | null;
  done_notions: number | null;
  current_skill_id: number | null;
  current_skill_name: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  events: JournalEvent[];
  pieces: JournalPiece[];
}

/** ⚠️ Aucun total de provenance, aucun ratio ZETIS/Papa (§F.2) : la provenance est un fait,
 *  jamais un reproche — elle s'affiche par objet et ne se totalise pas. */
/** Un TRAVAIL unitaire au Journal (addendum ADR-0041 §17) — ce qu'il sait, et rien de plus.
 *
 *  ⚠️ **Ni `zetis_mode`, ni `pieces`, ni `events`, donc aucun veto.** Ce n'est pas un oubli : un
 *  `AIJob` ne grave aucun régime d'autonomie et ne tamponne aucune pièce produite. L'écran ne doit
 *  offrir aucun bouton de retrait sur ces lignes — il ne pourrait rien retirer. */
export interface JournalTravail {
  id: number;
  job_type: string;
  /** Le mot que Papa lit (« Cartes de révision · Mitose »), jamais le `job_type`. */
  label: string;
  status: "queued" | "running" | "stale" | "succeeded" | "failed";
  /** L'ORIGINE, pas le régime : hors lot ⇒ `manual` par construction (§3.2). */
  trigger: string;
  skill_id: number | null;
  skill_name: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  /** Le motif d'échec, **tel quel** — décision du 2026-08-06, il ne se traduit pas. */
  error: string | null;
}

export interface Journal {
  runs: JournalRun[];
  /** Les travaux unitaires de LA MÊME page (addendum ADR-0041 §16) — à entrelacer par date.
   *
   *  ⚠️ Rendus à part plutôt que mêlés à `runs` : un travail ne porte **ni régime, ni pièces, ni
   *  journal ligne à ligne** (§17), et le glisser dans `JournalRun` l'obligerait à faire semblant.
   *  Les entrelacer côté écran n'est pas un tri côté client : la page est déjà la bonne, découpée
   *  en SQL sur l'union des deux modèles. */
  travaux: JournalTravail[];
  /** Pourquoi les travaux sont absents, quand un filtre les écarte (§18) — `null` sinon.
   *  ⚠️ À AFFICHER : une exclusion muette se lit comme un vide. */
  travaux_exclus: string | null;
  has_more: boolean;
  /** Le nombre de lots RETENUS par le filtre — jamais celui de l'histoire entière.
   *
   *  ⚠️ **Ce n'est pas un compteur de provenance** (§F.2, qui vise les totaux « ZETIS vs Papa »,
   *  lesquels jugeraient) : celui-ci sert la pagination et l'état vide. « 7 sur 23 » est juste ;
   *  « 7 sur 7 » cacherait qu'il existe autre chose, et l'état vide n'aurait plus rien à dire. */
  total: number;
}

/** Ce qu'un retrait emporterait. `removable: false` porte TOUJOURS son motif : un refus muet se
 *  lit comme une panne. */
export interface VetoPreview {
  removable: boolean;
  reason: string | null;
  /** Ce que le retrait d'un COURS emporte — il est la source canonique de ses dérivés. */
  cascade: Partial<Record<PieceKind, number[]>>;
}

export interface VetoRemoval {
  removed: Partial<Record<PieceKind, number>>;
}

// --- L'activité de production (ADR-0041) -------------------------------------------------------
//
// La source UNIQUE de toutes les barres de progression Papa : le header et les pages lisent le
// même endpoint. Ce qui disparaît avec ce type, ce sont les 23 constantes de durée en dur — la
// rédaction d'un cours en portait CINQ différentes selon l'écran d'où on la lançait.

/** Un travail en cours, en file, ou échoué — lot pédagogique ou travail unitaire. */
export interface ActivityItem {
  /** `run` = un lot (`ProductionRun`) ; `job` = un travail unitaire (`AIJob`). */
  kind: "run" | "job";
  id: number;
  label: string;
  status: "queued" | "running" | "stale" | "failed";
  /** ⚠️ `null` = **indéterminé**, et JAMAIS `0` pour dire « ça démarre ». Zéro n'est pas une
   *  valeur basse, c'est une absence de mesure — le 2026-08-05, quatre lots arrêtés affichaient
   *  0 %, lu comme « ça commence ». */
  pct: number | null;
  /** Deux régimes de vérité (§6) : `true` = progression RÉELLE calculée serveur (« 7 / 19 ») ;
   *  `false` = estimation ancrée sur `started_at` (« ≈ 40 % »). Un appel LLM n'a aucun grain
   *  interne : les confondre uniformiserait un mensonge. */
  pct_is_measured: boolean;
  /** La FRACTION en **pièces** — « 7 / 19 » (addendum 2 §20). C'est elle qui prouve la mesure :
   *  « 37 % » seul ne se distingue pas d'une estimation bien tournée.
   *
   *  ⚠️ `null` **avec** `pct` et sous exactement la même condition serveur — il existe une fenêtre
   *  où un lot est `running` sans ses compteurs. Les traiter séparément ferait afficher
   *  `null / null · 37 %`. Un travail unitaire n'a aucune pièce : toujours `null`. */
  pieces_done: number | null;
  pieces_total: number | null;
  /** Ce qui est **vraiment** tombé dans la boîte — les pièces `generated` seules, jamais les
   *  `skipped` qui y étaient déjà. Toujours servi (un `COUNT` est exact même hors régime mesuré) :
   *  c'est le badge du stock, pas l'avancement. */
  pieces_produced: number;
  /** La pièce en cours dans la notion en vol — `cours` · `fiche` · `srs` · `quiz` · `mindmap`,
   *  `null` entre deux notions et à la fin.
   *
   *  🔴 **C'est ce champ qui fait bouger la barre.** Les cinq lignes de journal d'une notion
   *  atterrissent d'un seul coup à sa fin : sans cette position, un compte de pièces avancerait
   *  exactement comme un compte de notions (`5/155` = `1/31`), toutes les ~69 s. Un changement de
   *  valeur ici veut dire qu'une pièce vient d'être finie — c'est ce qui lance un jeton sur le
   *  tapis, avec son vrai nom. */
  current_piece: string | null;
  started_at: string | null;
  /** DÉRIVÉ, jamais stocké (§3.2) : un lot porte son déclencheur, un travail hors lot est
   *  manuel par construction. */
  trigger: string | null;
  error: string | null;
  /** 🔴 La durée attendue, **MESURÉE par le serveur** (§9) — médiane des dernières exécutions
   *  réussies de ce type de travail, amorce tant qu'il n'y a pas d'histoire.
   *
   *  C'est ce champ qui a tué les vingt-trois constantes de durée des composants Papa : une barre
   *  locale ne devine plus, elle lit. Deux surfaces ne peuvent plus annoncer deux nombres pour le
   *  même travail, puisqu'il n'y a plus qu'un nombre. */
  estimated_ms: number;
}

export interface ProductionActivity {
  /** Ce qui tourne ; à défaut, le premier de la file. */
  current: ActivityItem | null;
  /** Profondeur de file — jamais un arriéré (§7) : il retombe à zéro tout seul. */
  queued_count: number;
  /** Ce qui attend derrière, **dans l'ordre où la file sera servie** (§7).
   *
   *  ⚠️ Borné à 20 par le serveur, alors que `queued_count` dit le total : une troncature qui ne
   *  se déclare pas se lit comme une exhaustivité. Comparer les deux, c'est savoir s'il en reste. */
  queued: ActivityItem[];
  /** Les échecs NON acquittés. Ils restent jusqu'au clic, pas six secondes. */
  failed: ActivityItem[];
  /** ⚠️ `null` = « la question n'a pas été posée », ce qui n'est PAS `false`. Tester `=== false`. */
  worker_alive: boolean | null;
}
