// Entrées de la sidebar Papa (cf. docs/frontend-papa/README.md + SUIVI Étape 3).
// Étape 3 : navigation temporaire. Les vraies pages arrivent à l'Étape 8.
export interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Ouvre un GROUPE : un séparateur est tracé au-dessus de cette entrée.
   *
   * La sidebar mêle deux familles sans le dire — le suivi de Massimo et la production de
   * contenu. Les séparateurs rendent la structure lisible SANS rien déplacer : aucune entrée
   * n'est supprimée, déplacée ni renommée ici (on ne bouge pas cinq pages en même temps qu'on
   * en crée une). */
  startsGroup?: boolean;
}

export const PAPA_NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/progression", label: "Progression", icon: "📈" },
  { to: "/lacunes", label: "Lacunes", icon: "🧩" },
  { to: "/missions", label: "Missions", icon: "🎯" },
  { to: "/diagnostics", label: "Diagnostics", icon: "🧭" },
  { to: "/conseil", label: "Conseil de classe IA", icon: "🧑‍🏫" },
  { to: "/cahier", label: "Cahier de bord IA", icon: "📓" },
  // ── Production de contenu ── « Couverture » ouvre le groupe : elle est l'UNION des cinq
  // pilotages par type (Programme, Quiz, Fiches, Mindmaps, Cartes, Capsules), pas une vue
  // partielle de plus.
  { to: "/couverture", label: "Couverture", icon: "🗺️", startsGroup: true },
  { to: "/annees", label: "Années scolaires", icon: "🗓️" },
  { to: "/programme", label: "Programme", icon: "📖" },
  { to: "/cartes-revision", label: "Cartes de révision", icon: "🗂️" },
  { to: "/quiz", label: "Quiz", icon: "✅" },
  { to: "/matieres", label: "Matières", icon: "📚" },
  { to: "/sources", label: "Sources de cours", icon: "📥" },
  { to: "/capsules", label: "Capsules IA", icon: "🎬" },
  // Fiches de révision (📄 pour ne pas doublonner 🗂️ des Cartes de révision).
  { to: "/fiches", label: "Fiches", icon: "📄" },
  { to: "/mindmaps", label: "Mindmaps", icon: "🧠" },
  { to: "/focus", label: "Mode focus", icon: "🔍" },
  { to: "/parametres", label: "Paramètres", icon: "⚙️", startsGroup: true },
];
