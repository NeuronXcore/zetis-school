/**
 * Palette et libellés des cinq états lumineux (ADR-0024 §5).
 *
 * Règle non négociable : AUCUN rouge, aucune couleur ni aucun libellé d'échec. Une notion
 * jamais vue est une étoile pas encore née, pas un manque. On monte du sombre neutre vers
 * le blanc lumineux — c'est une progression, pas une note.
 */
import type { GalaxyStatus } from "@zetis/types";

export interface StarStyle {
  /** Couleur du nœud dans le canvas 3D. */
  color: string;
  /** Rayon relatif — l'étoile grossit à mesure qu'elle s'allume. */
  size: number;
  /** Intensité du halo (0 = aucun). */
  glow: number;
  /** Libellé enfant, le seul montré à Massimo. */
  label: string;
}

export const STAR_STYLES: Record<GalaxyStatus, StarStyle> = {
  unknown: { color: "#3b4166", size: 2.4, glow: 0, label: "À découvrir" },
  weak: { color: "#8b91b8", size: 3.0, glow: 0.25, label: "On commence" },
  learning: { color: "#818cf8", size: 3.6, glow: 0.5, label: "En construction" },
  solid: { color: "#22d3ee", size: 4.2, glow: 0.75, label: "Bien acquis" },
  mastered: { color: "#ffffff", size: 5.0, glow: 1, label: "Maîtrisé" },
};

/** L'ordre de la légende : du plus sombre au plus lumineux. */
export const STATUS_ORDER: GalaxyStatus[] = [
  "unknown",
  "weak",
  "learning",
  "solid",
  "mastered",
];

export const CHAPTER_COLOR = "#6366f1";
/** Cœur de la constellation — plus pâle que les amas : c'est un repère, pas une étape. */
export const SUBJECT_COLOR = "#a5b4fc";

/** Or des liens PARCOURUS — ceux qui mènent à une notion réellement travaillée. */
export const GOLD = "#e8b93f";
/** Or des particules en mouvement, plus clair pour rester lisible sur le fil doré. */
export const GOLD_BRIGHT = "#ffd97a";
/** Lien vers une étoile encore à découvrir : présent, mais discret et immobile. */
export const LINK_DIM = "rgba(255,255,255,0.13)";

/** Nerf : la fibre qui relie le cerveau à une matière. Électrique, pas dorée. */
export const NERVE = "#4fd8ff";
/** Influx qui la parcourt — plus clair que la fibre, pour rester lisible dessus. */
export const NERVE_BRIGHT = "#d6f6ff";

/** Fond de l'app — cible du fondu (`dim`). */
const BACKGROUND = { r: 11, g: 16, b: 32 };

/**
 * Fond un ton vers le fond de page.
 *
 * Sert à ATTÉNUER ce qui n'est pas concerné par un filtre, plutôt qu'à le cacher : masquer
 * ferait sauter la disposition et Massimo perdrait ses repères. `amount` = 0 (inchangé) → 1
 * (entièrement fondu). Ne peut pas produire de teinte rougeâtre : on ne fait que rapprocher
 * du bleu nuit.
 */
export function dim(hex: string, amount: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const value = parseInt(match[1], 16);
  const k = Math.max(0, Math.min(1, amount));
  const mix = (channel: number, target: number) => Math.round(channel + (target - channel) * k);
  const r = mix((value >> 16) & 255, BACKGROUND.r);
  const g = mix((value >> 8) & 255, BACKGROUND.g);
  const b = mix(value & 255, BACKGROUND.b);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Un statut inattendu retombe sur `unknown` plutôt que de faire planter la vue.
 *  Le serveur normalise déjà (`in_progress` → `learning`) ; ceci est une ceinture. */
export function starStyle(status: GalaxyStatus | null | undefined): StarStyle {
  return STAR_STYLES[status as GalaxyStatus] ?? STAR_STYLES.unknown;
}

// ── Plus de plafond de nœuds ─────────────────────────────────────────────────────────
//
// `GALAXY_MAX_NODES` (40 / 90 / 150) et `maxNodesFor()` ont été SUPPRIMÉS le 2026-07-31
// (addendum ADR-0024 « Galaxie animée » §1). Trois motifs, chacun suffisant :
//
//   - le plafond CACHAIT À MASSIMO une partie de sa propre progression, selon un critère
//     qui n'a rien de pédagogique — la taille de son écran ;
//   - ses valeurs n'ont JAMAIS été mesurées (« seul le MacBook a été vérifié ») : ce
//     n'était pas une protection éprouvée, c'était une supposition ;
//   - il ne mordait plus sur la vue par défaut depuis la refonte en système solaire.
//
// Ce qui protège le framerate désormais, ce sont TROIS GARDES qui visent le vrai coût par
// frame, et non un nombre de nœuds : le plafond de PARTICULES (`particleBudget`, dans
// `galaxyGraph.ts` — un objet animé par lien à chaque frame, c'est ça qui coûte, pas des
// sphères statiques), l'arrêt du moteur après stabilisation (`cooldownTicks`) et le repli
// sans WebGL.
//
// ⚠️ Ne pas réintroduire un plafond de nœuds « pour la perf » sans rouvrir l'addendum : si
// un appareil décroche, ce sont les PARTICULES qui tombent, jamais les étoiles.
