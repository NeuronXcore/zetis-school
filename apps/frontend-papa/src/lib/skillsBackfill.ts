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
