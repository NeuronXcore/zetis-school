/** Depuis combien de temps — « il y a 4 min », « il y a 4 mois », en mots de Papa.
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
  if (heures < 24) {
    const reste = minutes % 60;
    // ⚠️ `1 h 05` et non `1 h 5` : sans le zéro, l'œil lit « 1 h 5 min » comme « 1,5 h ».
    return reste === 0
      ? `il y a ${heures} h`
      : `il y a ${heures} h ${String(reste).padStart(2, "0")}`;
  }

  // --- Au-delà du jour ---------------------------------------------------------------------
  //
  // ⚠️ **Ces paliers sont NÉS pour la vérification d'une sauvegarde** (onglet 💾) : une archive
  // vérifiée il y a quatre mois ne se regarde pas comme une vérifiée ce matin. Sans eux, la
  // fonction rendait « il y a 2952 h » — un nombre juste et illisible.
  //
  // 🔴 **Ça change ce que rend `depuis()` au-delà de 24 h, y compris pour ses autres appelants**
  // (`ProductionPopover`). Assumé, et sans risque mesuré : un lot de production dure des minutes,
  // et un lot `running` de plus d'un jour est de toute façon déclaré zombie par `is_stale`
  // (ADR-0034 §2). Le seul cas atteignable est un travail resté en file pendant que le worker
  // était mort — et « il y a 3 j » y est plus lisible que « il y a 72 h ».
  //
  // ⚠️ **Aucun palier n'est un SEUIL.** Ils changent le MOT, jamais le sens : rien ici ne décide
  // qu'une durée est « trop longue ». La question de la péremption d'une vérification a été posée
  // le 2026-08-21 et tranchée ainsi — on dit l'âge, on ne juge pas.
  const jours = Math.floor(heures / 24);
  if (jours < 7) return `il y a ${jours} j`;
  if (jours < 60) return `il y a ${Math.floor(jours / 7)} sem.`;
  // Le mois « de calendrier » n'existe pas ici : 30 jours, et le mot reste invariable.
  //
  // ⚠️ **La bascule vers l'année se décide en JOURS, pas en mois** — et ce n'est pas un détail :
  // douze mois de trente jours font 360, pas 365. Écrit `if (mois < 12)`, les jours 360 à 364
  // tombaient dans le trou entre les deux unités et rendaient « il y a **0 an** ». Trouvé par son
  // test-verrou, pas à la lecture.
  if (jours < 365) return `il y a ${Math.floor(jours / 30)} mois`;
  const ans = Math.floor(jours / 365);
  return `il y a ${ans} an${ans > 1 ? "s" : ""}`;
}
