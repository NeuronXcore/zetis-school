// Logique PURE d'édition de la prévisualisation « skills-only » (ADR-0010) — testée
// exhaustivement, séparée du composant (même convention que chapterActions.ts).
// La prévisualisation est éditable côté client (retrait / renommage / ajout de notions)
// AVANT confirmation ; rien n'atteint la base tant que Papa n'a pas confirmé.
import { type SkillsBackfillGroup, type SkillsBackfillNotion } from "@zetis/types";

/** Groupe éditable = même forme que l'API (`{ scaffold_chapter, notions: string[] }`). */
export type EditableGroup = SkillsBackfillGroup;

/** Retire la notion `ni` du groupe `gi` (immuable). */
export function removeNotion(
  groups: EditableGroup[],
  gi: number,
  ni: number,
): EditableGroup[] {
  return groups.map((g, i) =>
    i === gi ? { ...g, notions: g.notions.filter((_, j) => j !== ni) } : g,
  );
}

/** Remplace le libellé de la notion `ni` du groupe `gi` (renommage inline, immuable). */
export function setNotion(
  groups: EditableGroup[],
  gi: number,
  ni: number,
  name: string,
): EditableGroup[] {
  return groups.map((g, i) =>
    i === gi ? { ...g, notions: g.notions.map((n, j) => (j === ni ? name : n)) } : g,
  );
}

/** Ajoute une notion (`name`, vide par défaut) en fin de groupe `gi` (immuable). */
export function addNotion(
  groups: EditableGroup[],
  gi: number,
  name = "",
): EditableGroup[] {
  return groups.map((g, i) =>
    i === gi ? { ...g, notions: [...g.notions, name] } : g,
  );
}

/** Aplatit la prévisualisation revue en charge utile de confirmation : chaque notion
 *  non vide (espaces normalisés) devient `{ scaffold_chapter, name }`. L'upsert backend
 *  dédup par nom normalisé — les doublons inter-groupes fusionnent côté serveur. */
export function flattenNotions(groups: EditableGroup[]): SkillsBackfillNotion[] {
  const out: SkillsBackfillNotion[] = [];
  for (const g of groups) {
    for (const raw of g.notions) {
      const name = raw.trim().replace(/\s+/g, " ");
      if (name) out.push({ scaffold_chapter: g.scaffold_chapter, name });
    }
  }
  return out;
}

/** Nombre de notions non vides — pilote le compteur et l'activation de « Confirmer ». */
export function countNotions(groups: EditableGroup[]): number {
  return groups.reduce((n, g) => n + g.notions.filter((x) => x.trim() !== "").length, 0);
}

/** Clé de comparaison d'une notion : espaces normalisés + minuscules (dédup insensible
 *  à la casse, cohérente avec l'upsert backend qui déduplique par nom normalisé). */
function normalizeNotion(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Doublons INTER-groupes : une même notion (nom normalisé) présente dans plusieurs
 *  chapitres d'échafaudage. On les *signale* sans les bloquer — l'upsert idempotent les
 *  fusionne côté serveur, bloquer mentirait sur la gravité (ADR-0010). Retour : clé
 *  `"${gi}:${ni}"` → libellés des AUTRES chapitres où la notion réapparaît (dédupliqués,
 *  ordre d'apparition). Les notions vides sont ignorées. */
export function findCrossGroupDuplicates(groups: EditableGroup[]): Map<string, string[]> {
  // 1er passage : normalisé → ensemble ordonné des chapitres qui le contiennent.
  const chaptersByNotion = new Map<string, string[]>();
  for (const g of groups) {
    for (const raw of g.notions) {
      const key = normalizeNotion(raw);
      if (!key) continue;
      const chapters = chaptersByNotion.get(key) ?? [];
      if (!chapters.includes(g.scaffold_chapter)) chapters.push(g.scaffold_chapter);
      chaptersByNotion.set(key, chapters);
    }
  }
  // 2e passage : chaque occurrence dont le nom apparaît dans ≥2 chapitres est marquée,
  // avec la liste des chapitres AUTRES que le sien.
  const out = new Map<string, string[]>();
  groups.forEach((g, gi) => {
    g.notions.forEach((raw, ni) => {
      const key = normalizeNotion(raw);
      if (!key) return;
      const chapters = chaptersByNotion.get(key) ?? [];
      const others = chapters.filter((c) => c !== g.scaffold_chapter);
      if (others.length > 0) out.set(`${gi}:${ni}`, others);
    });
  });
  return out;
}
