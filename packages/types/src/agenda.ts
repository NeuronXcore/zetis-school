// Agenda scolaire (ADR-0025) — première source EXOGÈNE du produit : les dates viennent du
// collège, jamais de ZETIS. Objet DÉCLARATIF, à ne pas confondre avec `Mission` (composée sur
// des preuves, complétion vérifiée serveur).
//
// **Deux schémas, jamais un seul filtré côté client** (miroir exact de
// `app/modules/agenda/schemas.py`) : `AgendaItemStudent` pour Massimo, `AgendaItemPilot` pour
// Papa. `parent_note` n'existe QUE sur le second — elle n'est jamais servie à l'élève, et le
// serveur en a un test-verrou sur le JSON sérialisé.

// `lecon` = « leçon à apprendre » (addendum §14). Miroir de `AGENDA_KINDS` — l'ordre est celui
// du tuple Python, et il est celui des menus de saisie.
export type AgendaKind = "devoir" | "lecon" | "controle" | "rendu";
export type AgendaCreator = "student" | "parent";

export interface AgendaSubjectRef {
  id: number;
  slug: string;
  name: string;
  color: string | null;
}

// ── Frontière Massimo ──────────────────────────────────────────────────────────

export interface AgendaItemStudent {
  id: number;
  label: string;
  subject: AgendaSubjectRef | null;
  due_on: string; // YYYY-MM-DD — une échéance est un JOUR
  kind: AgendaKind;
  done: boolean;
  created_by: AgendaCreator;
  /** Marqueur « complété par papa » : booléen dérivé. L'horodatage exact reste Papa-only. */
  edited_by_parent: boolean;
  /** Où mène l'échéance (addendum §15) — la leçon d'abord, le chapitre en repli. Ce sont des
   *  ADRESSES de contenu, pas des données sur Massimo : `parent_note`, `dismissed_at` et les
   *  horodatages restent interdits ici, sans exception. */
  lesson_id: number | null;
  chapter_id: number | null;
  /** Combien de cartes le deck de révision de ce chapitre servirait, PLAFOND COMPRIS (ADR-0049).
   *
   *  🔴 `0` ⇒ la surface ne rend **AUCUNE** porte de révision : ni bouton grisé, ni bouton qui
   *  explique — rien. *« Un bouton mort se lit comme une panne »* (addendum ADR-0025 §14.6).
   *
   *  ⚠️ Ce nombre vient du serveur et **ne se recalcule jamais côté client** : le plafond vit
   *  côté serveur, et une surface qui le recopierait mentirait le jour où il bouge. */
  revisable_cards: number;
}

/** Ce qu'une étape de plan propose de faire (ADR-0050 Décision 2 bis).
 *
 *  Vocabulaire repris de la PANOPLIE (`resolve_panoply`), jamais réinventé. ⚠️ `cours` et `eli5`
 *  n'en font PAS partie : l'échéance offre déjà « lire le cours » (addendum ADR-0025 §15). */
export type AgendaPlanStepKind = "fiche" | "revision" | "quiz";

/** Une étape du plan de préparation d'une échéance (ADR-0050).
 *
 *  Le plan dit **comment s'y prendre** là où l'échéance disait seulement **quoi** — c'est le rôle
 *  de « traducteur » du §8 rôle 1, *« le seul rôle qui justifie la fonctionnalité »*. */
export interface AgendaPlanStep {
  id: number;
  /** Ce que l'étape PRÉPARE (Décision 2 ter). Le plan se rend sous cette échéance ; le jour, lui,
   *  n'utilise `plan_steps` que pour allumer son `✦`. Sans ce champ, une étape flotte sans dire
   *  de quel contrôle elle parle — le cas d'une semaine à deux contrôles. */
  agenda_item_id: number;
  kind: AgendaPlanStepKind;
  /** Jours AVANT l'échéance : `1` = la veille. **Jamais `0`** — on ne planifie pas le jour du
   *  contrôle, ce serait une source d'angoisse et non une aide. */
  day_offset: number;
  skill_id: number | null;
  /** 🔴 **Sa signification dépend du `kind`** : `fiche_id` pour `fiche`, `quiz_id` pour `quiz`,
   *  et le **`chapter_id`** pour `revision`, dont le grain est le chapitre (deck de l'ADR-0049).
   *  Une surface qui l'interpréterait uniformément enverrait Massimo au mauvais endroit. */
  resource_id: number | null;
  /** « coché », JAMAIS « fait » (§14.7). Cocher ne prouve rien : c'est une **déclaration** de
   *  Massimo, sans XP ni célébration — et jouer l'activité ne coche rien (Décision 5, option A). */
  done: boolean;
}

/** Une matière travaillée un jour donné (ADR-0025 Amdt 8 §D2).
 *
 *  🔴 **Remplace le `traces: number` d'origine, il ne s'y ajoute pas.** Le nombre ÉTAIT la phrase
 *  à tuer — « tu as travaillé 3 fois » — et le laisser vivre à côté garantissait qu'une session
 *  le réécrirait un jour. Trois points verts ne disent rien de ce qui a été fait.
 *
 *  ⚠️ **Aucune quantité ici, et il ne faut jamais en ajouter** : ni compte d'événements, ni
 *  minutes, ni XP. Ce type dit *quelles matières*, le détail (notions, formes) se demande au
 *  jour via `AgendaDayTraces`. */
export interface AgendaTrace {
  slug: string;
  name: string;
  /** `Subject.color` de la base — `null` possible. Le client retombe sur `subjectColorFor()`,
   *  jamais sur du gris : c'est le défaut (e) que l'Amdt 8 corrige. */
  color: string | null;
}

export interface AgendaDay {
  date: string;
  /** −3 … +10 par rapport à l'ancre : le client n'a aucun calcul de date à faire. */
  offset: number;
  /** Matières travaillées ce jour-là, plafonnées serveur (`agenda_traces_cap`).
   *
   *  `null` sur un jour à VENIR — jamais `[]` : un jour qui n'est pas encore arrivé n'a pas de
   *  case vide (ADR-0024 §5). `[]` sur un jour passé sans activité, et **`[]` se rend comme
   *  rien du tout** : un jour sans trace est visuellement identique à un jour hors plage (§7). */
  traces: AgendaTrace[] | null;
  /** Les échéances du jour — **passé COMPRIS depuis l'Amdt 8 §R3**.
   *
   *  🔴 L'asymétrie d'origine (`[]` sur le passé) est **révoquée** : un jour passé annonce ce que
   *  l'école demandait. Elle était rejouée à DEUX endroits, serveur et client ; les deux sont
   *  tombés dans le même geste.
   *
   *  ⚠️ `done` voyage toujours sur ces items, et c'est nécessaire — le panneau du jour en a
   *  besoin. Mais **la grille mois ne doit JAMAIS le rendre** : la différence visible
   *  coché/non-coché, répétée sur trente jours, EST le compteur d'arriéré qu'interdit le §7.
   *  C'est une règle de RENDU, pas de contrat : le serveur ne peut pas la tenir à ta place. */
  fixed_items: AgendaItemStudent[];
  /** Les étapes qui tombent CE jour-là, toutes échéances confondues (ADR-0050).
   *
   *  ⚠️ **La bande ne s'en sert que pour allumer son `✦`** — le plan lui-même se rend sous
   *  l'échéance, groupé par `agenda_item_id`. `[]` sur un jour passé : une étape qu'on ne peut
   *  plus faire n'est pas une aide, c'est un reproche. */
  plan_steps: AgendaPlanStep[];
}

export interface AgendaWeek {
  anchor: string;
  days: AgendaDay[];
}

/** La grille mois (ADR-0025 Amdt 8 §D1) — 42 cellules, alignées LUNDI.
 *
 *  Même forme de jour que la bande : une seule primitive de rendu sert les deux vues.
 *  ⚠️ `days` ne contient QUE les jours du mois demandé. Les cellules de complément (avant le 1er,
 *  après le dernier) sont fabriquées **côté client** et rendues totalement vides, sans numéral —
 *  afficher les jours voisins en gris importerait dans le champ de vision les trous d'un mois
 *  qu'on ne regarde pas. */
export interface AgendaMonth {
  /** `YYYY-MM` du mois servi. */
  anchor: string;
  days: AgendaDay[];
  /** Bornes de navigation, décidées SERVEUR (Amdt 8 §D1 / §B6).
   *
   *  🔴 Quand un voisin est `null`, le chevron correspondant **DISPARAÎT** — il n'est jamais
   *  grisé : *« un bouton mort se lit comme une panne »* (§14.6). */
  prev_anchor: string | null;
  next_anchor: string | null;
}

/** Ce que Massimo a travaillé un jour donné (ADR-0025 Amdt 8 §D2 / §D5).
 *
 *  🔴 **Schéma DÉDIÉ, jamais dérivé du `DayDetailOut` de Papa.** Celui-ci transporte `time`,
 *  `minutes`, `xp` et `score_percent` — quatre interdits d'un coup. « Le filtrer côté client »
 *  est exactement la faute que l'en-tête de ce fichier interdit.
 *
 *  ⚠️ **Aucun nombre ne doit jamais entrer ici** : ni compte de cartes, ni durée, ni score, ni
 *  total. Un test-verrou l'assert sur le JSON sérialisé. */
export interface AgendaDayTraces {
  date: string;
  /** Dans l'ordre CHRONOLOGIQUE de première touche — le récit de sa journée, jamais un
   *  classement. Trier par fréquence ou par volume, **c'est mesurer**. */
  subjects: AgendaTraceDetail[];
}

/** Une notion travaillée : son nom pour la lire, son `id` pour y revenir (Amdt 8 §D10). */
export interface AgendaNotionRef {
  id: number;
  name: string;
}

export interface AgendaTraceDetail extends AgendaTrace {
  /** Les notions touchées, dédupliquées, **avec leur identifiant** (Amdt 8 §D10).
   *
   *  🔴 L'`id` est ce qui rend la notion CLIQUABLE : il ouvre sa panoplie réelle
   *  (`fetchNotionPanel`), qui n'annonce que ce qui est disponible. Le contrat ne servait que le
   *  nom, et le bloc racontait donc à Massimo ce qu'il avait fait sans moyen d'y revenir.
   *
   *  ⚠️ **« Notion » et non « chapitre », et c'est un CONSTAT, pas un choix de confort** :
   *  `LearningEvent` porte `skill_id`, et `Skill` n'a aucun `chapter_id`. Il n'existe aucun
   *  chemin événement → chapitre. `[]` quand l'événement n'a pas de notion — la ligne saute
   *  alors dans l'UI, et la matière seule reste une réponse. */
  notions: AgendaNotionRef[];
  /** Les formes de travail (« Cours lu », « Quiz », « Révision SRS »…), dédupliquées, dans un
   *  ORDRE DOCTRINAL FIXE côté serveur — jamais par fréquence. Libellés produits par
   *  `label_for()`, déjà bienveillants par construction. */
  forms: string[];
}

export interface AgendaUpcomingItem {
  id: number;
  label: string;
  subject: AgendaSubjectRef | null;
  due_on: string;
  /** Décompte SUBI (l'échéance existe déjà dans le monde de Massimo), jamais fabriqué. */
  days_left: number;
  /** Vrai SI ET SEULEMENT SI le plan a au moins une étape (ADR-0050). Un `has_plan` optimiste
   *  ferait apparaître un signe qui n'ouvre rien — le bouton mort du §14.6. */
  has_plan: boolean;
}

// ── Frontière Papa ─────────────────────────────────────────────────────────────

export interface AgendaItemPilot {
  id: number;
  label: string;
  subject: AgendaSubjectRef | null;
  subject_id: number | null;
  /** Scope pédagogique choisi dans le référentiel — clé de l'analyse du Lot 3 (ADR-0025 §11). */
  chapter_id: number | null;
  /** Leçon pointée (addendum §15). Sert à POINTER, jamais à scoper une production : le
   *  déclencheur et le Commander restent scopés par `chapter_id`. */
  lesson_id: number | null;
  due_on: string;
  kind: AgendaKind;
  created_by: AgendaCreator;
  /** JAMAIS servie à Massimo. */
  parent_note: string | null;
  /** Écrit uniquement par une route élève : la page Papa l'affiche, ne l'écrit jamais. */
  done_at: string | null;
  dismissed_at: string | null;
  edited_by_parent_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  /** Le plan de préparation de Massimo, **en lecture seule** (ADR-0050 Décision 7).
   *
   *  🔴 **Deux entiers, et aucune étape.** Servir les étapes ici ferait du plan un objet de
   *  pilotage : Papa lirait ce que ZETIS a proposé, puis voudrait le corriger. `0/0` = pas de
   *  plan, et la surface ne rend alors **rien**.
   *
   *  ⚠️ « cochées », JAMAIS « faites » (addendum ADR-0025 §14.7) : le serveur ne sait rien
   *  d'autre qu'un `done_at` posé par une route élève.
   *
   *  ⚠️ Lire ces champs ne **compose** aucun plan — le serveur compte les étapes existantes.
   *  Papa ne doit pas devenir le déclencheur du figement. */
  plan_steps_total: number;
  plan_steps_done: number;
}

export interface AgendaItemDraft {
  label: string;
  due_on: string;
  subject_id?: number | null;
  chapter_id?: number | null;
  /** Renseigné quand l'intitulé a été choisi dans la liste des cours du chapitre (§13.1).
   *  ⚠️ Le serveur refuse en **422** une leçon étrangère au `chapter_id` envoyé. */
  lesson_id?: number | null;
  kind: AgendaKind;
  parent_note?: string | null;
}

export interface AgendaItemPatch {
  label?: string;
  due_on?: string;
  subject_id?: number | null;
  chapter_id?: number | null;
  lesson_id?: number | null;
  kind?: AgendaKind;
}

export interface AgendaSettings {
  /** Verrou de phase (ADR-0025 §10). Bascule par un geste explicite de Papa, jamais calculée. */
  student_entry_enabled: boolean;
}

// ── « Prendre de l'avance » — la troisième question (ADR-0025 Amdt 9) ──────────────────────────

/** Un geste proposé pour préparer l'échéance ancrée.
 *
 *  🔴 **Ni quantité, ni libellé, ni route.**
 *  - *Quantité* : aucun compte de cartes, aucun score, aucune durée. Un test-verrou l'assert sur
 *    le JSON — et il porte sur le **schéma serveur**, seul endroit où une fuite est possible
 *    (`response_model` filtre tout ce qui n'y est pas déclaré).
 *  - *Libellé* : la copie vit côté client, avec le vocabulaire du `CLAUDE.md`. `detail` est une
 *    **donnée** (nom de notion, titre de mindmap), jamais une phrase.
 *  - *Route* : la table de routage est `notionRoutes.ts`, et elle n'existe qu'une fois. */
export interface AgendaAheadGeste {
  kind: "plan" | "mindmap" | "revision" | "mission" | "renforcer";
  /** Ce que le geste désigne : le nom de la notion fragile, le titre de la mindmap, celui de la
   *  mission. `null` quand le geste n'a rien de plus précis à nommer. */
  detail: string | null;
  /** Pour ouvrir LA carte en reconstruction (`/mindmaps/reconstruire/:id`). */
  mindmap_id: number | null;
  /** Pour ouvrir la panoplie de la notion, comme les notions travaillées du panneau (§D10). */
  skill_id: number | null;
}

/** L'échéance que le bloc prépare.
 *
 *  🔴 **Pas de `days_left`.** L'ancre NOMME son jour (« vendredi 21 ») ; elle ne le décompte pas.
 *  §D8 avait retiré « Ce qui arrive » entre autres parce que `days_left` était *« le dernier
 *  décompte chiffré de la page »* — le réintroduire viderait ce motif tout en gardant la
 *  révocation. */
export interface AgendaAheadAnchor {
  item_id: number;
  label: string;
  kind: AgendaKind;
  due_on: string;
  subject: AgendaSubjectRef | null;
  chapter_id: number | null;
  lesson_id: number | null;
}

/** Le bloc entier, en UN appel réseau (cinq sources).
 *
 *  `anchor` à `null` n'est PAS une réponse vide : les gestes qui tiennent debout sans échéance
 *  sont servis quand même. Un bloc qui disparaît se lit comme une panne. */
export interface AgendaAhead {
  anchor: AgendaAheadAnchor | null;
  gestes: AgendaAheadGeste[];
}

/** L'échéance signalée à l'ouverture de la page (ADR-0025 Amdt 9 §D12), ou `null`.
 *
 *  🔴 **UNE échéance, aucun nombre.** Le compteur d'arriéré du §7 est le seul interdit qui n'a
 *  pas bougé de la journée. Pas de `days_late` non plus : le toast NOMME le jour, il ne mesure
 *  pas l'écart — « depuis 4 jours » est un reproche chiffré.
 *
 *  ⚠️ Servie seulement quand elle est **nouvelle** (une date tombée depuis la dernière alerte) et
 *  **pas déjà montrée aujourd'hui**. Les deux conditions se lisent côté serveur sur UNE date par
 *  élève — jamais une marque par item, qui dirait « vu le 12, jamais fait ». */
export interface AgendaLateAlert {
  item_id: number;
  label: string;
  kind: AgendaKind;
  due_on: string;
  subject: AgendaSubjectRef | null;
}
