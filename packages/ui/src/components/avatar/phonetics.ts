// Pseudo-analyse phonétique (français) — le PRODUCTEUR du flux d'articulation.
//
// CONTRAT GELÉ (ADR-0026 slice B) : le flux est `[ouverture, grave, médium, aigu]`. En Lot 1, il
// est DÉRIVÉ DU TEXTE (pas d'audio) — c'est lui qui fait « parler » l'avatar sans son. La SOURCE
// changera (un `AnalyserNode` Web Audio quand le TTS serveur arrivera), le CONSOMMATEUR
// (`AvatarCanvas`) jamais. Ne pas réécrire ces maths : les transposer.
//
// Les nasales/occlusives ferment la bouche, les sifflantes chargent les aigus, les voyelles
// ouvertes chargent le grave.

/** `[ouverture, grave, médium, aigu]`, chaque composante ~[0..1]. */
export type Articulation = readonly [number, number, number, number];

export const SILENCE: Articulation = [0, 0, 0, 0];
const DEFAULT_PH: Articulation = [0.3, 0.4, 0.5, 0.4];

const PHON: Record<string, Articulation> = {
  a: [1.0, 0.95, 0.45, 0.1], à: [1.0, 0.95, 0.45, 0.1], â: [1.0, 0.95, 0.45, 0.1],
  o: [0.8, 0.95, 0.3, 0.08], ô: [0.8, 0.95, 0.3, 0.08],
  e: [0.5, 0.7, 0.6, 0.15], é: [0.45, 0.55, 0.8, 0.2], è: [0.55, 0.65, 0.7, 0.18], ê: [0.55, 0.65, 0.7, 0.18],
  i: [0.32, 0.35, 0.85, 0.35], î: [0.32, 0.35, 0.85, 0.35], y: [0.32, 0.35, 0.85, 0.35],
  u: [0.28, 0.75, 0.25, 0.1], û: [0.28, 0.75, 0.25, 0.1], ù: [0.28, 0.75, 0.25, 0.1],
  m: [0.02, 0.85, 0.15, 0.03], n: [0.1, 0.75, 0.3, 0.05],
  p: [0.0, 0.4, 0.35, 0.3], b: [0.0, 0.45, 0.3, 0.2],
  t: [0.2, 0.25, 0.45, 0.7], d: [0.22, 0.35, 0.45, 0.45],
  k: [0.24, 0.3, 0.4, 0.6], g: [0.24, 0.4, 0.35, 0.35], q: [0.24, 0.3, 0.4, 0.6],
  s: [0.22, 0.1, 0.35, 1.0], ç: [0.22, 0.1, 0.35, 1.0], z: [0.24, 0.15, 0.4, 0.9],
  c: [0.24, 0.2, 0.4, 0.75], x: [0.24, 0.2, 0.4, 0.85],
  f: [0.18, 0.12, 0.3, 0.85], v: [0.2, 0.2, 0.4, 0.6], h: [0.3, 0.2, 0.3, 0.3],
  j: [0.26, 0.2, 0.5, 0.7], l: [0.38, 0.55, 0.6, 0.2], r: [0.4, 0.5, 0.55, 0.45],
  w: [0.3, 0.7, 0.3, 0.1],
};

/**
 * Articulation d'un mot à un instant relatif `progress ∈ [0..1]` (elapsed / durée du mot).
 * Renvoie `SILENCE` sur les pauses inter-mots et sur la queue des occlusives (énergie à l'attaque
 * seule). Fonction PURE — testable, sans état, sans horloge.
 */
export function phonemeForWord(text: string, progress: number): Articulation {
  const letters = text.toLowerCase().replace(/[^a-zà-ÿ]/g, "");
  if (!letters.length) return SILENCE;
  if (progress >= 1) return SILENCE; // pause inter-mot : bouche close
  const clamped = Math.max(0, progress);
  const li = Math.min(letters.length - 1, Math.floor(clamped * letters.length));
  const ph = PHON[letters[li]] ?? DEFAULT_PH;
  if (ph[0] === 0) {
    // occlusive : énergie à l'attaque seulement (première fraction du créneau de lettre)
    const inSlot = clamped * letters.length - li;
    if (inSlot > 0.42) return SILENCE;
  }
  return ph;
}
