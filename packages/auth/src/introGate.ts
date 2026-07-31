// Portail de l'intro de marque : décide si l'animation ZETIS doit être jouée.
//
// Règle : une fois par session ET par espace. `sessionStorage` étant cloisonné par
// origine, Massimo (5173) et Papa (5174) ont chacun leur drapeau — c'est voulu.
//
// Aucun accès direct au DOM ici : la logique reste testable en environnement node,
// et toute indisponibilité du stockage (navigation privée, cookies bloqués) retombe
// sur « on joue l'intro » plutôt que sur une exception qui casserait la connexion.

const INTRO_SEEN_KEY = "zetis_intro_seen";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** L'intro doit-elle être jouée à cette arrivée sur la page de connexion ? */
export function shouldPlayIntro(): boolean {
  try {
    if (globalThis.sessionStorage?.getItem(INTRO_SEEN_KEY)) return false;
  } catch {
    // sessionStorage inaccessible : on ignore le drapeau, on ne bloque pas.
  }

  try {
    if (globalThis.matchMedia?.(REDUCED_MOTION_QUERY).matches) return false;
  } catch {
    // matchMedia absent (SSR, env de test) : pas de préférence connue.
  }

  return true;
}

/** Mémorise que l'intro a été vue (ou coupée) pour le reste de la session. */
export function markIntroSeen(): void {
  try {
    globalThis.sessionStorage?.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    // Sans stockage, l'intro rejouera : dégradation acceptable.
  }
}
