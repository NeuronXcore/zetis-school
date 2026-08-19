// Paliers d'autonomie de ZETIS (ADR-0032) — contrat de `GET/PUT /api/settings/autonomy`.
//
// ⚠️ Le front ne détient AUCUNE liste de paliers autorisés : `choices` vient du serveur, qui est
// seul à refuser. L'interface ne fait que rendre lisible ce qu'il refuse déjà — dupliquer la règle
// ici la ferait diverger au premier ADR.

// ⚠️ **Deux mots, deux objets** (addendum ADR-0032 §8.0), et les confondre est l'erreur la plus
// facile de ce dossier :
//   • un **NIVEAU** est l'un des trois régimes — il se CHOISIT ;
//   • un **PALIER** est le degré 0-3 d'une classe — il se SUBIT.
// Un niveau décide les paliers de deux classes ; les quatre autres ne l'écoutent pas.

/** 0 jamais · 1 ZETIS propose · 2 ZETIS produit, Papa valide · 3 ZETIS produit ET sert (veto). */
export type AutonomyPalier = 0 | 1 | 2 | 3;

/** Régime nommé, **DÉRIVÉ** des six valeurs par le serveur. `null` = « sur mesure ». */
export type AutonomyNiveau = "manuel" | "semi" | "autonome";

export interface AutonomyClass {
  key: string;
  /** `A0a`, `A0b`, `A1`, `A2`, `A3`, `A4` — la matrice du §G.2. */
  code: string;
  label: string;
  value: AutonomyPalier;
  /** Les paliers offerts. Un seul choix ⇒ verrouillé ; ce qui n'y est pas est refusé (422). */
  choices: AutonomyPalier[];
  locked: boolean;
  /** Motif du verrou ou de la restriction. Présent dès que `choices` est réduit — un cadenas
   *  muet se lit comme une panne. */
  reason: string | null;
}

export interface Autonomy {
  classes: AutonomyClass[];
  /** ⚠️ Le champ garde le nom **`niveau`** alors que son type dit « niveau » : c'est la clé JSON
   *  que le serveur envoie (`settings/service.py`). Renommer ici casserait le contrat sans rien
   *  gagner — le TYPE porte le vocabulaire, le CHAMP porte le réseau. */
  niveau: AutonomyNiveau | null;
  /** ZETIS a-t-il le droit de **démarrer** un lot sans que personne clique ? (ADR-0035 §5)
   *
   *  ⚠️ **Séparé de `classes`, et ce n'est pas un détail de forme.** Deux questions, deux
   *  sources : le palier dit si ZETIS peut **servir** sans relecture, ceci dit s'il peut
   *  **démarrer** sans clic. Le mettre dans `classes` ferait qu'un préréglage l'armerait au
   *  passage, et rendrait impossible « ZETIS sert seul, mais il attend que je demande ».
   *
   *  Défaut : `false`. Papa l'arme explicitement. */
  auto_trigger_enabled: boolean;
}

/** Les réglages qui s'écartent du défaut — contrat de `GET /api/settings/ecarts` (ADR-0062 §4).
 *
 *  ⚠️ **Des CLÉS, jamais des valeurs.** La question est « qu'est-ce qui n'est plus au défaut ? » ;
 *  une valeur n'y répond pas. Et il n'y a rien à calculer : `app_settings` pose que *l'absence de
 *  ligne EST la valeur par défaut*, donc « modifié » = « une ligne existe ».
 */
export interface Ecarts {
  keys: string[];
}

// --- 🧠 La machine (ADR-0062 §2) ----------------------------------------------------------------
//
// ⚠️ **Aucun type d'ÉCRITURE ici, et ce n'est pas un oubli.** Le routage vit en variables
// d'environnement lues au démarrage : un `MachineRequest` serait la première pierre d'un
// interrupteur sans effet.

/** `ok` · `degrade` · `ko`.
 *
 *  🔴 `degrade` n'est PAS un demi-`ko` : c'est « le service répond, mais pas ce qu'on attend de
 *  lui ». C'est l'état qui distingue un volume de modèles non monté d'un modèle mal nommé — deux
 *  pannes qui rendent le même message d'Ollama, et qui n'ont pas le même geste. */
export type EtatSonde = "ok" | "degrade" | "ko";

export interface Sonde {
  nom: string;
  etat: EtatSonde;
  detail: string;
  latence_ms: number | null;
}

export interface MoteurTache {
  tache: string;
  moteur: string;
  modele: string;
  ou: "local" | "cloud";
  ce_qui_part: string;
  /** Motif du verrou — toujours présent quand la ligne est verrouillée. Un cadenas muet se lit
   *  comme une panne. */
  motif: string | null;
}

export interface PromptActif {
  module: string;
  constante: string;
  version: string;
}

export interface WorkerEtat {
  nom: string;
  file: string;
  /** 🔴 L'ÂGE, pas une pastille : un `SimpleWorker` RQ ne recharge jamais le code, donc
   *  « vivant » ne veut pas dire « à jour ». */
  age_minutes: number | null;
}

export interface EchecTravail {
  id: number;
  job_type: string;
  /** Le message DU SERVEUR, relayé tel quel. */
  message: string | null;
  quand: string;
  acquitte: boolean;
}

export interface StatTravail {
  job_type: string;
  reussis: number;
  echoues: number;
  /** `null` et jamais `0` : zéro n'est pas une durée courte, c'est une absence de réponse. */
  mediane_ms: number | null;
}

export interface Echecs {
  /** 🔴 Comptés en base. `lignes` est plafonnée — en déduire un compte ferait dire
   *  « 20 non acquittés » à une base qui en porte 200. */
  total: number;
  non_acquittes: number;
  lignes: EchecTravail[];
}

export interface SortiesReseau {
  actif: boolean;
  destinataire: string | null;
  /** Compté sur 30 jours, jamais `appels.length` : un journal de confidentialité ne sous-compte
   *  pas. */
  total: number;
  appels: { quand: string; tache: string; classe_de_donnees: string }[];
}

export interface ReglageEnv {
  nom: string;
  variable: string;
  valeur: string;
  motif: string;
}

export interface Machine {
  sondes: Sonde[];
  moteurs: MoteurTache[];
  /** 🔴 Un BOOLÉEN de présence. Jamais la valeur, jamais un préfixe. */
  cle_anthropic_presente: boolean;
  prompts: PromptActif[];
  file: { en_attente: number; en_cours: number };
  workers: WorkerEtat[];
  echecs: Echecs;
  sept_derniers_jours: StatTravail[];
  sorties_reseau: SortiesReseau;
  reglages_env: ReglageEnv[];
  installation: {
    version: string;
    alembic_head: string | null;
    mot_de_passe_dev_en_place: boolean;
  };
}

export interface TestMoteur {
  ok: boolean;
  latence_ms: number;
  modele: string;
  detail: string;
}
