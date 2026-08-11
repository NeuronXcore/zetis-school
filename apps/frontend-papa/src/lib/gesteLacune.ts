import type { OpenGap } from "@zetis/types";

// Le geste d'une ligne de la page Lacunes (ADR-0047 §3) — la règle, séparée de son rendu.
//
// Pourquoi un module à part : cette règle est testable **sans monter la page**, et c'est ce qui
// permet de la saboter proprement. Le composant, lui, ne fait plus que rendre ce qu'elle décide.

/** Ce que la ligne propose. `null` = rien, et c'est un résultat légitime, pas un trou. */
export type GesteLacune =
  | { kind: "lien"; libelle: string; href: string; motif: string; ton: "accent" | "sky" }
  | { kind: "equiper"; libelle: string; motif: string };

/** Le geste d'une lacune, ou `null` si aucun ne peut être tenu.
 *
 * 🔴 **`has_active_mission` est testé EN PREMIER** (ADR-0047 §3) : une notion déjà couverte
 * n'attend aucune décision de contenu, quel que soit son `content_state`. Inverser l'ordre
 * proposerait de produire ce qu'une mission est en train de traiter.
 *
 * 🔴 **Un geste n'est rendu QUE si son identifiant l'est.** `has_active_mission` sans `mission_id`,
 * ou `cours_brouillon` sans `lesson_id`, ne rendent **rien** — jamais `?focus=undefined`. Le
 * serveur garantit que les champs vont ensemble ; cette fonction ne le suppose pas, parce qu'un
 * lien mort est pire qu'une ligne sans geste.
 *
 * 🔴 **La branche par défaut ne rend AUCUN geste** (Décision 6). `content_state` est typé
 * `string`, pas une union fermée : un état ajouté côté backend tomberait ici. Lui donner un geste
 * par défaut mènerait Papa quelque part sans savoir pourquoi.
 */
export function gesteDe(gap: OpenGap): GesteLacune | null {
  if (gap.has_active_mission) {
    if (!gap.mission_id) return null;
    return {
      kind: "lien",
      libelle: "Voir la mission →",
      href: `/missions?focus=${gap.mission_id}`,
      motif: "Une mission active couvre cette notion.",
      // ⚠️ Bleu, pas vert : le vert est la couleur des gestes qui font AVANCER. Celui-ci constate.
      ton: "sky",
    };
  }

  switch (gap.content_state) {
    case "cours_brouillon":
      // 🔴 **LES TROIS CRANS, ou rien** (2026-08-11). Le lien s'écrivait `/programme?lesson=<id>`
      // — et `ProgrammePage` ne **sélectionne** une matière que sur `?subject=`, ne **déplie** un
      // chapitre que sur `?chapter=`, et ne met en évidence que dans `LessonsPanel`, lequel n'est
      // monté que si un chapitre est déplié. Sans matière, donc, **rien ne s'ouvrait** : Papa
      // atterrissait sur la page dans son état par défaut. Le lien existait, était cliquable, son
      // `href` était bien formé — exactement le *« cul-de-sac qui a l'air de marcher »* de
      // l'ADR-0050, qu'aucun test de rendu ne voit.
      //
      // ⚠️ La garde exige les TROIS : servir le lien avec deux crans rouvrirait le même défaut un
      // cran plus bas (la leçon connue, le chapitre replié). Mieux vaut aucune action qu'une
      // action qui égare — c'est la règle que cette fonction tient déjà pour `mission_id`.
      if (!gap.lesson_id || !gap.subject_id || !gap.chapter_id) return null;
      return {
        kind: "lien",
        libelle: "Valider le cours de cette leçon →",
        href: `/programme?subject=${gap.subject_id}&chapter=${gap.chapter_id}&lesson=${gap.lesson_id}`,
        motif:
          "Une leçon existe, son cours est en brouillon : la voie « quiz ancré sur la notion » " +
          "refuse tant qu'il n'est pas validé.",
        ton: "accent",
      };

    case "aucune_lecon":
      // 🔴 **Une ACTION, pas un lien** (ADR-0047 §3, corrigé le 2026-08-09). `/quiz` pilote les
      // quiz de fin de cours, « générés depuis le cours validé d'une leçon » — soit exactement ce
      // qui manque ici. Le geste réel est `equipNotion`, et il produit CINQ pièces.
      return {
        kind: "equiper",
        libelle: "Équiper cette notion",
        motif: "Aucune leçon ne porte cette notion : ZETIS peut lui en produire une, et ses dérivés.",
      };

    case "ok":
      // Même garde et même href que `cours_brouillon` ci-dessus — **c'était le même lien mort**,
      // et le corriger d'un seul côté aurait laissé « Relire la leçon » égarer Papa exactement
      // comme « Valider le cours » le faisait.
      if (!gap.lesson_id || !gap.subject_id || !gap.chapter_id) return null;
      return {
        kind: "lien",
        libelle: "Relire la leçon →",
        href: `/programme?subject=${gap.subject_id}&chapter=${gap.chapter_id}&lesson=${gap.lesson_id}`,
        // ⚠️ Un geste de VÉRIFICATION, pas de production : la section porte déjà son bouton
        // « Créer N missions ». Doubler l'action au niveau ligne créerait deux chemins pour la
        // même chose, avec deux portées différentes (le bouton ignore le filtre, la ligne non).
        motif: "Le cours est validé — il y a de quoi retravailler la notion dès maintenant.",
        ton: "accent",
      };

    default:
      return null;
  }
}
