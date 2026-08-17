import { type AgendaKind } from "@zetis/types";

// Le vocabulaire visuel de l'agenda de Massimo (ADR-0025 Amendement 8 §D3, §D4).
//
// ╭─ LA DOCTRINE DES CINQ CANAUX, en une phrase par canal ────────────────────────────────────╮
// │ Teinte      → la MATIÈRE, et rien d'autre.                                                │
// │ Silhouette  → la NATURE (devoir / leçon / contrôle / rendu).                               │
// │ Remplissage → l'échéance TOMBE ici (plein) vs tu PRÉPARES ici (contour).                   │
// │ Registre    → haut = ce que l'école demande, bas = ce que tu as travaillé.                 │
// │ Opacité     → la distance dans le temps.                                                   │
// ╰───────────────────────────────────────────────────────────────────────────────────────────╯
//
// 🔴 **L'ÉTAT DE COMPLÉTION NE PREND AUCUN CANAL DANS LE GLYPHE.** Ce composant n'accepte
// aucune prop `done`, et c'est le résultat de deux essais successifs regardés à l'écran le
// 2026-08-17 (§D10-b puis §D11) :
//
//   1. un **disque évidé** au centre — invisible, lu comme un défaut de rendu ;
//   2. une **croix** creusée — mieux, mais toujours « vraiment peu visible » à 9 px, et elle
//      avait cassé le losange, dont les arêtes sont à 45° comme elle.
//
// Le signal a donc changé de NIVEAU : il n'est plus dans le glyphe mais dans la **cellule du
// jour**, hachurée quand la journée est soldée. Un glyphe de 9 px ne peut pas porter à la fois
// une matière, une nature, une modalité ET un état — c'est un canal de trop dans trop peu de
// pixels, et deux tentatives l'ont montré plutôt que démontré.
//
// ⚠️ Si une session future veut réintroduire un état ici, elle butera sur l'absence de prop —
// et c'est voulu. Le bon endroit est la cellule (`AgendaMonthGrid` / `AgendaWeekStrip`).
//
// **Pourquoi ce composant vit dans `packages/ui` et pas dans l'app** : la bande et la grille mois
// doivent rendre EXACTEMENT le même signe. Deux copies finiraient par diverger, et le jour où
// elles divergent, Massimo apprend deux vocabulaires pour un seul objet.

/** Les quatre silhouettes. Signatures basse-fréquence maximalement éloignées : rond / allongé /
 *  pointu-4 / pointu-3 — elles se distinguent à 9 px, en monochrome, et sous daltonisme. */
const SHAPES: Record<AgendaKind, { w: number; h: number; solid: string; hollow: string }> = {
  // Le plus fréquent, donc la forme la plus CALME. Aucun angle, aucune pointe : un devoir
  // ne menace pas.
  devoir: {
    w: 9,
    h: 9,
    solid: `<circle cx="4.5" cy="4.5" r="4.5"/>`,
    hollow: `<circle cx="4.5" cy="4.5" r="3.9" fill="none" stroke-width="1.25"/>`,
  },
  // Une ligne à apprendre. L'ALLONGEMENT est le seul discriminant qui survive à tout : flou,
  // petite taille, monochrome, daltonisme.
  //
  // ⚠️ Corrige un défaut qui était EN PRODUCTION : `AgendaItemRow` rendait le même `◆` pour
  // `lecon` et pour `controle`, séparés uniquement par la teinte, à 10 px.
  lecon: {
    w: 12,
    h: 9,
    solid: `<rect x="0" y="2" width="12" height="5" rx="2.5"/>`,
    hollow: `<rect x="0.7" y="2.7" width="10.6" height="3.6" rx="1.8" fill="none" stroke-width="1.25"/>`,
  },
  // DÉJÀ enseigné par le dépôt (`AgendaItemRow` rend « ◆ contrôle » depuis le 2026-08-10).
  // On ne réinvente pas un vocabulaire que Massimo connaît.
  controle: {
    w: 10,
    h: 10,
    solid: `<polygon points="5,0 10,5 5,10 0,5"/>`,
    hollow: `<polygon points="5,0.9 9.1,5 5,9.1 0.9,5" fill="none" stroke-width="1.25"/>`,
  },
  // Une chose qu'on remet. Trois côtés contre quatre : la pointe unique se lit contre le
  // losange même à 8 px.
  rendu: {
    w: 10,
    h: 9,
    solid: `<polygon points="5,0 10,9 0,9"/>`,
    hollow: `<polygon points="5,1.1 9.1,8.4 0.9,8.4" fill="none" stroke-width="1.25" stroke-linejoin="round"/>`,
  },
};

/** Le mot que l'`aria-label` d'une cellule emploie pour chaque nature. */
export const AGENDA_KIND_LABEL: Record<AgendaKind, string> = {
  devoir: "devoir",
  lecon: "leçon à apprendre",
  controle: "contrôle",
  rendu: "à rendre",
};

export interface AgendaGlyphProps {
  kind: AgendaKind;
  /** La teinte de la MATIÈRE. `null` ⇒ gris neutre : une échéance sans matière ne se voit pas
   *  attribuer une couleur de repli, qui lui inventerait une matière. */
  color?: string | null;
  /** `false` ⇒ contour : « tu prépares ici », par opposition à « l'échéance tombe ici ».
   *  C'est le canal du remplissage, jamais celui de la complétion. */
  filled?: boolean;
  /** Hauteur cible en px. 9 sur téléphone, 11 sur tablette, 12 sur bureau. */
  size?: number;
}

const NEUTRE = "#8b95b5";


/** Un glyphe d'agenda : silhouette × teinte × plein|contour × taille.
 *
 *  SVG inline, zéro dépendance, aucune animation — le dépôt applique `motion-reduce` partout et
 *  une marque de 9 px qui bouge est un bruit, jamais une information.
 */
export function AgendaGlyph({ kind, color, filled = true, size = 9 }: AgendaGlyphProps) {
  const shape = SHAPES[kind];
  const ratio = size / 9; // 9 px est la taille de référence (téléphone)
  const teinte = color ?? NEUTRE;
  return (
    <svg
      width={(shape.w * ratio).toFixed(2)}
      height={(shape.h * ratio).toFixed(2)}
      viewBox={`0 0 ${shape.w} ${shape.h}`}
      fill={filled ? teinte : "none"}
      stroke={filled ? undefined : teinte}
      aria-hidden
      className="block shrink-0 overflow-visible"
      dangerouslySetInnerHTML={{ __html: filled ? shape.solid : shape.hollow }}
    />
  );
}

export interface AgendaTraceMarkProps {
  /** La teinte de la matière travaillée. `null` ⇒ gris neutre — une activité sans matière
   *  (le chat, surtout) reste une trace ; la jeter faisait disparaître 1 jour travaillé sur 20. */
  color?: string | null;
  /** Facteur de taille : 1 sur téléphone (7 × 3), plus grand sur bureau. */
  scale?: number;
}

/** Le segment de trace — « tu as travaillé cette matière ce jour-là ».
 *
 *  Une barre horizontale plate ne peut se confondre avec aucune des quatre silhouettes, et elle
 *  est la SEULE chose du registre bas : la séparation spatiale la rend non ambiguë avant même
 *  que l'œil ait lu la forme.
 *
 *  `opacity .55` : le registre bas est de la MÉMOIRE, le registre haut de l'ACTIONNABLE. La trace
 *  ne doit jamais crier plus fort que la demande.
 *
 *  🔴 **Une trace ne se rend QUE si elle existe.** Aucun réceptacle, aucune case éteinte en
 *  attente : un jour sans trace est visuellement identique à un jour hors plage (ADR-0025 §7).
 *  Un gabarit dont certaines cases resteraient vides serait un décompte de jours manqués.
 */
/** La hachure du **jour soldé** (ADR-0025 Amdt 8 §D11) — l'état vit sur la CELLULE.
 *
 *  Deux marques dans le glyphe ont été essayées puis écartées à l'écran le 2026-08-17 (un disque
 *  évidé, puis une croix) : à 9 px, un glyphe ne peut pas porter une matière, une nature, une
 *  modalité **et** un état. Le signal a donc changé de niveau.
 *
 *  🔴 **Elle ne grise ni ne désactive rien.** Le numéro, les glyphes et les traces gardent
 *  exactement leur rendu ; seule une trame diagonale de 5 % passe DERRIÈRE eux, et la cellule
 *  reste pleinement cliquable. Une cellule grisée se lirait comme désactivée — or c'est
 *  précisément le jour qu'on veut pouvoir rouvrir.
 *
 *  ⚠️ **Elle ne s'allume que si la journée est ENTIÈREMENT soldée**, et jamais sur un jour sans
 *  échéance : sans cette seconde garde, tous les jours vides du mois seraient hachurés — un
 *  gabarit de cases remplies, c'est-à-dire l'inverse exact du §7.
 */
// ⚠️ **Blanche depuis l'origine — c'est l'OPACITÉ qui manquait, pas la teinte.** Posée à 5 %,
// elle passait pour absente sur une cellule de 62 px (commanditaire, 2026-08-17). Portée à 16 %,
// avec un trait plus épais (2,5 px de plein sur 7 de pas) : elle se voit d'un coup d'œil sans
// devenir un aplat.
//
// 🔴 **Le plafond est fixé par ce qui passe DEVANT** : les glyphes de 9 px et les segments de
// trace à `opacity .55` doivent rester lisibles par-dessus. Au-delà de ~20 %, la trame se met à
// concurrencer le contenu — et c'est le contenu qui compte, la trame n'est qu'un état.
export const HACHURE_SOLDE =
  "repeating-linear-gradient(45deg, transparent 0 4.5px, rgba(255,255,255,0.16) 4.5px 7px)";

/** Le cadre des jours À VENIR (ADR-0025 Amdt 8 §D13) — « ça arrive ».
 *
 *  🔴 **L'orange ne colore JAMAIS un glyphe**, et c'est ce qui le rend non ambigu : `#fb923c`
 *  est la teinte de l'**espagnol** dans la palette matière. La séparation est spatiale, exactement
 *  comme pour le cyan d'aujourd'hui, qui est la teinte de la **physique-chimie** et ne vit que
 *  sur le numéral, la bordure et le halo. Une bordure de cellule et un aplat de 9 px ne se
 *  confondent pas, même à teinte égale.
 *
 *  ⚠️ Il ne se confond pas non plus avec l'**ambre du rattrapage** (« à reprendre ») : celui-là
 *  est le ton d'une CARTE d'item, et aucun ton sémantique n'entre dans une cellule de grille.
 *
 *  ⚠️ **Aujourd'hui n'est PAS « à venir »** : il garde son cadre cyan, qui dit « on est ici dans
 *  le temps ». Deux cadres sur la même cellule se contrediraient. */
export const CADRE_A_VENIR = "rgba(251,146,60,0.5)";

/** Le cadre d'un jour PASSÉ qui garde une échéance non faite (ADR-0025 Amdt 8 §D18).
 *
 * 🔴 **Ceci révoque le §D3** — *« dans la grille, l'état de complétion ne prend AUCUN canal »* —
 * et, à travers lui, le motif d'origine du §7. Un toast est ponctuel ; **une couleur répétée sur
 * trente cellules d'un mois EST le compteur d'arriéré**, lisible d'un seul balayage du regard.
 * C'était très exactement le cas que la doctrine protégeait. Décision du commanditaire, écrite
 * comme telle au §D18 — pas un effet de bord.
 *
 * ⚠️ **Ambre, jamais rouge** : c'est la même famille que le badge et le cadre du toast, et le
 * rouge reste interdit sur toutes les surfaces de Massimo.
 *
 * 🔴 **Et STATIQUE, jamais animé.** Le toast a le droit de respirer parce qu'il est seul à
 * l'écran ; trente cellules qui pulsent ensemble seraient un champ stroboscopique. L'animation
 * reste la marque de la surface qu'on a demandée, pas de celle qu'on balaie. */
export const CADRE_EN_RETARD = "rgba(251,191,36,0.75)";

/** Les trois registres de l'agenda — **présent, futur, passé** (ADR-0025 Amdt 9 §D7).
 *
 * 🔴 **Aucune couleur neuve : les trois viennent du CALENDRIER, et elles y disent déjà la même
 * chose.** Le cyan est celui d'aujourd'hui (« on est ici dans le temps »), l'orange celui des
 * cellules à venir, l'ambre celui des jours passés non faits. Massimo n'a donc pas un second code
 * à apprendre pour les sections : c'est le premier, relu autrement — et les deux moitiés de la
 * page se répondent au lieu de coexister.
 *
 * ⚠️ **Deux des trois sont LITTÉRALEMENT les constantes du calendrier**, pas des copies : une
 * teinte recopiée diverge au premier réglage. Seul le cyan est écrit ici, parce que la bande le
 * porte par une classe Tailwind (`border-cyan-400/60`) et non par une constante ; il est plus
 * pâle que celui d'une cellule, exprès.
 *
 * 🔴 **Un rail, jamais un aplat.** Ces teintes marquent un liseré de 2 px à gauche du titre. Un
 * fond teinté sur la section « À reprendre » ferait un bloc ambre permanent en bas de page —
 * c'est-à-dire le compteur d'arriéré du §7, obtenu par la surface au lieu du nombre. */
export const REGISTRE_TEINTE = {
  present: "rgba(34,211,238,0.55)",
  futur: CADRE_A_VENIR,
  passe: CADRE_EN_RETARD,
} as const;

export type AgendaRegistre = keyof typeof REGISTRE_TEINTE;

/** Le jour est-il « en retard » ? Passé, et au moins une échéance non faite.
 *
 * ⚠️ L'appelant fournit le verdict de passé : la bande le lit dans `offset`, la grille compare
 * les dates ISO. Cette fonction ne connaît pas le calendrier, elle ne juge que les items. */
export function joursEnRetard(items: { done: boolean }[], passe: boolean): boolean {
  return passe && items.some((item) => !item.done);
}

/** La trame d'un jour ENTAMÉ — au moins une échéance faite, mais pas toutes.
 *
 *  🔴 **Même trame, même angle, même pas — seule l'OPACITÉ change** (6 % contre 16 %). C'est ce
 *  qui en fait une *intensité* et non un second signe : l'œil lit « un peu » puis « tout », il
 *  n'a pas deux vocabulaires à apprendre. Un motif différent (points, croisillons) aurait
 *  fabriqué une seconde marque à mémoriser pour la même chose.
 *
 *  ⚠️ **Ce troisième état est né d'un geste sans réponse** : cocher le premier de deux devoirs ne
 *  changeait rien dans la grille — *« une sur deux : on ne voit rien, corrige »* (commanditaire,
 *  2026-08-17). Un geste qui ne répond pas se lit comme une panne, exactement comme le tap muet
 *  sur un jour passé qui avait motivé l'addendum §17. */
export const HACHURE_ENTAMEE =
  "repeating-linear-gradient(45deg, transparent 0 4.5px, rgba(255,255,255,0.06) 4.5px 7px)";

/** Le jour est-il soldé ? Au moins une échéance, et TOUTES faites. */
export function journeeSoldee(items: { done: boolean }[]): boolean {
  return items.length > 0 && items.every((item) => item.done);
}

/** Le jour est-il ENTAMÉ ? Au moins une faite, mais pas toutes.
 *
 *  ⚠️ Volontairement **exclusif** de `journeeSoldee` : les deux ne sont jamais vrais ensemble,
 *  et l'appelant n'a donc aucun ordre de priorité à deviner. */
export function journeeEntamee(items: { done: boolean }[]): boolean {
  return items.some((item) => item.done) && !items.every((item) => item.done);
}

/** La trame d'un jour, ou `undefined` s'il n'y a rien à dire.
 *
 *  🔴 **Un jour dont RIEN n'est fait ne rend rien** — c'est la garde qui empêche la trame de
 *  devenir un gabarit de cases sur tout le mois (§7). Trois états, jamais quatre :
 *  rien / entamé / fini. */
export function hachurePour(items: { done: boolean }[]): string | undefined {
  if (journeeSoldee(items)) return HACHURE_SOLDE;
  if (journeeEntamee(items)) return HACHURE_ENTAMEE;
  return undefined;
}

export function AgendaTraceMark({ color, scale = 1 }: AgendaTraceMarkProps) {
  return (
    <span
      aria-hidden
      className="block shrink-0 rounded-full opacity-55"
      style={{
        width: 7 * scale,
        height: 3 * scale,
        backgroundColor: color ?? NEUTRE,
      }}
    />
  );
}
