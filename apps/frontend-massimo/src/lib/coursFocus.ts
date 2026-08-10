import { type StudentCours } from "@zetis/types";

// Quelle leçon la page Cours met en évidence (addendum ADR-0025 §15, §15.6). Module PUR :
// aucune requête, aucun React — la règle se teste sans rendre une page.

interface Cible {
  /** `?lesson=` — l'identifiant, quand l'échéance en porte un. Il PRIME toujours. */
  lessonId: number | null;
  /** `?chapter=` — le chapitre visé, et la seule fenêtre dans laquelle un titre est cherché. */
  chapterId: number | null;
  /** `?title=` — le libellé de l'échéance, quand elle n'a pas de leçon rattachée. */
  title: string | null;
}

/** La leçon à encadrer, ou `null` s'il n'y a rien à désigner.
 *
 *  **Deux chemins, dans cet ordre.**
 *
 *  1. `lessonId` — posé par Papa en choisissant l'intitulé dans la liste (§13). Certain.
 *  2. **Rattrapage par titre EXACT** (§15.6) — pour les échéances qui n'ont pas de leçon : toutes
 *     celles saisies avant le 2026-08-10, et toutes celles dont l'intitulé a été tapé à la main.
 *     Leur libellé est pourtant souvent, mot pour mot, le titre d'un cours du chapitre.
 *
 *  ⚠️ **Ce n'est PAS la résolution « texte libre → leçon » que le §13.3 a écartée**, et trois
 *  bornes l'en séparent :
 *
 *  - **égalité stricte** (au `trim()` près), jamais une similarité, jamais un embedding ;
 *  - **dans le chapitre visé UNIQUEMENT** — jamais à l'échelle de la matière, où deux chapitres
 *    peuvent porter des leçons homonymes ;
 *  - **rien n'est persisté** : le résultat décide d'un cadre, pas d'une donnée. Aucun `lesson_id`
 *    n'est écrit — la rétro-attribution est refusée par la migration du §15, et elle le reste.
 *
 *  Son pire cas est l'état d'avant : le chapitre déplié, sans cadre. Il ne peut pas désigner la
 *  MAUVAISE leçon — au sein d'un chapitre, un titre identique est le même cours. */
export function resolveFocusLesson(cours: StudentCours | null, cible: Cible): number | null {
  if (cible.lessonId !== null) return cible.lessonId;
  if (!cours || cible.chapterId === null || !cible.title) return null;

  const chapitre = cours.chapters.find((c) => c.id === cible.chapterId);
  if (!chapitre) return null;

  const vise = cible.title.trim();
  return chapitre.lessons.find((l) => l.title.trim() === vise)?.id ?? null;
}
