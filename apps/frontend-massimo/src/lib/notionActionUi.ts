// Table d'habillage des actions d'une notion (icône + libellé par type de contenu). UNE seule
// source, partagée par le panneau Galaxy (`NotionActionPanel`) et le menu de notion du chat
// (ADR-0027 Q1). Volontairement SANS dépendance lourde (pas de `@zetis/ui/galaxy` / three.js) :
// l'importer ne doit pas traîner le moteur 3D dans le bundle du chat (leçon du chantier galaxy).
import type { GalaxyAction } from "@zetis/types";

//
// ⚠️ **Le mot « carte » ne désigne qu'UNE chose ici : la carte de révision (SRS).** `mindmap` a
// dit « Reconstruire la carte » jusqu'au 2026-08-12, deux lignes au-dessus de « Réviser mes
// cartes » — deux surfaces sans rapport sous le même mot, dans le MÊME panneau de notion.
//
// Ce n'était pas une hypothèse : un cran plus haut, le même défaut a fait dire au commanditaire
// qu'**il manquait un lien vers les mindmaps**, alors que l'onglet était là, nommé « Cartes »
// juste avant « Révisions » (addendum ADR-0024 §3 bis). L'onglet et la bande de catalogue ont été
// corrigés ce jour-là ; cette table portait encore la collision, dette laissée sciemment.
//
// La collision se lève **du côté mindmap**, et pas l'inverse : « carte » au sens SRS est le sens
// déjà tenu partout ailleurs dans l'app (« 8 cartes à revoir » sur la page matière, « 5 cartes »
// sur une échéance d'agenda, « Refaire un tour (3 cartes) » en fin de session) et il vient du
// modèle lui-même (`Card`, module `memory`). Le nom retenu pour l'autre surface est celui que la
// barre latérale montre à Massimo tous les jours : **« mindmap »** (`navigation.ts`).
//
// Un test-verrou (`notionActionUi.test.ts`) interdit désormais de faire porter « carte » à deux
// activités différentes de cette table.
export const ACTION_UI: Record<GalaxyAction["kind"], { icon: string; label: string }> = {
  cours: { icon: "📖", label: "Voir le cours" },
  eli5: { icon: "💡", label: "Fais-moi comprendre" },
  fiche: { icon: "🗒️", label: "Lire la fiche" },
  capsule: { icon: "🎬", label: "Regarder la capsule" },
  // Le GESTE reste « Reconstruire » — c'est bien de mémoire que Massimo la refait, et c'est ce
  // qui distingue l'activité de la simple lecture d'une mindmap.
  //
  // ⚠️ **C'est le plus long libellé de la table (172 px), et c'est ARBITRÉ, pas subi.** Relecture
  // à l'écran du 2026-08-12, mesures dans le DOM : sur la page matière il tient sur UNE ligne à
  // 390 px comme à 1594 px ; dans le panneau de `/galaxy` à 390 px, le budget de texte est de
  // 146 px et il passe donc à DEUX lignes. L'ancien « Reconstruire la carte » (144 px) y tenait
  // — à **2 px près**, par chance et non par conception.
  //
  // Deux lignes acceptées sciemment : dans ce panneau, « Voir le cours », « Fais-moi comprendre »
  // et « Regarder la capsule » passent **déjà** à la ligne, et ce panneau a un défaut bien plus
  // grave (il sort de l'écran de 94 px — au `BACKLOG.md`). Raccourcir en « Refaire la mindmap »
  // (132 px) tiendrait, mais perdrait le geste de reconstruction de mémoire.
  //
  // → **Ne pas raccourcir ce libellé pour gagner une ligne sur `/galaxy`.** Le jour où ce panneau
  // sera réparé, la question tombera d'elle-même.
  mindmap: { icon: "🧠", label: "Reconstruire la mindmap" },
  revision: { icon: "🗂️", label: "Réviser mes cartes" },
  quiz: { icon: "🎯", label: "Me tester" },
};
