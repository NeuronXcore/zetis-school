// Données mockées pour les pages Massimo (Étape 7). Aucune donnée réelle / aucun
// appel backend — remplacées par l'API aux étapes suivantes.

export type ChapterStatus = "prevu" | "en_cours" | "a_renforcer" | "maitrise";

export interface Chapter {
  name: string;
  status: ChapterStatus;
}

export interface Subject {
  slug: string;
  name: string;
  icon: string;
  color: string; // accent hex
  level: number;
  xp: number;
  activeMissions: number;
  nextReview: string;
  progress: number; // 0–100
  nextStep: string;
  toReinforce: string[];
  chapters: Chapter[];
}

export interface Capsule {
  id: string;
  title: string;
  subject: string;
  durationMin: number;
  level: number;
  notion: string;
  seen: boolean;
}

export const PROFILE = {
  name: "Massimo",
  level: 7,
  xp: 1240,
  nextLevelXp: 1500,
};



const CH = (name: string, status: ChapterStatus): Chapter => ({ name, status });

export const SUBJECTS: Subject[] = [
  {
    slug: "francais",
    name: "Français",
    icon: "📖",
    color: "#f472b6",
    level: 5,
    xp: 320,
    activeMissions: 2,
    nextReview: "demain",
    progress: 62,
    nextStep: "Revoir : les temps du récit",
    toReinforce: ["Accord du participe passé", "Temps du récit"],
    chapters: [
      CH("Lecture et compréhension", "maitrise"),
      CH("Grammaire", "en_cours"),
      CH("Orthographe", "a_renforcer"),
      CH("Expression écrite", "prevu"),
    ],
  },
  {
    slug: "mathematiques",
    name: "Mathématiques",
    icon: "➗",
    color: "#60a5fa",
    level: 4,
    xp: 280,
    activeMissions: 1,
    nextReview: "aujourd'hui",
    progress: 48,
    nextStep: "Renforcer les nombres relatifs",
    toReinforce: ["Nombres relatifs", "Comparaison de fractions"],
    chapters: [
      CH("Nombres relatifs", "a_renforcer"),
      CH("Fractions", "en_cours"),
      CH("Proportionnalité", "prevu"),
      CH("Géométrie", "prevu"),
    ],
  },
  {
    slug: "histoire-geo",
    name: "Histoire-Géo",
    icon: "🌍",
    color: "#fbbf24",
    level: 3,
    xp: 190,
    activeMissions: 0,
    nextReview: "dans 3 jours",
    progress: 70,
    nextStep: "Quiz : la Révolution française",
    toReinforce: ["Repères chronologiques"],
    chapters: [
      CH("Le XVIIIe siècle", "maitrise"),
      CH("La Révolution française", "en_cours"),
      CH("Cartographie", "prevu"),
    ],
  },
  {
    slug: "svt",
    name: "SVT",
    icon: "🌱",
    color: "#34d399",
    level: 4,
    xp: 240,
    activeMissions: 1,
    nextReview: "demain",
    progress: 55,
    nextStep: "Capsule : la nutrition végétale",
    toReinforce: ["Nutrition végétale"],
    chapters: [
      CH("Le vivant", "maitrise"),
      CH("Nutrition végétale", "a_renforcer"),
      CH("Reproduction", "prevu"),
    ],
  },
  {
    slug: "anglais",
    name: "Anglais",
    icon: "🇬🇧",
    color: "#a78bfa",
    level: 5,
    xp: 300,
    activeMissions: 1,
    nextReview: "aujourd'hui",
    progress: 66,
    nextStep: "Révision : le prétérit",
    toReinforce: ["Prétérit"],
    chapters: [
      CH("Present simple", "maitrise"),
      CH("Prétérit", "en_cours"),
      CH("Vocabulaire", "en_cours"),
    ],
  },
  {
    slug: "espagnol",
    name: "Espagnol",
    icon: "🇪🇸",
    color: "#fb923c",
    level: 2,
    xp: 110,
    activeMissions: 1,
    nextReview: "dans 2 jours",
    progress: 30,
    nextStep: "Mission : les salutations",
    toReinforce: ["Conjugaison présent"],
    chapters: [
      CH("Salutations", "en_cours"),
      CH("Présent de l'indicatif", "prevu"),
    ],
  },
  {
    slug: "physique-chimie",
    name: "Physique-Chimie",
    icon: "⚗️",
    color: "#22d3ee",
    level: 3,
    xp: 175,
    activeMissions: 0,
    nextReview: "dans 4 jours",
    progress: 44,
    nextStep: "Cours : les états de la matière",
    toReinforce: ["États de la matière"],
    chapters: [
      CH("États de la matière", "en_cours"),
      CH("Circuits électriques", "prevu"),
    ],
  },
  {
    slug: "technologie",
    name: "Technologie",
    icon: "🛠️",
    color: "#94a3b8",
    level: 3,
    xp: 160,
    activeMissions: 0,
    nextReview: "la semaine prochaine",
    progress: 50,
    nextStep: "Mindmap : objets techniques",
    toReinforce: [],
    chapters: [
      CH("Objets techniques", "en_cours"),
      CH("Programmation", "prevu"),
    ],
  },
];

export function getSubject(slug: string): Subject | undefined {
  return SUBJECTS.find((s) => s.slug === slug);
}

export const RECOMMENDED_CAPSULE: Capsule = {
  id: "cap-relatifs",
  title: "Les nombres relatifs en 4 minutes",
  subject: "Mathématiques",
  durationMin: 4,
  level: 4,
  notion: "Nombres relatifs",
  seen: false,
};

export const CAPSULES: Capsule[] = [
  {
    id: "cap-nutrition",
    title: "La nutrition végétale",
    subject: "SVT",
    durationMin: 5,
    level: 4,
    notion: "Nutrition végétale",
    seen: true,
  },
  {
    id: "cap-recit",
    title: "Les temps du récit",
    subject: "Français",
    durationMin: 4,
    level: 5,
    notion: "Temps du récit",
    seen: false,
  },
  {
    id: "cap-fractions",
    title: "Comparer des fractions",
    subject: "Mathématiques",
    durationMin: 6,
    level: 4,
    notion: "Fractions",
    seen: false,
  },
];

// Diagnostic — résultat mocké (forces + prochaines missions, sans tableau anxiogène).
export const DIAGNOSTIC_RESULT = {
  strengths: ["Lecture et compréhension", "Present simple (anglais)", "Repères chronologiques"],
  nextMissions: [
    { subject: "Mathématiques", notion: "Nombres relatifs" },
    { subject: "Français", notion: "Temps du récit" },
    { subject: "SVT", notion: "Nutrition végétale" },
  ],
};

// Mindmap mockée (idée centrale + branches).
export const MINDMAP = {
  notion: "Nutrition végétale",
  branches: [
    { label: "Eau", child: "racines" },
    { label: "Lumière", child: "énergie" },
    { label: "CO₂", child: "feuilles" },
  ],
};
