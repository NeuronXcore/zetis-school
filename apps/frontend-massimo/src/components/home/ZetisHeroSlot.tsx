// Emplacement du héros ZETIS sur l'Accueil — porte d'entrée du chat (ADR-0026).
//
// ⚠️ C'EST UN SLOT, PAS UN BLOC, et c'est un point de conception, pas un détail.
//
// Sa place est structurée par la refonte de l'Accueil (addendum ADR-0024, slice B) mais il n'est
// PAS RENDU tant que le chat n'existe pas sur cette page : une porte vers du vide est pire que
// pas de porte. Le Groupe 1 (ADR-0026) le remplira ICI, sans rouvrir la composition de
// `AccueilMassimoPage.tsx` — c'est ce qui borne le double passage sur ce fichier, seule raison
// pour laquelle ce chantier n'a pas été adossé au chantier Chat.
//
// Supprimer cet emplacement « pour simplifier » casserait cette propriété. Ce qui viendra ici,
// quand le Groupe 1 le posera :
//
//   - onde vocale en état `idle` (indigo/cyan) ;
//   - accroche « Une question sur un cours, un exercice, une notion ? Pose-la-moi. » ;
//   - bouton FANTÔME « Discuter avec ZETIS » → la surface de chat.
//
// L'or `#ffcf47` est réservé à l'état « ZETIS parle » : sur l'Accueil, ZETIS ne parle pas, et
// le bouton reste fantôme — la seule action accentuée de la page est « Commencer ».

export function ZetisHeroSlot() {
  return null;
}
