/**
 * Chorégraphie d'arrivée de la vue par défaut de `/galaxy` (addendum ADR-0024 §3).
 *
 * Le cerveau apparaît SEUL. Puis les matières naissent au centre et rejoignent leur créneau
 * orbital, décalées les unes des autres. Le trait d'orbite se trace DERRIÈRE sa planète,
 * jamais avant — une orbite vide annoncerait une place à remplir, donc un manque.
 *
 * C'est un TWEEN, pas une convergence : le moteur de forces reste éteint. Un moteur cherche
 * un équilibre, pas une composition — avec le cerveau et huit matières il produisait un amas
 * où le cœur était à moitié enseveli (constaté au rendu réel, addendum §C du 2026-07-31).
 *
 * Fonctions PURES, sans Three ni React : c'est ici que le rythme se teste.
 *
 * ⚠️ L'ordre reçu est celui du PROGRAMME, jamais un classement. Trier par ancienneté ferait
 * de cet écran un mini-rejeu ; trier par nombre d'étoiles en ferait un palmarès (ADR-0024 §5).
 */

/** Apparition du cerveau, seul. */
export const CORE_IN = 420;
/** Décalage entre deux matières : elles naissent l'une après l'autre, pas en bloc. */
export const PLANET_STAGGER = 80;
/** Trajet centre → créneau orbital. */
export const PLANET_TRAVEL = 700;
/** Tracé de l'orbite, à l'arrivée de sa planète. */
export const ORBIT_DRAW = 600;

/** Départ franc, arrivée posée — le mouvement d'un objet qui se range, pas d'un ressort. */
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Instant où la matière de rang `index` quitte le centre. */
export function planetBirth(index: number): number {
  return CORE_IN + index * PLANET_STAGGER;
}

/** Durée totale de l'arrivée, après quoi la composition est celle de la vue par défaut. */
export function arrivalDuration(planetCount: number): number {
  if (planetCount <= 0) return CORE_IN;
  return planetBirth(planetCount - 1) + PLANET_TRAVEL + ORBIT_DRAW;
}

/** Opacité du cerveau : il est là avant tout le monde, et seul. */
export function coreOpacity(elapsed: number): number {
  return clamp01(elapsed / CORE_IN);
}

/**
 * Fraction du trajet de la matière de rang `index` — `0` au centre, `1` à son créneau.
 *
 * Renvoie `0` tant qu'elle n'est pas née : elle attend DANS le cerveau, invisible, et
 * n'apparaît qu'en partant. C'est ce qui fait lire une naissance et non un défilé.
 */
export function planetProgress(elapsed: number, index: number): number {
  const birth = planetBirth(index);
  if (elapsed <= birth) return 0;
  return clamp01((elapsed - birth) / PLANET_TRAVEL);
}

/** Une matière est visible dès l'instant où elle quitte le centre, pas avant. */
export function planetIsBorn(elapsed: number, index: number): boolean {
  return elapsed > planetBirth(index);
}

/**
 * Opacité du trait d'orbite — `0` tant que sa planète n'est pas arrivée.
 *
 * L'invariant tient dans la première ligne : `elapsed <= arrival` ⇒ `0`. Une orbite tracée
 * avant sa planète est interdite par le §4, et c'est le genre de détail qu'un « lissage »
 * bien intentionné casse sans le voir.
 */
export function ringOpacity(elapsed: number, index: number, full: number): number {
  const arrival = planetBirth(index) + PLANET_TRAVEL;
  if (elapsed <= arrival) return 0;
  return full * clamp01((elapsed - arrival) / ORBIT_DRAW);
}

/** Position d'une matière à l'instant `elapsed` : du centre vers son créneau. */
export function planetPosition(
  elapsed: number,
  index: number,
  slot: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const k = easeOutCubic(planetProgress(elapsed, index));
  return { x: slot.x * k, y: slot.y * k, z: slot.z * k };
}
