// La carte des réglages (ADR-0062 §1) — tous les candidats, et où chacun vit.
//
// Cet objet n'est pas un réglage : c'est l'outil qui empêche d'en oublier un. Il liste TOUS les
// candidats, dit lesquels vivent ici, lesquels vivent ailleurs, et lesquels ne vivent nulle part.
//
// ⚠️ **Deux listes d'honnêteté, sans lesquelles « rien oublié » est invérifiable :**
//   • « ailleurs » — le réglage existe, mais pas ici. Sans cette ligne, Papa le cherche dans
//     Paramètres, ne le trouve pas, et conclut qu'il n'existe pas.
//   • « nulle part » — ce qui ne se règle qu'en variable d'environnement ou en dur. C'est la liste
//     qui dit à quel point l'écran est complet EN MONTRANT ce qu'il ne couvre pas.
//
// 🔴 **Une ligne « à décider » n'est pas une ligne à construire.** Le défaut est « ne pas
// construire » : un réglage qu'on n'a jamais eu besoin de changer est une surface de plus à
// maintenir et une décision de moins prise.
//
// ⚠️ **Cette liste est ÉCRITE, donc elle peut vieillir.** Un test-verrou exige que tout `onglet`
// nommé ici soit un onglet réellement rendu — c'est ce qui l'empêche de mentir sur la page
// elle-même. Rien ne la protège de vieillir sur le reste : si elle dérive quand même, c'est
// qu'elle doit être DÉRIVÉE, et l'ADR-0062 en a fait un signal.

/** Les vues de la page. `carte` est la vue par défaut ET la navigation (ADR-0062 §1). */
export type OngletId = "carte" | "autonomie" | "machine" | "massimo" | "papa" | "donnees";

/** Qui le réglage concerne — pas qui le règle. Tout est réglé par Papa. */
export type ConcerneReglage = "ZETIS" | "Massimo" | "Papa" | "machine";

/** Où le réglage vit, du point de vue de la carte.
 *
 *  `ici` — un onglet de cette page le porte.
 *  `ailleurs` — il existe, à l'endroit où la décision se prend.
 *  `nulle` — il ne se règle pas : `.env`, en dur, ou pas du tout.
 *  `decider` — personne n'a encore tranché s'il devait exister. */
export type FamilleReglage = "ici" | "ailleurs" | "nulle" | "decider";

export interface LigneReglage {
  nom: string;
  concerne: ConcerneReglage;
  /** Où ça vit, en toutes lettres — c'est la colonne que Papa lit. */
  ou: string;
  /** L'état de la décision, pas l'état du code. */
  statut: string;
  famille: FamilleReglage;
  /** L'onglet de CETTE page qui le porte. 🔴 Un test-verrou exige qu'il soit rendu. */
  onglet?: OngletId;
  /** La page du dépôt qui le porte, quand il vit ailleurs. */
  lien?: string;
  /** Les clés `app_settings` qui le matérialisent — sert au filtre « s'écarte du défaut ».
   *
   *  ⚠️ Absent ne veut pas dire « jamais modifié » : le régime d'autonomie, par exemple, est
   *  DÉRIVÉ et n'a aucune clé à lui. C'est la doctrine de l'ADR-0032, pas un oubli. */
  cles?: string[];
}

const A = "zetis_autonomy_";
const PALIERS = [
  `${A}a0a_derives`,
  `${A}a0b_cards`,
  `${A}a1_course`,
  `${A}a2_curriculum`,
  `${A}a3_missions`,
  `${A}a4_terminal`,
];

export const INVENTAIRE: LigneReglage[] = [
  // ── Ce qui règle une AUTORITÉ ────────────────────────────────────────────────────────────────
  {
    nom: "Régime d'autonomie (Manual / Hybrid / Autonom)",
    concerne: "ZETIS",
    ou: "ici · Autonomie",
    // Aucune clé : le régime est DÉRIVÉ des six paliers, jamais stocké (ADR-0032). Un régime
    // « modifié » n'a pas de sens — ce sont les paliers qui portent le geste.
    statut: "✅ livré",
    famille: "ici",
    onglet: "autonomie",
  },
  {
    nom: "Palier par classe de contenu (6 classes)",
    concerne: "ZETIS",
    ou: "ici · Autonomie",
    statut: "✅ livré",
    famille: "ici",
    onglet: "autonomie",
    cles: PALIERS,
  },
  {
    nom: "Déclencheur automatique — démarrer sans clic",
    concerne: "ZETIS",
    ou: "ici · Autonomie",
    statut: "✅ livré",
    famille: "ici",
    onglet: "autonomie",
    cles: ["zetis_auto_trigger_enabled"],
  },
  {
    nom: "Veto — retirer ce que ZETIS a servi",
    concerne: "ZETIS",
    ou: "ailleurs · Journal",
    statut: "✅ livré (ADR-0034)",
    famille: "ailleurs",
    lien: "/journal",
  },
  {
    nom: "Suspendre ZETIS",
    concerne: "ZETIS",
    ou: "ici · La machine",
    // Livré le 2026-08-19 (ADR-0063) : sixième régulateur, arrêt au grain de la pièce, état
    // dans la sidebar. Découvert MENSONGER pendant la démo à l'écran : la clé existait en base,
    // le compteur d'en-tête la comptait, et cette ligne disait encore « nulle part » — le filtre
    // « modifiés » annonçait 8 écarts et n'en listait que 2.
    statut: "✅ livré — ADR-0063 : il ne se relève jamais tout seul",
    famille: "ici",
    onglet: "machine",
    cles: ["zetis_production_suspended"],
  },
  {
    nom: "Régulateur de volume du palier 3",
    concerne: "ZETIS",
    ou: "nulle part",
    statut: "⏸ différé — ADR-0032 §5",
    famille: "decider",
  },

  // ── Ce qui atteint MASSIMO ───────────────────────────────────────────────────────────────────
  {
    nom: "Prénom et avatar de Massimo",
    concerne: "Massimo",
    ou: "à venir · Massimo",
    statut: "🎒 tranche 2 — prérequis : le prénom vient de la donnée partout",
    famille: "decider",
  },
  {
    nom: "Niveau et année scolaire active",
    concerne: "Massimo",
    ou: "ailleurs · Années scolaires",
    statut: "✅ livré",
    famille: "ailleurs",
    lien: "/annees",
  },
  {
    nom: "Matières, thèmes, chapitres",
    concerne: "Massimo",
    ou: "ailleurs · Programme",
    statut: "✅ livré",
    famille: "ailleurs",
    lien: "/programme",
  },
  {
    nom: "Heures de travail, jours",
    concerne: "Massimo",
    ou: "ailleurs · Agenda",
    statut: "✅ livré",
    famille: "ailleurs",
    lien: "/agenda",
  },
  {
    // Absent de la maquette, et pourtant c'est le PREMIER réglage à chaud du dépôt (ADR-0025 §10).
    // Une carte qui l'oublie ment sur ce qu'elle couvre.
    nom: "Accès de Massimo à la saisie de l'agenda",
    concerne: "Massimo",
    ou: "ailleurs · Agenda",
    statut: "✅ livré — la bascule est un geste de Papa, là où la décision se prend",
    famille: "ailleurs",
    lien: "/agenda",
    cles: ["agenda_student_entry_enabled"],
  },
  {
    nom: "Engagement hebdomadaire",
    concerne: "Massimo",
    ou: "chez Massimo",
    statut: "🚫 jamais ici — choisi par l'enfant lui-même",
    famille: "ailleurs",
  },
  {
    nom: "Animations et mouvement réduit",
    concerne: "Massimo",
    ou: "à venir · Massimo",
    statut: "🎒 tranche 2 — trois états, jamais un booléen",
    famille: "decider",
  },
  {
    nom: "Taille du texte et espacement",
    concerne: "Massimo",
    ou: "à venir · Massimo",
    statut: "🎒 tranche 2",
    famille: "decider",
  },
  {
    nom: "Police adaptée à la dyslexie",
    concerne: "Massimo",
    ou: "nulle part",
    statut: "⏸ différé — effet contesté ; rouvert par un besoin constaté",
    famille: "decider",
  },
  {
    nom: "Contraste renforcé",
    concerne: "Massimo",
    ou: "nulle part",
    statut: "⏸ différé — un second thème double la surface de test de 22 écrans",
    famille: "decider",
  },
  {
    nom: "Sons et retours audio de l'interface",
    concerne: "Massimo",
    ou: "à venir · Massimo",
    statut: "🎒 tranche 2 — conditionnel : sans son dans le code, pas de réglage",
    famille: "decider",
  },
  {
    nom: "Voix de synthèse (TTS) et vitesse de parole",
    concerne: "Massimo",
    ou: ".env — PIPER_VOICE_MODEL",
    statut: "🎒 tranche 2 — conditionnel : le moteur doit exposer plusieurs voix",
    famille: "decider",
  },
  {
    nom: "Tutoiement, registre, longueur des fiches",
    concerne: "Massimo",
    // Corrigé : la maquette annonçait `packages/prompts`, qui ne contient qu'un README.
    ou: "apps/backend/app/prompts",
    statut: "🚫 jamais — prompts versionnés, pas des curseurs",
    famille: "nulle",
  },
  {
    nom: "Cartes de révision par jour · longueur des quiz",
    concerne: "Massimo",
    ou: "en dur",
    statut: "⏸ différé — rouverts par un signal mesuré : paquets fuis, quiz abandonnés",
    famille: "decider",
  },
  {
    nom: "Seuils de lacune et de « notion maîtrisée »",
    concerne: "Massimo",
    ou: "en dur",
    statut: "🚫 jamais — c'est l'instrument de mesure",
    famille: "nulle",
  },
  {
    nom: "Fuseau horaire",
    concerne: "Massimo",
    ou: "système",
    statut: "🎒 tranche 2 — s'affiche, ne se règle pas ; contrôle de cohérence",
    famille: "decider",
  },
  {
    nom: "Vacances scolaires et zone",
    concerne: "Massimo",
    ou: "nulle part",
    statut: "⏸ différé — source officielle à ingérer plutôt que champ à saisir",
    famille: "decider",
  },
  {
    nom: "Sélecteur d'élève",
    concerne: "Massimo",
    ou: "nulle part",
    statut: "🚫 hors produit — ZETIS est l'app de Massimo (2026-08-19)",
    famille: "nulle",
  },

  // ── Ce qui règle PAPA ────────────────────────────────────────────────────────────────────────
  {
    nom: "Code parental et verrouillage après inactivité",
    concerne: "Papa",
    ou: "à venir · Papa",
    statut: "🔴 le manque le plus sérieux — tranche 3",
    famille: "decider",
  },
  {
    nom: "Sessions ouvertes et révocation",
    concerne: "Papa",
    ou: "nulle part",
    // Corrigé : aucune table de session n'existe. Ce n'est pas un écran, c'est une migration.
    statut: "🚫 jamais — le verrou d'inactivité couvre le risque réel",
    famille: "nulle",
  },
  {
    nom: "Alerte : un travail a échoué",
    concerne: "Papa",
    ou: "à venir · Papa",
    statut: "⏸ tranche 3 — l'échec est déjà lisible dans La machine",
    famille: "decider",
  },
  {
    nom: "Alerte : relecture en attente depuis N jours",
    concerne: "Papa",
    ou: "à venir · Papa",
    statut: "⏸ tranche 3",
    famille: "decider",
  },
  {
    nom: "Alerte : inactivité de Massimo",
    concerne: "Papa",
    ou: "nulle part",
    statut: "🚫 jamais en alerte — la doctrine interdit le décompte de jours manqués",
    famille: "nulle",
  },
  {
    nom: "Résumé hebdomadaire",
    concerne: "Papa",
    ou: "ailleurs · Conseil de classe",
    statut: "⏸ pousser celui qui existe, ne pas en fabriquer un second",
    famille: "ailleurs",
    lien: "/conseil",
  },
  {
    nom: "Canal de notification (e-mail)",
    concerne: "Papa",
    ou: ".env — SMTP",
    statut: "⏸ tranche 3 — un canal, choisi une fois",
    famille: "decider",
  },
  {
    nom: "Thème, densité, animations de la sidebar",
    concerne: "Papa",
    ou: "nulle part",
    statut: "⏸ différé — le correctif décidé était de RALENTIR, pas d'offrir un réglage",
    famille: "decider",
  },
  {
    nom: "Page d'accueil au démarrage",
    concerne: "Papa",
    ou: "nulle part",
    statut: "⏸ différé — un réglage ici sucrerait un problème de navigation",
    famille: "decider",
  },

  // ── Ce qui règle la MACHINE — moteurs ────────────────────────────────────────────────────────
  {
    nom: "Carte tâche → moteur → modèle",
    concerne: "machine",
    ou: "ici · La machine",
    statut: "✅ lecture seule — le routage vit en .env, lu au démarrage",
    famille: "ici",
    onglet: "machine",
  },
  {
    nom: "Modèle de génération",
    concerne: "machine",
    ou: ".env — OLLAMA_MODEL",
    // Corrigé : le banc de l'ADR-0008 a été mesuré sur le MacBook Pro. Des chiffres périmés sous
    // des radios mortes, c'est le piège de l'interrupteur sans effet — en pire.
    statut: "🚫 jamais un sélecteur — banc périmé, et un choix qui ne s'écrit pas est un piège",
    famille: "nulle",
  },
  {
    nom: "Modèle d'embeddings",
    concerne: "machine",
    ou: "ici · La machine",
    statut: "🔒 verrouillé — en changer impose migration + réindex + ré-embed du corpus",
    famille: "ici",
    onglet: "machine",
  },
  {
    nom: "Dérogation cloud (curriculum_*)",
    concerne: "machine",
    ou: "ici · La machine",
    statut: "🔒 verrouillé — ADR-0009, zéro donnée de Massimo",
    famille: "ici",
    onglet: "machine",
  },
  {
    nom: "Clé API Anthropic",
    concerne: "machine",
    ou: ".env",
    statut: "🚫 jamais dans l'UI — seule sa PRÉSENCE s'affiche, en booléen",
    famille: "nulle",
  },
  {
    nom: "Modèle de dictée (Whisper)",
    concerne: "machine",
    ou: "ici · La machine",
    statut: "🔒 local par doctrine — ADR-0012",
    famille: "ici",
    onglet: "machine",
  },
  {
    nom: "Tester le moteur",
    concerne: "machine",
    ou: "ici · La machine",
    statut: "✅ un vrai prompt, une vraie latence — le seul geste de l'onglet",
    famille: "ici",
    onglet: "machine",
  },
  {
    nom: "Prompts actifs et leur version",
    concerne: "machine",
    // Corrigé : `packages/prompts` ne contient qu'un README. Les prompts sont 12 modules backend.
    ou: "ici · La machine",
    statut: "✅ lecture seule — 12 modules versionnés dans apps/backend/app/prompts",
    famille: "ici",
    onglet: "machine",
  },

  // ── Ce qui règle la MACHINE — santé ──────────────────────────────────────────────────────────
  {
    nom: "Services, sondes, latences",
    concerne: "machine",
    ou: "ici · La machine",
    statut: "✅ conçu",
    famille: "ici",
    onglet: "machine",
  },
  {
    nom: "Workers : vivants ET à jour",
    concerne: "machine",
    ou: "ici · La machine",
    statut: "✅ conçu — « vivant » ne veut pas dire « à jour »",
    famille: "ici",
    onglet: "machine",
  },
  {
    nom: "Échecs et acquittement",
    concerne: "machine",
    ou: "ici · La machine",
    statut: "✅ livré côté serveur (ADR-0041), rendu ici",
    famille: "ici",
    onglet: "machine",
  },
  {
    nom: "7 derniers jours — réussis, échoués, durée médiane",
    concerne: "machine",
    ou: "ici · La machine",
    statut: "✅ médiane serveur — une source, là où 23 surfaces devinaient",
    famille: "ici",
    onglet: "machine",
  },
  {
    nom: "Ce qui est sorti de la maison",
    concerne: "machine",
    ou: "ici · La machine",
    // Corrigé : `ai_jobs` n'a pas de colonne provider. Le journal est DÉRIVÉ, et c'est écrit.
    statut: "✅ dérivé de curriculum_* — ai_jobs ne trace pas le provider",
    famille: "ici",
    onglet: "machine",
  },
  {
    nom: "Réglages .env visibles (plafonds, timeout, scan, log)",
    concerne: "machine",
    ou: "ici · La machine",
    statut: "✅ les afficher est le point, pas les régler",
    famille: "ici",
    onglet: "machine",
  },
  {
    nom: "Version installée — tête Alembic",
    concerne: "machine",
    ou: "ici · La machine",
    statut: "✅ conçu — on affiche, on ne lance pas",
    famille: "ici",
    onglet: "machine",
  },
  {
    nom: "Commit installé",
    concerne: "machine",
    ou: "nulle part",
    // Corrigé : `settings.version` vaut "0.1.0" en dur ; le commit n'est pas dans l'image.
    statut: "⏸ différé — demande un ARG ZETIS_COMMIT baké dans le Dockerfile",
    famille: "nulle",
  },
  {
    nom: "Mot de passe de développement en place",
    concerne: "machine",
    ou: "ici · La machine",
    statut: "✅ le bandeau coûte trois lignes",
    famille: "ici",
    onglet: "machine",
  },
  {
    nom: "Dernière visite de Massimo",
    concerne: "machine",
    ou: "ici · La machine",
    statut: "✅ un fait serveur, là où une pastille « front debout » mentirait",
    famille: "ici",
    onglet: "machine",
  },
  {
    nom: "Journal technique",
    concerne: "machine",
    ou: "terminal",
    // Corrigé : la maquette le condamne elle-même. SECURITY.md interdit le verbatim en clair.
    statut: "🚫 jamais — un terminal répond mieux, et sans risque de fuite à l'écran",
    famille: "nulle",
  },
  {
    nom: "Volumes montés, UUID de disque, occupation",
    concerne: "machine",
    ou: "script hôte",
    // `diskutil` n'existe pas dans l'image : les UUID se lisent depuis l'HÔTE, et l'ADR-0065 §3
    // en a fait un CERTIFICAT (`scripts/certifier-cible-sauvegarde.sh` → `.zetis-cible.json`
    // dans la cible) que le backend confronte avant toute sauvegarde. L'occupation, elle,
    // reste non couverte.
    statut: "✅ tenu par l'hôte — certificat de cible (ADR-0065 §3) ; l'occupation reste à part",
    famille: "nulle",
  },
  {
    nom: "Mise à jour (git pull + migrations) · redémarrer un service",
    concerne: "machine",
    ou: "terminal",
    // ⚠️ Un WORKER n'est pas un service : le redémarrer est un geste borné et supervisé — il a sa
    // propre ligne juste en dessous. Ce qui reste interdit ici, c'est le redémarrage du BACKEND
    // ou d'un conteneur entier depuis la page qu'ils servent.
    statut: "🚫 jamais — une mise à jour ratée laisse la page incapable de se décrire",
    famille: "nulle",
  },
  {
    nom: "Redémarrer un worker périmé",
    concerne: "machine",
    ou: "ici · La machine",
    // Livré le 2026-08-19 (chantier A1) : arrêt gracieux, le superviseur relance avec le code à
    // jour. Grisé AVEC son motif quand rien ne supervise — en dev, l'arrêter le tuerait pour de
    // bon. Découvert absent de cette carte pendant la démo à l'écran du chantier voisin.
    statut: "✅ livré — offert seulement supervisé (le cadenas dit pourquoi)",
    famille: "ici",
    onglet: "machine",
  },
  {
    nom: "Accès distant (VPN, HTTPS, CORS)",
    concerne: "machine",
    ou: ".env / infra",
    statut: "🚫 hors UI",
    famille: "nulle",
  },

  // ── Ce qui règle les DONNÉES ─────────────────────────────────────────────────────────────────
  {
    nom: "Sauvegarder · vérifier par restauration à blanc",
    concerne: "machine",
    ou: "ici · Données",
    // Livré par l'ADR-0065 (slices 1-3) : archive scellée sur la cible certifiée, refusée si le
    // couple base/médias ne ferme pas ; vérification = restauration à blanc dans `zetis_verify`.
    // Le mot « sauvegarde » ne s'affiche qu'après un verdict réussi — avant, c'est un export
    // non vérifié.
    statut: "✅ livré — une archive jamais restaurée n'est pas une sauvegarde",
    famille: "ici",
    onglet: "donnees",
  },
  {
    nom: "Restaurer une sauvegarde",
    concerne: "machine",
    ou: "à venir · Données",
    // Phase E, son propre ADR : c'est elle qui suspendra avant de remplacer (ADR-0063 consommé
    // là-bas, jamais ici — la sauvegarde est additive).
    statut: "⏸ phase E — classe A4 : remplace l'état actuel",
    famille: "decider",
  },
  {
    nom: "Cible de sauvegarde (2ᵉ disque)",
    concerne: "machine",
    ou: "script hôte + .env",
    // ZETIS_BACKUP_DIR (fail-closed `:?` en prod) + certificat d'UUID écrit par l'hôte : la
    // règle « refuser si la cible et les données partagent un volume » est TENUE — par le 409
    // de la route, pas par un réglage d'écran. L'onglet Données montre l'état du certificat.
    statut: "✅ livré — certifiée par l'hôte, refus 409 motivé sans certificat (ADR-0065 §3)",
    famille: "ici",
    onglet: "donnees",
  },
  {
    nom: "Copie hors du bureau des PDF importés",
    concerne: "machine",
    ou: "nulle part",
    // 🔴 Corrigé par la MESURE (ADR-0065, 2026-08-19) : ce poste n'existe pas. `rag/upload`
    // extrait le texte vers Postgres et le PDF n'est JAMAIS persisté — les cours importés sont
    // déjà dans le dump. La question hors-site reste entière pour l'ARCHIVE complète (un geste
    // humain sur un fichier, pas une route) — écrite au §Hors périmètre de l'ADR.
    statut: "✅ sans objet — le poste n'existe pas : les PDF ne sont jamais persistés, le texte vit dans le dump",
    famille: "nulle",
  },
  {
    nom: "Occupation disque par famille · cohérence Postgres ↔ MinIO",
    concerne: "machine",
    ou: "à venir · Données",
    statut: "⏸ tranche 4",
    famille: "decider",
  },
  {
    nom: "Purges de rétention (traces, rendus, audio)",
    concerne: "machine",
    ou: "à venir · Données",
    statut: "⏸ tranche 4",
    famille: "decider",
  },
  {
    nom: "Rétention des enregistrements vocaux de Massimo",
    concerne: "Massimo",
    ou: "à venir · Données",
    statut: "🎒 tranche 4 — le défaut d'une donnée sensible est de PARTIR",
    famille: "decider",
  },
  {
    nom: "Remises à zéro portées (contenus, progression, programme, RAG)",
    concerne: "machine",
    ou: "à venir · Données",
    statut: "🎒 tranche 4 — utile chaque semaine, et ça ATTEINT Massimo",
    famille: "decider",
  },
  {
    nom: "Réinitialisation totale",
    concerne: "machine",
    ou: "scripts/",
    // Corrigé : la maquette posait elle-même la question. Ce qui n'existe pas ne se clique pas.
    statut: "🚫 jamais à l'écran — un scripts/reset.py documenté est la bonne place",
    famille: "nulle",
  },
  {
    nom: "Export « les données de Massimo » (RGPD personnel)",
    concerne: "Massimo",
    ou: "à venir · Données",
    statut: "⏸ tranche 4 — un geste ou deux ? question ouverte",
    famille: "decider",
  },
  {
    nom: "Supprimer une donnée précise (voix, production)",
    concerne: "Massimo",
    ou: "nulle part",
    statut: "⏸ différé — une rétention qui s'applique seule vaut mieux qu'un bouton",
    famille: "decider",
  },
  {
    nom: "Niveau et rétention des journaux",
    concerne: "machine",
    ou: ".env — LOG_LEVEL",
    statut: "🚫 jamais un champ — un debug laissé actif écrirait des contenus dans les journaux",
    famille: "nulle",
  },
];
