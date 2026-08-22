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
  /** ZETIS est-il SUSPENDU ? (ADR-0063 §6) — la sidebar lit ce GET sur les 22 écrans.
   *
   *  ⚠️ Transport partagé, question distincte, ÉCRITURE SÉPARÉE : la bascule passe par
   *  `PUT /api/settings/production-suspension`, jamais par le PUT d'autonomie. */
  production_suspended: boolean;
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
  /** ZETIS est-il suspendu ? — l'état vit à côté du geste (ADR-0063 §6-§7). */
  production_suspended: boolean;
  /** Le geste « Redémarrer un worker » existe-t-il ici ? Sinon, le MOTIF voyage avec — le même
   *  texte que le 409 de la route, écrit une fois côté serveur. */
  workers_supervision: { supervised: boolean; motif: string | null };
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

// --- 💾 Données (ADR-0065 §7) — l'état de la sauvegarde, jamais un contenu ------------------------
//
// 🔴 Aucun octet d'archive ne passe par HTTP (§1) : ces types ne portent que des noms, des
// tailles, des empreintes et des verdicts. Un champ de contenu qui apparaîtrait ici est une
// violation du périmètre de l'ADR, pas une évolution.

export interface CertificatCible {
  /** La cible est-elle certifiée ET sur un autre volume que les données ? Le refus vient du
   *  serveur, avec son motif — l'UI ne fait que le rendre lisible (adr-0062 §6). */
  valable: boolean;
  motif: string | null;
  /** OÙ la sauvegarde s'écrit — le chemin HÔTE consigné par le certificat. `null` tant que la
   *  cible n'est pas certifiée. Relevé à la relecture d'écran : « certifiée » sans dire où
   *  obligeait Papa à demander. */
  cible: string | null;
}

export interface VerificationArchive {
  archive: string;
  /** `reussie` | `echec`. C'est CE verdict qui donne le mot « sauvegarde » (§7) : sans
   *  restauration à blanc réussie, une archive reste un « export non vérifié ». */
  verdict: string | null;
  verifie_le: string | null;
  /** Le COMPTE des écarts — le détail vit dans l'`output_json` du travail. */
  ecarts: number;
}

/** Le dernier geste de restauration visant une archive (ADR-0067 §2).
 *
 * 🔴 **Ce champ REMPLACE l'ancien « restaurée le … », il ne s'y ajoute pas** : deux formulations
 * d'un même fait finissent par diverger. Son intérêt est le geste INTERROMPU, qui se lisait
 * jusqu'ici comme une archive jamais restaurée — l'étape fautive et son motif étaient écrits
 * dans le sidecar et n'étaient demandés par personne. */
export interface RestaurationArchive {
  /** `null` = geste interrompu : le journal n'a jamais été clos. */
  termine_le: string | null;
  /** 🔴 `reussie` (au bout ET zéro écart) | `avec_ecarts` (au bout, N écarts) | `interrompue`
   *  (ADR-0067 Amendement 1). `reussie` a le même sens que le verdict de vérification.
   *  ⚠️ `avec_ecarts` n'est PAS un échec : le rendre comme une panne ferait relancer un swap. */
  verdict: string;
  /** Le nom BRUT du journal serveur — jamais un libellé réécrit côté front. */
  etape_arretee: string | null;
  /** Rendu TEL QUEL (doctrine ADR-0041 §8 : aucune table de traduction). */
  motif: string | null;
  ecarts: number;
}

export interface ArchiveSauvegarde {
  nom: string;
  taille: number;
  /** De l'horodatage du NOM (zetis-AAAA-MM-JJ-hhmm.tar), pas du mtime. */
  cree_le: string;
  /** Du sidecar `.sha256` ; `null` = sidecar absent ou illisible — l'archive s'affiche quand
   *  même, cacher un fichier présent sur la cible serait un mensonge. */
  sha256: string | null;
  lignes: number | null;
  tables: number | null;
  /** `null` = jamais vérifiée — « export non vérifié » à l'écran, et c'est le point du §7. */
  verification: VerificationArchive | null;
  /** Le verdict de COMPATIBILITÉ (ADR-0066 §5) : la tête Alembic du manifeste est-elle connue
   *  du code installé ? Ne dit RIEN de l'intégrité (ça, c'est `verification`) — les deux
   *  verdicts se cumulent pour « Restaurer ». */
  restaurable: boolean;
  /** Pourquoi pas restaurable — `null` quand `restaurable` est vrai (adr-0062 §6 : un cadenas
   *  muet se lit comme une panne). */
  motif: string | null;
  /** Le dernier geste de restauration (ADR-0067 §2), lu du sidecar `.restauration.json` — le
   *  seul survivant (la ligne du travail meurt au swap). `null` = jamais restaurée, ou sidecar
   *  illisible. ⚠️ Un geste INTERROMPU n'est plus `null` : il porte son verdict, son étape et
   *  son motif. */
  restauration: RestaurationArchive | null;
}

/** Ce qui prend de la place (ADR-0069 §2) — des tailles de ce que ZETIS a **produit**.
 *
 * 🔴 **Aucun espace libre, et c'est un choix** (§1) : il a deux plafonds — le bind-mount rend le
 * disque de l'hôte, la racine du conteneur rend le disque virtuel de Docker — qui ne répondent
 * pas à la même question. Une taille produite est vraie partout, elle ne dépend d'aucun montage.
 *
 * ⚠️ **`null` = non mesurable, `0` = vide.** Un répertoire absent rend 0 ; `pg_database_size`
 * hors Postgres, ou un MinIO injoignable, rendent `null`. L'écran doit dire « non mesurable »,
 * jamais « 0 » : c'est la même confusion qui a fait diagnostiquer une perte de contenu le
 * 2026-08-18 sur des données intactes. */
export interface Occupation {
  /** L'audio (toujours sur disque) + la vidéo du backend ACTIF, en UN nombre. Le backend
   *  inactif n'est jamais interrogé, et jamais affiché à côté (§3). */
  medias: number | null;
  /** La taille LOGIQUE de la base (`pg_database_size`), pas celle du volume Docker. */
  base: number | null;
  /** La somme des `.tar` de la cible — le total que la liste par archive ne donnait pas. */
  archives: number;
  /** 🔴 Le nombre qui compte — et `null` dès qu'un poste manque : un total amputé sans le dire
   *  serait le « chiffre faux le jour où il compte » que le §1 refuse. */
  total: number | null;
  /** 🔴 **Hors total** (§2) — régénérables, et déjà exclus de la sauvegarde. Affichés quand
   *  même : ils dominent tout le reste, les taire en ferait un mystère. */
  modeles: number;
}

export interface Donnees {
  certificat: CertificatCible;
  archives: ArchiveSauvegarde[];
  derniere_verification: VerificationArchive | null;
  occupation: Occupation;
}

/** Le 200 du DELETE d'archive (ADR-0066 §6) : les NOMS retirés de la cible — le tar et TOUS
 *  ses sidecars, rien d'orphelin. Des métadonnées, jamais un contenu. */
export interface ArchiveSupprimee {
  archive: string;
  supprimes: string[];
}

/** Le 202 des deux gestes (`POST /donnees/sauvegarde`, `POST /donnees/verification`) : des
 *  métadonnées d'enfilement — le suivi passe par la barre du header, comme tout travail de file. */
export interface SauvegardeAcceptee {
  job_id: number;
  status: string;
}

/** L'`output_json` d'un `backup_create` réussi (ADR-0067 §6 tel que l'Amendement 2 le restreint).
 *
 *  ⚠️ **Ce n'est PAS une « sauvegarde »** : le tar vient de naître, personne ne l'a rejoué à blanc.
 *  Le mot ne se gagne qu'après un verdict `reussie` de `backup_verify` (ADR-0065 §7), et le §5 de
 *  l'ADR-0067 l'interdit explicitement au toast. « Export », donc, tant que la preuve manque. */
export interface SortieSauvegarde {
  archive: string;
  taille: number;
  sha256: string;
  lignes: number;
  tables: number;
  objets_minio: number;
  fichiers_audio: number;
  tete_alembic: string | null;
}

/** L'`output_json` d'un `backup_verify` — 🔴 **y compris quand il constate des écarts**.
 *
 *  🔴 **Un verdict d'échec est la sortie d'un travail RÉUSSI**, et c'est le piège central de ce
 *  chantier : `verifier_sauvegarde` *retourne* `"reussie" if not ecarts else "echec"`, il ne lève
 *  pas. Le travail passe donc à `succeeded` dans les deux cas, et le suiveur RÉSOUT. Traiter cette
 *  résolution comme un succès ferait annoncer un échec par un toast — ce que le §3 de l'ADR-0067
 *  interdit, et que le §Signaux nomme en premier. */
export interface SortieVerification {
  archive: string;
  sha256: string;
  /** `reussie` | `echec`. C'est LUI qu'il faut lire, jamais le seul fait que la promesse résolve. */
  verdict: string;
  /** Les écarts NOMMÉS — ici le texte, contrairement au compte servi par `GET /donnees`. */
  ecarts: string[];
  verifie_le: string;
}
