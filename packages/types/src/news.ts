// Témoins de nouveauté en navigation (ADR-0030).
//
// Un badge de navigation compte ce qui est NOUVEAU (naît d'un geste de Papa ou du système, meurt
// d'un REGARD de Massimo), jamais ce qui est DÛ (naît d'une date franchie, ne meurt que du
// travail, et grossit quand Massimo ne vient pas — c'est la définition d'une relance).

/** Entrées de navigation portant un témoin. Une entrée n'est éligible que si elle a une trace de
 *  VUE côté serveur : un compteur de récence décroîtrait tout seul et allumerait une entrée
 *  fraîchement visitée.
 *
 *  ~~« C'est pourquoi ELI5 n'est pas dans cette liste — son `new_count` est un critère de récence
 *  à 7 jours, pas de vue. »~~ — la RÈGLE reste vraie, sa conséquence a changé le 2026-08-15
 *  (`adr-0030-temoins-nouveaute-navigation` (Amendement 3)) : on n'a pas réutilisé le compteur de récence, **on a créé la
 *  trace qui manquait** (`eli5_views`). La règle sort renforcée, pas assouplie. */
export type NewsKey =
  | "agenda"
  /** Cours validés de l'année active jamais ouverts — `adr-0030-temoins-nouveaute-navigation` (Amendement 2). */
  | "matieres"
  /** Notions ELI5-éligibles jamais expliquées — adossé à `eli5_views`, JAMAIS au `new_count` de
   *  récence, qui reste en page et n'a jamais été éligible. */
  | "eli5"
  /** Quiz jouables jamais OUVERTS — jamais « jamais joués » : ce témoin meurt du regard, pas du
   *  travail. Il naît d'une PRODUCTION et non d'une validation, donc Papa n'en est pas le
   *  robinet — seul du dispositif dans ce cas (`adr-0030-temoins-nouveaute-navigation` (Amendement 4), borne 4). */
  | "quiz"
  | "fiches"
  | "capsules"
  | "revision"
  | "missions"
  | "mindmaps"
  /** ⚠️ EXCEPTION NOMMÉE — le seul témoin qui meurt du TRAVAIL et non d'un regard. Il compte les
   *  diagnostics relus que Massimo n'a pas passés, donc il grossit quand Massimo ne vient pas :
   *  colonne interdite de l'ADR-0030 §1, ouverte par décision du commanditaire et bornée par
   *  `adr-0030-temoins-nouveaute-navigation.md` (Amendement 1). Ne pas s'en servir comme précédent. */
  | "diagnostic";

/** `GET /api/student/news/summary` — un seul appel pour toute la navigation.
 *
 *  Compteurs EXACTS : le plafond « 9+ » est de la présentation. Absents à zéro côté rendu. */
export type NewsSummary = Record<NewsKey, number>;
