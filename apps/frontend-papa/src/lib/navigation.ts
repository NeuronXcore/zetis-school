// Entrées de la sidebar Papa (cf. docs/frontend-papa/README.md + SUIVI Étape 3).
// Étape 3 : navigation temporaire. Les vraies pages arrivent à l'Étape 8.
import couvertureIcon from "../assets/app/ZETIS_map_256.png";
export interface NavItem {
  to: string;
  label: string;
  /** Emoji de repli, affiché tant qu'aucun `iconUrl` n'est fourni. Reste le cas de la quasi-
   *  totalité des entrées : une image par ligne de menu alourdirait le bundle sans rien gagner
   *  à 20 px. */
  icon: string;
  /** Pictogramme dessiné, prioritaire sur `icon`. Réservé aux entrées qui ont une identité
   *  visuelle propre ailleurs dans l'app — sinon la sidebar devient un patchwork. */
  iconUrl?: string;
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
  // Agenda juste après le Dashboard (ADR-0025) : en phase 0 Papa est la SEULE source d'items et
  // vient ici pour ÉCRIRE, de façon répétée et hors de tout parcours. Une surface de saisie
  // régulière atteinte par rebond serait sautée. Aucun badge de compteur : un compteur d'items
  // non faits contournerait l'invariant « non probant » par l'affichage.
  { to: "/agenda", label: "Agenda", icon: "🗓️" },
  { to: "/progression", label: "Progression", icon: "📈" },
  { to: "/lacunes", label: "Lacunes", icon: "🧩" },
  { to: "/missions", label: "Missions", icon: "🎯" },
  { to: "/diagnostics", label: "Diagnostics", icon: "🧭" },
  { to: "/conseil", label: "Conseil de classe IA", icon: "🧑‍🏫" },
  { to: "/cahier", label: "Cahier de bord IA", icon: "📓" },
  // ── Production de contenu ── « Couverture » ouvre le groupe : elle est l'UNION des cinq
  // pilotages par type (Programme, Quiz, Fiches, Mindmaps, Cartes, Capsules), pas une vue
  // partielle de plus.
  { to: "/couverture", label: "Couverture", icon: "🗺️", iconUrl: couvertureIcon, startsGroup: true },
  // Boîte de réception des contenus réclamés par Massimo dans le chat (addendum ADR-0027). Pastille
  // de notification (compteur en attente) — c'est une file de TRAVAIL de Papa, pas un signal
  // d'activité de Massimo : le compteur y est légitime (contrairement à l'Agenda, cf. plus haut).
  { to: "/demandes", label: "Demandes de Massimo", icon: "📥" },
  // Journal de production (ADR-0034). Placé juste après la Couverture, dont il est le REVERS :
  // la Couverture dit « qu'est-ce qui manque » (matrice d'état), le Journal dit « qu'est-ce que
  // ZETIS a fait » (flux daté). Aucun badge, aucun compteur : ce serait un ratio de délégation,
  // que le §F.2 interdit — la provenance est un fait, jamais un reproche.
  { to: "/journal", label: "Journal de production", icon: "📜" },
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
