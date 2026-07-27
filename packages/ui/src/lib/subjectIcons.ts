// Résolution des pictogrammes PNG de matières — implémentation UNIQUE, partagée par les deux
// interfaces (identité visuelle commune : le même pictogramme désigne la même matière chez
// Massimo et chez Papa).
//
// Les assets vivent désormais dans `packages/ui/src/assets/subjects/` : ils étaient dupliqués à
// l'identique dans les deux apps (17 fichiers × 2), avec un résolveur copié-collé de part et
// d'autre. Les chemins historiques `src/lib/subjectIcons.ts` de chaque app RÉ-EXPORTENT cette
// fonction : les 14 sites d'import existants ne changent pas d'une ligne.
//
// Le glob est RELATIF (et non `/src/assets/...` comme avant) : un chemin absolu se résoudrait à
// la racine de l'app consommatrice, où les assets ne sont plus. Vite résout un motif relatif
// depuis ce fichier-ci, donc depuis le package.
//
// NB : les fichiers sont nommés en underscores + suffixe de taille (`histoire_geo_256.png`),
// alors que les slugs de matières utilisent des tirets (`histoire-geo`). On normalise et on
// préfère le 256.
const subjectIcons = import.meta.glob("../assets/subjects/*.png", {
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
