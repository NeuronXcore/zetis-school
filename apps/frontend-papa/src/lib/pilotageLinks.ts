// Où mène une cellule de la matrice — une convention, quatre destinations.
//
// Une cellule qui affiche un état sans y donner accès oblige Papa à retrouver l'objet à la
// main sur une autre page. Chaque cellule renseignée pointe donc vers SON objet, sur la page
// de pilotage de son type.
//
// Convention d'URL commune : `?subject=<subject_id>&focus=<object_id>`. La page de destination
// présélectionne la matière, puis met l'objet en évidence. Le cours fait exception — il vit
// dans le référentiel, pas dans une page de pilotage de dérivé : il garde le format de
// Programme (`subject` + `chapter` + `lesson`), déjà en place pour le lien « À valider ».
import { type BlockedTarget, type CoverageCellKey, type PieceKind } from "@zetis/types";

export interface CellTarget {
  subjectId: number;
  chapterId: number;
  lessonId: number;
  objectId: number | null;
}

/** Route de pilotage d'une cellule, ou `null` si rien à ouvrir (cellule vide ou bloquée). */
export function pilotageLink(key: CoverageCellKey, target: CellTarget): string | null {
  const { subjectId, chapterId, lessonId, objectId } = target;
  if (key === "cours") {
    // Le cours EST la leçon : on ouvre le référentiel sur elle, chapitre déplié.
    return `/programme?subject=${subjectId}&chapter=${chapterId}&lesson=${lessonId}`;
  }
  if (objectId === null) return null;
  const page = key === "fiche" ? "/fiches" : key === "mindmap" ? "/mindmaps" : "/quiz";
  return `${page}?subject=${subjectId}&focus=${objectId}`;
}

/** Où mène une ligne du Journal (ADR-0034 addendum) — la même convention, deux sens de lecture.
 *
 *  - ligne **bloquée** (`piece === null`) → le référentiel, pour écrire ou valider le cours ;
 *  - ligne **produite** → la pièce elle-même, sur sa page de pilotage.
 *
 *  ⚠️ **`srs` est traité ICI et pas par `pilotageLink`.** La matrice de Couverture n'a que quatre
 *  colonnes leçon-centrées (`CoverageCellKey`), et les cartes n'en font pas partie : les faire
 *  passer par la branche générique les enverrait sur `/quiz`. Elles ont leur page, et son `focus`
 *  attend un **`skill_id`**, pas un id d'objet — deux différences dans un seul cas, d'où la
 *  branche explicite plutôt qu'une cinquième entrée forcée dans un type qui ne la veut pas.
 */
export function journalLink(
  piece: PieceKind | null,
  target: BlockedTarget,
  skillId: number | null,
): string | null {
  if (target.subject_id === null) return null;
  if (piece === "srs") {
    return skillId === null ? null : `/cartes-revision?subject=${target.subject_id}&focus=${skillId}`;
  }
  // `piece === null` = ligne bloquée : ce qu'il y a à ouvrir est le cours.
  return pilotageLink((piece ?? "cours") as CoverageCellKey, {
    subjectId: target.subject_id,
    chapterId: target.chapter_id,
    lessonId: target.lesson_id,
    objectId: target.object_id,
  });
}
