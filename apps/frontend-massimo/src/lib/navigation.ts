// Entrées de la sidebar Massimo (cf. SUIVI Étape 2 + docs/frontend-massimo/README.md).
// Étape 2 : navigation temporaire. Les vraies pages arrivent à l'Étape 7.
import eli5Icon from "../assets/app/ELI5_256.png";
import quizIcon from "../assets/app/quiz_384.png";
import srsIcon from "../assets/app/SRS-cards_384.png";
import mindmapsIcon from "../assets/app/mindmaps_256.png";

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Icône image de marque (prime sur `icon`). Ex. ELI5. */
  image?: string;
}

export const MASSIMO_NAV: NavItem[] = [
  { to: "/", label: "Accueil", icon: "🏠" },
  // Agenda en position 2, juste après l'Accueil et AVANT Matières (ADR-0025).
  // Contre-intuitif vis-à-vis du flux d'apprentissage, et assumé : l'agenda est le déclencheur
  // en amont, pas une étape. Il double le résumé de l'Accueil plutôt que de le remplacer — ce
  // qui vient du collège doit être atteignable sans passer par un rebond.
  // AUCUNE pastille de compteur ici : un compte d'items non faits contournerait par l'affichage
  // l'invariant « non probant » tenu serveur (ADR-0025 §3).
  { to: "/agenda", label: "Agenda", icon: "🗓️" },
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
  // « Ma Galaxie » à la MÊME position qu'avant (addendum ADR-0024 §A) : le renommage ne doit pas
  // se transformer en 6ᵉ onglet, ce que l'ADR-0024 §1 interdit. Le nombre d'entrées ne bouge pas.
  { to: "/galaxy", label: "Ma Galaxie", icon: "🌌" },
  { to: "/missions", label: "Missions", icon: "🎯" },
  { to: "/chat", label: "Chat ZETIS", icon: "💬" },
];
