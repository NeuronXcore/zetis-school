// Témoins de nouveauté en navigation (ADR-0030).
//
// Un badge de navigation compte ce qui est NOUVEAU (naît d'un geste de Papa ou du système, meurt
// d'un REGARD de Massimo), jamais ce qui est DÛ (naît d'une date franchie, ne meurt que du
// travail, et grossit quand Massimo ne vient pas — c'est la définition d'une relance).

/** Entrées de navigation portant un témoin. Une entrée n'est éligible que si elle a une trace de
 *  VUE côté serveur : un compteur de récence décroîtrait tout seul et allumerait une entrée
 *  fraîchement visitée. C'est pourquoi ELI5 n'est pas dans cette liste — son `new_count` est un
 *  critère de récence à 7 jours, pas de vue. */
export type NewsKey =
  | "agenda"
  | "fiches"
  | "capsules"
  | "revision"
  | "missions"
  | "mindmaps"
  /** ⚠️ EXCEPTION NOMMÉE — le seul témoin qui meurt du TRAVAIL et non d'un regard. Il compte les
   *  diagnostics relus que Massimo n'a pas passés, donc il grossit quand Massimo ne vient pas :
   *  colonne interdite de l'ADR-0030 §1, ouverte par décision du commanditaire et bornée par
   *  `adr-0030-addendum-temoin-diagnostic.md`. Ne pas s'en servir comme précédent. */
  | "diagnostic";

/** `GET /api/student/news/summary` — un seul appel pour toute la navigation.
 *
 *  Compteurs EXACTS : le plafond « 9+ » est de la présentation. Absents à zéro côté rendu. */
export type NewsSummary = Record<NewsKey, number>;
