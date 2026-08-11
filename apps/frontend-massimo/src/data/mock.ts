// Ce qui reste des données mockées de la Phase 1.
//
// **Élagué le 2026-08-11**, après que la grille `/matieres` a été débranchée (addendum ADR-0024
// « page matière onglets », chantier B). Dix exports sont partis d'un coup, tous devenus morts :
// `ChapterStatus`, `Chapter`, `Subject`, `Capsule`, `SUBJECTS` (les 8 matières et leurs faux
// niveaux), `getSubject`, `RECOMMENDED_CAPSULE`, `CAPSULES`, `DIAGNOSTIC_RESULT`, `MINDMAP`.
//
// 🔴 **Ce n'est pas du ménage de confort.** `SUBJECTS` a alimenté pendant six semaines un
// « Niveau 5 » faux et un « 62 % du chapitre » **interdit par l'ADR-0024 §5**, sur l'écran
// d'entrée de Massimo. Un mock qui traîne finit par réalimenter une surface : il ne suffit pas
// de débrancher l'écran, il faut retirer la prise.
//
// ⚠️ **Ne rien ajouter ici.** Une donnée qui n'a pas encore de route se sert d'un état vide
// honnête, pas d'un faux chiffre — c'est la leçon de `SUBJECTS`.

/** Repli du bandeau XP quand `GET /api/gamification/summary` ne répond pas.
 *
 *  ⚠️ **Seul survivant, et le seul consommateur est `MassimoBannerHeader`.** Son test verrouille
 *  le comportement : *« une panne ne doit pas vider le bandeau »* — d'où ces valeurs.
 *
 *  ⚠️ **Dette assumée, signalée non traitée** : ce repli affiche des chiffres FAUX (niveau 7,
 *  1240 XP) en cas de panne réseau. C'est le même motif que `SUBJECTS`, en plus petit. Le
 *  trancher est une décision produit — montrer un faux nombre, ou ne rien montrer — pas un
 *  nettoyage, et elle n'a pas été prise ici.
 */
export const PROFILE = {
  name: "Massimo",
  level: 7,
  xp: 1240,
  nextLevelXp: 1500,
};
