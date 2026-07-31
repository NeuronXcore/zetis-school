// Couleur de matière — REPLI déterministe quand la base n'en porte pas.
//
// `Subject.color` existe en base et est nullable ; c'est lui qui fait autorité. Ce module ne
// sert que de repli, et il est côté client parce qu'une couleur est de la PRÉSENTATION
// (ADR-0028 §3) : deux clients peuvent légitimement l'afficher autrement, aucun statut
// pédagogique n'en dépend.
//
// Les valeurs reprennent la palette qui vivait jusqu'ici dans le mock de l'app Massimo
// (`apps/frontend-massimo/src/data/mock.ts`) : la loger ici permet aux deux interfaces de
// converger sur les mêmes teintes au lieu d'en entretenir deux jeux qui dériveraient.
//
// Aucune de ces couleurs n'encode un jugement — ce sont des identifiants visuels, pas une échelle
// de performance. Le rouge est volontairement absent (doctrine `adr-0024`, étendue au dashboard
// Papa par `adr-0028 §6`).

const PALETTE: Record<string, string> = {
  mathematiques: "#60a5fa",
  francais: "#f472b6",
  "histoire-geo": "#fbbf24",
  svt: "#34d399",
  anglais: "#a78bfa",
  espagnol: "#fb923c",
  "physique-chimie": "#22d3ee",
  technologie: "#94a3b8",
};

/** Teintes de secours pour un slug inconnu, choisies pour rester distinguables entre elles. */
const FALLBACK = ["#60a5fa", "#f472b6", "#fbbf24", "#34d399", "#a78bfa", "#fb923c", "#22d3ee"];

/**
 * Couleur d'une matière : celle de la base si elle existe, sinon une teinte STABLE dérivée du
 * slug.
 *
 * Stable et non aléatoire : une matière qui changerait de couleur d'un rendu à l'autre rendrait
 * le donut et le nuage illisibles d'une visite à la suivante.
 */
export function subjectColorFor(slug: string, color?: string | null): string {
  if (color) return color;
  const known = PALETTE[slug.replace(/_/g, "-")];
  if (known) return known;
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  return FALLBACK[hash % FALLBACK.length];
}
