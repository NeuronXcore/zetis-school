// Illustration et destination d'un message de ZETIS — fonctions PURES, testées.
//
// Le client choisit une image et une route à partir du `code` servi ; il ne relit jamais le
// texte, et ne le recompose jamais. C'est la seule liberté qu'il a sur un message.

/** Emoji d'accompagnement par code. L'avatar de ZETIS est réservé aux codes RELATIONNELS
 *  (première visite, retour, reprise) : c'est là que « ZETIS se souvient » doit avoir un visage. */
const VISUALS: Record<string, { emoji: string; avatar: boolean }> = {
  first_visit: { emoji: "👋", avatar: true },
  // Jamais ⏰ ni 😴 : aucun signe de temps écoulé ne doit accompagner un retour.
  back_after_break: { emoji: "🌱", avatar: true },
  back_short_break: { emoji: "☀️", avatar: true },
  no_goal_yet: { emoji: "🎯", avatar: false },
  goal_reached_today: { emoji: "🎉", avatar: false },
  goal_reached: { emoji: "✨", avatar: false },
  progress_visible: { emoji: "📈", avatar: false },
  resume_notion: { emoji: "🔖", avatar: true },
  reviews_due: { emoji: "🔁", avatar: false },
  all_clear: { emoji: "🌙", avatar: false },
  // Clôture de séance.
  week_goal_reached: { emoji: "🏆", avatar: false },
  mission_in_progress: { emoji: "🧭", avatar: true },
  reviews_left: { emoji: "🔁", avatar: false },
  day_done: { emoji: "✅", avatar: false },
};

/** Repli sur l'avatar seul : un code inconnu (backend étendu) ne doit pas empêcher le TEXTE
 *  serveur de s'afficher. */
const FALLBACK = { emoji: "", avatar: true };

export function visualForCode(code: string): { emoji: string; avatar: boolean } {
  return VISUALS[code] ?? FALLBACK;
}

/** Destination logique → route de l'app. Table explicite : aucune route n'est devinée. */
const ROUTES: Record<string, string> = {
  missions: "/missions",
  revision: "/revision",
  matieres: "/matieres",
  cours: "/matieres",
  mindmaps: "/mindmaps",
  eli5: "/eli5",
  capsules: "/capsules",
  progression: "/progression",
  accueil: "/",
};

/** `null` pour une cible inconnue → le bouton est masqué. Mieux vaut aucun bouton qu'un bouton
 *  mort ou qu'une navigation devinée ; l'énuméré backend peut grandir sans casser le client. */
export function ctaRoute(target: string | null | undefined): string | null {
  if (!target) return null;
  return ROUTES[target] ?? null;
}
