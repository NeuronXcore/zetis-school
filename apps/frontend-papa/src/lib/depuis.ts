/** Depuis combien de temps — « il y a 4 min », en mots de Papa.
 *
 * Le popover de production disait ce qui se passe, jamais **depuis quand**. Or c'est la première
 * question qu'on se pose devant un travail en cours : quatre minutes et trente-six minutes ne se
 * regardent pas de la même façon.
 *
 * ⚠️ **Aucun minuteur ici, et c'est délibéré.** `useProductionActivity` sonde toutes les 4 s et
 * provoque le rendu : la valeur se rafraîchit d'elle-même, au rythme de la seule chose qui puisse
 * la faire changer. Un `setInterval` ferait battre le composant entre deux sondages pour afficher
 * exactement le même mot.
 *
 * ⚠️ **Fonction PURE, `maintenant` injectable.** Sans ce paramètre, le test dépendrait de l'heure
 * qu'il est — et ce dépôt a déjà deux tests du dashboard qui se relaient au rouge autour de minuit
 * pour exactement cette raison.
 */

/** Rend « il y a 4 min ». Chaîne vide si l'instant est inconnu — un travail en file n'a pas démarré. */
export function depuis(iso: string | null | undefined, maintenant = Date.now()): string {
  if (!iso) return "";
  const debut = Date.parse(iso);
  if (Number.isNaN(debut)) return "";

  const secondes = Math.floor((maintenant - debut) / 1000);
  // Une horloge client en avance sur le serveur donnerait « il y a -3 s ». On borne à zéro plutôt
  // que d'afficher une durée négative, qui se lirait comme un bug plus que comme un décalage.
  if (secondes < 1) return "à l'instant";
  if (secondes < 60) return `il y a ${secondes} s`;

  const minutes = Math.floor(secondes / 60);
  if (minutes < 60) return `il y a ${minutes} min`;

  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  // ⚠️ `1 h 05` et non `1 h 5` : sans le zéro, l'œil lit « 1 h 5 min » comme « 1,5 h ».
  return reste === 0
    ? `il y a ${heures} h`
    : `il y a ${heures} h ${String(reste).padStart(2, "0")}`;
}
