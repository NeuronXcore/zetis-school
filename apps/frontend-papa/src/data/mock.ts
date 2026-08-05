// Données mockées pour les pages Papa (Étape 8). Aucun appel backend.

export const STUDENT = "Massimo";
export const PERIOD_LABEL = "Semaine du 29/06/2026";

export interface Kpi {
  label: string;
  value: string;
  hint?: string;
}

export const KPIS: Kpi[] = [
  { label: "Sessions (semaine)", value: "4" },
  { label: "XP (semaine)", value: "+180" },
  { label: "Lacunes ouvertes", value: "5" },
  { label: "Missions terminées", value: "3" },
  { label: "Temps actif", value: "2 h 10" },
  { label: "Notions consolidées", value: "3" },
];

export interface Alert {
  subject: string;
  text: string;
  action: string;
}

export const ALERTS: Alert[] = [
  { subject: "Mathématiques", text: "nombres relatifs à renforcer", action: "Créer une mission" },
  { subject: "Français", text: "temps du récit à revoir", action: "Générer une capsule" },
];

export const RECOMMENDATIONS = ["Créer mission", "Générer capsule", "Lancer diagnostic court"];

// `Gap` / `GAPS` supprimés : les pages Lacunes et Mode focus lisent désormais les vraies notions
// via `GET /api/parent/progress/gaps`. Leur vocabulaire de façade (« forte », « en cours ») ne
// correspondait à aucune valeur du backend (`high`, `in_progress`) — le mock ne pouvait donc pas
// être branché tel quel, il fallait le remplacer.

export interface Mission {
  subject: string;
  title: string;
  status: "active" | "terminée" | "à venir";
  xp: number;
}

export const MISSIONS: Mission[] = [
  { subject: "Mathématiques", title: "Renforcer les nombres relatifs", status: "active", xp: 60 },
  { subject: "Français", title: "Revoir les temps du récit", status: "active", xp: 50 },
  { subject: "SVT", title: "Capsule nutrition végétale", status: "à venir", xp: 40 },
  { subject: "Anglais", title: "Quiz prétérit", status: "terminée", xp: 30 },
];

export interface LearningEvent {
  date: string;
  subject: string;
  text: string;
}

export const EVENTS: LearningEvent[] = [
  { date: "29/06", subject: "Mathématiques", text: "Diagnostic court : difficulté sur la comparaison de négatifs. Action proposée : mission + ELI5 reverse." },
  { date: "28/06", subject: "Français", text: "Mission terminée : temps du récit. Score 72 %." },
  { date: "27/06", subject: "SVT", text: "Capsule générée : nutrition végétale (en attente de validation)." },
  { date: "26/06", subject: "Anglais", text: "Lacune résolue : present simple consolidé après 3 réussites." },
];

// `SubjectProgress` / `SUBJECTS_PROGRESS` ont été SUPPRIMÉS le 2026-08-05 (ADR-0038). Ils étaient
// la seule source de la page `/progression`, elle-même cible d'un constat cliquable du dashboard :
// un écran qui prétendait prouver un compte affichait huit lignes inventées. La page lit désormais
// `GET /api/parent/progress/overview`. Ne pas les réintroduire.

export interface PapaCapsule {
  id: string;
  subject: string;
  notion: string;
  state: string;
}

export const CAPSULES_TO_VALIDATE: PapaCapsule[] = [
  { id: "c1", subject: "Mathématiques", notion: "Nombres relatifs", state: "Script prêt · storyboard prêt · audio non généré" },
];

export const CAPSULES_PUBLISHED: PapaCapsule[] = [
  { id: "c2", subject: "SVT", notion: "Nutrition végétale", state: "publiée" },
  { id: "c3", subject: "Français", notion: "Temps du récit", state: "publiée" },
];

export const DIAGNOSTICS = [
  { date: "29/06", scope: "Mathématiques", result: "Comparaison de négatifs fragile", priority: "haute" },
  { date: "15/06", scope: "Toutes matières", result: "3 notions prioritaires identifiées", priority: "moyenne" },
];
