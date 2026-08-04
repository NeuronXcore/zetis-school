// Le visage des régimes — source UNIQUE, partagée par la sidebar et la page des réglages.
//
// Elle vit ici et non dans `settings.ts` : `settings.ts` est le client d'API et refuse tout
// catalogue (« recopier la matrice du §G.2 côté front en ferait une seconde source de vérité »).
// Une table d'images n'est pas un catalogue de paliers — mais la mêler au client de l'API aurait
// fini par le devenir.
//
// ⚠️ Une seule table pour deux surfaces, et c'est la décision : la sidebar montre le visage qu'on
// vient de choisir sur la page. Deux tables divergeraient au premier ajout de régime, et Papa
// choisirait un visage pour en voir un autre.
import { type AutonomyPreset } from "@zetis/types";

import neutre from "../assets/brand/zetis-avatar_128.png";
import manuel from "../assets/brand/zetis-regime-manuel_128.png";
import semi from "../assets/brand/zetis-regime-semi_128.png";
import autonome from "../assets/brand/zetis-regime-autonome_128.png";

/** Quatre visages pour six états : chargement, erreur et « Sur mesure » partagent le NEUTRE, qui
 *  ne désigne aucun régime. C'est ce qui rend l'addendum §7.4 tenable — il n'existe aucune image
 *  « par défaut » qui ressemblerait à un régime. */
export type Visage = AutonomyPreset | "neutre";

export const REGIME_AVATAR: Record<Visage, string> = { manuel, semi, autonome, neutre };

/** Le halo de la sidebar, gradué par le régime (addendum §7.2). Absent de la page des réglages :
 *  trois cartes qui respireraient en même temps seraient une fête foraine. */
export const REGIME_HALO: Record<Visage, string> = {
  manuel: "regime-halo--manuel",
  semi: "regime-halo--semi",
  autonome: "regime-halo--autonome",
  neutre: "regime-halo--sur-mesure",
};

export const REGIME_BADGE: Record<Visage, string> = {
  manuel: "regime-badge--manuel",
  semi: "regime-badge--semi",
  autonome: "regime-badge--autonome",
  neutre: "regime-badge--sur-mesure",
};

/** Le glyphe du DÉCLENCHEUR — second axe, jamais déductible du régime (addendum §7.1).
 *
 *  ⚠️ Il ne se lit pas seul : partout où il paraît, une phrase le dit en toutes lettres à côté ou
 *  dans le nom accessible. Un pictogramme est un raccourci pour l'œil, jamais l'unique porteur. */
export function declencheurGlyphe(arme: boolean): string {
  return arme ? "⚡" : "⏸";
}
