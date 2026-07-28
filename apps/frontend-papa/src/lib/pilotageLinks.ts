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
import { type CoverageCellKey } from "@zetis/types";

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
