// Entrées de la sidebar Massimo (cf. SUIVI Étape 2 + docs/frontend-massimo/README.md).
// Étape 2 : navigation temporaire. Les vraies pages arrivent à l'Étape 7.
import eli5Icon from "../assets/app/ELI5.png";
import quizIcon from "../assets/app/quiz.png";
import srsIcon from "../assets/app/SRS-cards.png";
import mindmapsIcon from "../assets/app/mindmaps.png";

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Icône image de marque (prime sur `icon`). Ex. ELI5. */
  image?: string;
}

export const MASSIMO_NAV: NavItem[] = [
  { to: "/", label: "Accueil", icon: "🏠" },
  { to: "/matieres", label: "Matières", icon: "📚" },
  // « Révision » après le bloc « apprendre » (Cours vit sous Matières) : j'apprends → j'ancre.
  // Icône de marque SRS-cards (comme ELI5) ; repli emoji 🗂️ si l'asset manque.
  { to: "/revision", label: "Révision", icon: "🗂️", image: srsIcon },
  { to: "/diagnostic", label: "Diagnostic", icon: "🧭" },
  { to: "/eli5", label: "ELI5", icon: "💡", image: eli5Icon },
  // Icône de marque mindmaps.png (comme ELI5/SRS/Quiz) ; repli emoji 🕸️ si l'asset manque.
  { to: "/mindmaps", label: "Mindmaps", icon: "🕸️", image: mindmapsIcon },
  { to: "/capsules", label: "Capsules IA", icon: "🎬" },
  // Fiches de révision (résumé d'une leçon sur une page) — dérivé du cours validé.
  { to: "/fiches", label: "Fiches", icon: "🗂️" },
  // Icône de marque quiz.png (comme ELI5/SRS) ; repli emoji ✅ si l'asset manque.
  { to: "/quiz", label: "Quiz", icon: "✅", image: quizIcon },
  { to: "/progression", label: "Progression", icon: "📈" },
  { to: "/missions", label: "Missions", icon: "🎯" },
  { to: "/chat", label: "Chat ZETIS", icon: "💬" },
];
