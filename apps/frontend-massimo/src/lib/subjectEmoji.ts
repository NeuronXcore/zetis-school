// Emojis de matières alignés sur le frontend Massimo.
// Garde la même identité visuelle des matières entre les deux apps.
//
// ⚠️ Le renvoi d'origine pointait vers `data/mock.ts → SUBJECTS`, **supprimé le 2026-08-11**
// (il alimentait de faux niveaux). Cette table ne dépendait de lui que par ce commentaire :
// elle est autonome, et c'est elle qui fait référence désormais.

export const SUBJECT_EMOJI: Record<string, string> = {
  francais: "📖",
  mathematiques: "➗",
  "histoire-geo": "🌍",
  svt: "🌱",
  anglais: "🇬🇧",
  espagnol: "🇪🇸",
  "physique-chimie": "⚗️",
  technologie: "🛠️",
};

export const DEFAULT_SUBJECT_EMOJI = "📘";

// Palette proposée à Papa quand il crée une matière : les 8 emojis de Massimo
// d'abord, puis quelques choix utiles pour les matières non canoniques.
export const SUBJECT_EMOJI_OPTIONS = [
  "📖",
  "➗",
  "🌍",
  "🌱",
  "🇬🇧",
  "🇪🇸",
  "⚗️",
  "🛠️",
  "📐",
  "🎨",
  "🎵",
  "💻",
  "🏛️",
  "🔬",
  "🎭",
  "⚽",
];

/**
 * Emoji d'une matière : map par slug (identité Massimo) en priorité, puis l'icône
 * choisie côté backend, puis repli générique.
 */
export function subjectEmoji(slug: string, fallback?: string | null): string {
  return SUBJECT_EMOJI[slug] ?? fallback ?? DEFAULT_SUBJECT_EMOJI;
}
