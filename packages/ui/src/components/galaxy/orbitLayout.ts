// Placement des matières en ORBITE autour du cerveau (vue d'arrivée de `/galaxy`).
//
// Pourquoi un placement calculé plutôt que la simulation de forces : un moteur de forces
// cherche un équilibre, pas une composition. Avec le cœur et huit matières, il produit un amas
// où le cerveau se retrouve à moitié enseveli et les libellés se chevauchent — constaté au
// rendu réel. Ici on ne cherche rien : on POSE les planètes.
//
// Fonctions PURES, sans three ni React — testables, et surtout **déterministes** : la galaxie
// de Massimo doit être la même à chaque visite, sinon ce n'est pas la sienne.

export interface OrbitPlacement {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Rayon de l'orbite, pour dessiner l'anneau correspondant. */
  radius: number;
}

export interface OrbitLayoutOptions {
  /** Rayon de la première orbite. */
  first?: number;
  /** Écart entre deux orbites successives. */
  gap?: number;
  /** Amplitude verticale, en fraction du rayon. `0` = plan strictement plat. */
  tilt?: number;
}

/** Angle d'or : réparti les planètes sans jamais les aligner, quel que soit leur nombre. */
const GOLDEN_ANGLE = 2.399963229728653;

/**
 * Une orbite par matière, dans un plan APLATI — l'écliptique d'un vrai système solaire.
 *
 * « En 3D mais aplati » : les planètes ne sont pas sur un cercle parfaitement plan (ce serait
 * un schéma), mais leur excursion verticale reste faible devant le rayon. On lit un disque,
 * pas une sphère de points.
 *
 * L'ordre reçu est conservé : c'est celui du programme, **jamais un classement** — trier par
 * étoiles allumées mettrait la matière la plus travaillée au centre, et ferait de la galaxie un
 * palmarès (ADR-0024 §5).
 */
export function orbitLayout(
  subjectIds: string[],
  { first = 150, gap = 78, tilt = 0.1 }: OrbitLayoutOptions = {},
): OrbitPlacement[] {
  return subjectIds.map((id, index) => {
    const radius = first + index * gap;
    const angle = index * GOLDEN_ANGLE;
    return {
      id,
      x: Math.cos(angle) * radius,
      // Léger décalage vertical, alterné : assez pour que le disque ait une épaisseur, pas
      // assez pour qu'il redevienne un nuage.
      y: Math.sin(index * 1.7) * radius * tilt,
      z: Math.sin(angle) * radius,
      radius,
    };
  });
}
