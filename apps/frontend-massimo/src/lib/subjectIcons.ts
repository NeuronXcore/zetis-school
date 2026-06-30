// Résolution des icônes PNG de matières (apps/frontend-massimo/src/assets/subjects).
// Chargées en glob (chemin absolu app, pas d'alias), résolues par slug.
//
// NB : les fichiers réels sont nommés en underscores + suffixe de taille
// (ex. `histoire_geo_256.png`, `physique_chimie_120.png`), alors que les slugs de
// matières utilisent des tirets (`histoire-geo`). On normalise et on préfère le 256.
const subjectIcons = import.meta.glob("/src/assets/subjects/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const entries = Object.entries(subjectIcons);

function findBySuffix(normalizedSlug: string, suffix: string): string | undefined {
  return entries.find(([path]) => path.endsWith(`/${normalizedSlug}${suffix}.png`))?.[1];
}

/** URL de l'icône d'une matière, ou `undefined` si l'asset manque (repli emoji côté UI). */
export function subjectIconFor(slug: string): string | undefined {
  const normalized = slug.replace(/-/g, "_");
  return (
    findBySuffix(normalized, "_256") ??
    findBySuffix(normalized, "_120") ??
    findBySuffix(normalized, "")
  );
}
