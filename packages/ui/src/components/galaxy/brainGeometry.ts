/**
 * Le cœur de la galaxie : le savoir de Massimo, rendu comme un cerveau (ADR-0024).
 *
 * Il n'existe aucun maillage anatomique dans le dépôt, et en ajouter un (`.glb`) serait une
 * ressource lourde à sourcer et à maintenir. La forme est donc **générée par le code** : une
 * sphère dont on déplace les sommets par des sinusoïdes croisées, ce qui produit des
 * circonvolutions, puis deux lobes accolés — la silhouette qui fait lire « cerveau » plutôt
 * que « caillou ».
 *
 * Déterministe (aucun aléatoire) : la même forme à chaque rendu, donc stable en test.
 *
 * Choix de couleur assumé côté appelant : un cerveau rosé serait organique et jurerait dans
 * une galaxie. Le cœur est lumineux — c'est un cerveau de lumière, pas un organe.
 */
import { BufferGeometry, SphereGeometry } from "three";

/** Amplitude des plis. Au-delà de ~0.09 la surface se replie sur elle-même et s'assombrit. */
const FOLD = 0.075;

/** Un hémisphère : sphère + circonvolutions. */
function lobe(): BufferGeometry {
  const geometry = new SphereGeometry(1, 72, 52);
  const position = geometry.attributes.position;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);

    // Trois sinusoïdes de fréquences non harmoniques : leurs battements évitent le motif
    // régulier d'un ballon de golf et donnent des sillons irréguliers, comme des sulci.
    const folds =
      Math.sin(8.5 * x) * Math.sin(6.5 * y) +
      Math.sin(7.5 * z + 1.7) * Math.cos(5.5 * x) +
      0.6 * Math.sin(11 * y + 0.9) * Math.cos(9 * z);

    const scale = 1 + FOLD * folds;
    position.setXYZ(i, x * scale, y * scale, z * scale);
  }

  // Sans recalcul, l'éclairage resterait celui de la sphère lisse et les plis seraient
  // invisibles : c'est l'ombrage des creux qui donne le relief.
  geometry.computeVertexNormals();
  return geometry;
}

/** Géométrie d'un hémisphère, allouée UNE fois et partagée par les deux lobes. */
export const BRAIN_LOBE = lobe();

/** Position et orientation des deux lobes, en unités de rayon. */
export const BRAIN_LOBES = [
  { x: -0.52, tilt: 0.18 },
  { x: 0.52, tilt: -0.18 },
] as const;

/** Aplatissement d'un lobe : un cerveau est plus long que large, et plus large que haut. */
export const BRAIN_LOBE_SCALE = { x: 0.62, y: 0.78, z: 0.92 } as const;
