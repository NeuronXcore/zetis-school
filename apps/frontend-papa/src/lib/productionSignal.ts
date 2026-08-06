// Le réveil de la barre de production (ADR-0041, dette du contrôle 2).
//
// ## Le défaut que ce module ferme
//
// La barre sonde `/activity` toutes les 4 s. Après un clic, elle pouvait donc rester muette
// jusqu'à quatre secondes — et un travail plus court que sa période était **entièrement
// invisible** : le 2026-08-06, un équipement de 11 ms est né et mort entre deux lectures.
//
// ⚠️ **Raccourcir la période ne supprime pas la course**, elle la déplace — et sonder plus souvent
// coûte à toutes les pages, en permanence, pour un gain qui ne sert qu'après un clic. C'est le
// client **qui vient d'enfiler** qui sait qu'il y a du nouveau : il le dit, une fois.
//
// ⚠️ **Ce que ce module ne fait PAS, et il faut le savoir** : il ne rend pas visible un travail
// d'une poignée de millisecondes. Rien ne le peut — quand la réponse du réveil revient, le travail
// est déjà fini. Ce qu'il supprime, c'est la **fenêtre aveugle après un geste** : la barre paraît
// au clic, plus « quelque part dans les quatre secondes ».
//
// Pourquoi un bus et pas un contexte React : les émetteurs sont des fonctions de `lib/`, appelées
// hors de tout composant. Un contexte les obligerait à devenir des hooks.

type Ecouteur = () => void;

const ecouteurs = new Set<Ecouteur>();

/** À appeler juste après un enfilement réussi. Idempotent, sans argument : le message est
 *  « il y a du nouveau », pas « voici quoi » — c'est au serveur de dire quoi. */
export function signalerEnfilement(): void {
  for (const e of [...ecouteurs]) {
    try {
      e();
    } catch {
      // Un écouteur qui échoue ne doit pas empêcher les autres d'être prévenus, ni faire
      // remonter une exception dans le chemin d'enfilement — qui, lui, a réussi.
    }
  }
}

/** S'abonne au réveil. Rend la fonction de désabonnement (patron `useEffect`). */
export function surEnfilement(e: Ecouteur): () => void {
  ecouteurs.add(e);
  return () => ecouteurs.delete(e);
}

/** Uniquement pour les tests : repart d'un bus vide entre deux cas. */
export function _reinitialiserPourTest(): void {
  ecouteurs.clear();
}
