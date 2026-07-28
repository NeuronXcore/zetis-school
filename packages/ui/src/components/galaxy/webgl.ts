/**
 * Détection WebGL — volontairement dans SON PROPRE fichier.
 *
 * Elle doit être appelable sans charger `GalaxyCanvas`, donc sans tirer Three.js
 * (~600 Ko–1 Mo) dans le bundle de départ : c'est précisément la question « peut-on
 * afficher la 3D ? » qu'on pose AVANT de décider de la charger.
 */
export function hasWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}
