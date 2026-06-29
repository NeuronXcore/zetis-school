// Entrées de la sidebar Massimo (cf. SUIVI Étape 2 + docs/frontend-massimo/README.md).
// Étape 2 : navigation temporaire. Les vraies pages arrivent à l'Étape 7.
export interface NavItem {
  to: string;
  label: string;
  icon: string;
}

export const MASSIMO_NAV: NavItem[] = [
  { to: "/", label: "Accueil", icon: "🏠" },
  { to: "/matieres", label: "Matières", icon: "📚" },
  { to: "/diagnostic", label: "Diagnostic", icon: "🧭" },
  { to: "/eli5", label: "ELI5", icon: "💡" },
  { to: "/mindmaps", label: "Mindmaps", icon: "🕸️" },
  { to: "/capsules", label: "Capsules IA", icon: "🎬" },
  { to: "/quiz", label: "Quiz", icon: "✅" },
  { to: "/progression", label: "Progression", icon: "📈" },
  { to: "/missions", label: "Missions", icon: "🎯" },
  { to: "/chat", label: "Chat ZETIS", icon: "💬" },
];
