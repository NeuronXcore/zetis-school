// Les deux seuls gestes de la file de relecture, par famille (adr-0039 §8).
//
// **On adapte, on ne réinvente pas les appels** : chaque famille a déjà son client, écrit et
// utilisé par sa page de pilotage. Ce module est une table d'aiguillage, rien d'autre — même
// patron que `production.ts::generateForCell`.
//
// Il est PUR au sens du dépôt : aucune dépendance à React, aucun état, testable sans rendu. La
// page ne fait qu'appeler `reviewAction(kind, "validate")`.
//
// ⚠️ **Ni Éditer, ni Régénérer, ni Supprimer.** Relire n'est pas produire. Ces gestes existent, ils
// vivent sur les pages de pilotage, et les faire remonter ici transformerait une file de décision
// en poste de travail.
import { type ReviewKind } from "@zetis/types";
import { rejectFiche, validateFiche } from "./fiches";
import { rejectMindmap, validateMindmap } from "./mindmaps";
import { setCapsuleValidation } from "./capsules";
import { patchChapter, rejectLesson, validateLesson } from "./curriculum";

export type ReviewVerdict = "validate" | "reject";

type Handler = (id: number) => Promise<unknown>;

const HANDLERS: Record<ReviewKind, Record<ReviewVerdict, Handler>> = {
  lesson: { validate: validateLesson, reject: rejectLesson },
  fiche: { validate: validateFiche, reject: rejectFiche },
  mindmap: { validate: validateMindmap, reject: rejectMindmap },
  capsule: {
    validate: (id) => setCapsuleValidation(id, "validate"),
    reject: (id) => setCapsuleValidation(id, "reject"),
  },
  // Le chapitre est le seul à ne pas avoir d'endpoint dédié : sa validation passe par un PATCH
  // porteur d'une `validation_action`. On garde SA convention plutôt que d'en inventer une
  // sixième (ADR-0009 §3 — le référentiel se co-construit par nœud).
  chapter: {
    validate: (id) => patchChapter(id, { validation_action: "validate" }),
    reject: (id) => patchChapter(id, { validation_action: "reject" }),
  },
};

/** Applique le verdict de Papa sur un objet de la file. Lève si l'appel échoue — la page rétablit
 *  alors la ligne qu'elle avait retirée en optimiste. */
export async function reviewAction(
  kind: ReviewKind,
  verdict: ReviewVerdict,
  id: number,
): Promise<void> {
  await HANDLERS[kind][verdict](id);
}
