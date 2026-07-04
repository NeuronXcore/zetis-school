// Entrées de la sidebar Papa (cf. docs/frontend-papa/README.md + SUIVI Étape 3).
// Étape 3 : navigation temporaire. Les vraies pages arrivent à l'Étape 8.
export interface NavItem {
  to: string;
  label: string;
  icon: string;
}

export const PAPA_NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/progression", label: "Progression", icon: "📈" },
  { to: "/lacunes", label: "Lacunes", icon: "🧩" },
  { to: "/missions", label: "Missions", icon: "🎯" },
  { to: "/diagnostics", label: "Diagnostics", icon: "🧭" },
  { to: "/conseil", label: "Conseil de classe IA", icon: "🧑‍🏫" },
  { to: "/cahier", label: "Cahier de bord IA", icon: "📓" },
  { to: "/annees", label: "Années scolaires", icon: "🗓️" },
  { to: "/programme", label: "Programme", icon: "📖" },
  { to: "/cartes-revision", label: "Cartes de révision", icon: "🗂️" },
  { to: "/quiz", label: "Quiz", icon: "✅" },
  { to: "/matieres", label: "Matières", icon: "📚" },
  { to: "/sources", label: "Sources de cours", icon: "📥" },
  { to: "/capsules", label: "Capsules IA", icon: "🎬" },
  { to: "/focus", label: "Mode focus", icon: "🔍" },
  { to: "/parametres", label: "Paramètres", icon: "⚙️" },
];
