// Contrat de `GET /api/parent/progress/subjects/{subject_id}/analysis`.
//
// L'EXCEPTION assumée à l'agrégat unique (ADR-0028 §1/§4, addendum « analyse par matière »), au
// même titre que le détail d'un jour. Elle n'existe que pour ce que l'agrégat ne peut pas porter :
// des NOMS.
//
// ⚠️ Fichier SÉPARÉ de `dashboard.ts`, dont l'en-tête affirme « tout le payload arrive en UNE
// requête, non filtré ». Y poser le contrat d'une seconde route, filtrée par matière et chargée
// paresseusement, rendrait cet en-tête faux.
//
// ⚠️ Rien ici n'est indexé par une PÉRIODE, et rien n'y ressemble. Les minutes, le calendrier, les
// créneaux, les compteurs de notions et la charge SRS des 14 jours vivent dans `DashboardSubject`,
// donc déjà en mémoire. Les redéclarer ici créerait deux vérités pour la même mesure — c'est
// exactement le bug que ce chantier corrige.

/** Une notion à renforcer, NOMMÉE.
 *
 *  ⚠️ `is_fragile` et `has_open_gap` sont DEUX drapeaux, et non les deux valeurs d'une union.
 *  Une notion peut être les deux à la fois, l'un sans l'autre, et les deux mesures ne
 *  s'additionnent jamais : « fragile » est un statut de maîtrise (`weak`/`learning`), « lacune
 *  ouverte » est une ligne `Gap` née d'un diagnostic. Modéliser ça en `origin: "fragile" | "gap"`
 *  forcerait précisément la fusion qui a déjà coûté un bug — une preuve annonçant 8 notions et
 *  n'en montrant qu'une. */
export interface AnalysisNotion {
  skill_id: number;
  skill_name: string;
  is_fragile: boolean;
  has_open_gap: boolean;
  /** `null` si la notion ne porte pas de lacune — une notion fragile n'a pas de sévérité. */
  severity: "low" | "medium" | "high" | null;
  gap_status: "open" | "in_progress" | null;
  first_detected_at: string | null;
  /** `null` si aucune ligne de maîtrise n'existe encore pour cette notion. */
  mastery_status: string | null;
  mastery_score: number | null;
  /** Signal quiz pondéré (ADR-0014). `null` si aucune tentative. */
  weak_quiz_signal: number | null;
  last_seen_at: string | null;
  /** MÊME source que la page `/lacunes` : les deux surfaces ne peuvent pas se contredire sur
   *  « est-ce déjà pris en charge ». Calculé serveur, le client ne recroise rien. */
  has_active_mission: boolean;
}

export interface AnalysisMission {
  id: number;
  title: string;
  mission_type: string;
  status: "planned" | "active";
  /** ⚠️ Une mission `pending` couvre déjà la notion et doit donc apparaître : le drapeau
   *  `has_active_mission` et cette liste portent sur la MÊME population. */
  validation_status: string;
  skill_id: number | null;
  skill_name: string | null;
}

/** Ce qui tourne déjà — pour ne pas commander deux fois la même chose. */
export interface AnalysisInProgress {
  missions: AnalysisMission[];
  pending_content: number;
  stale_content: number;
  /** ⚠️ RETARD accumulé, à ne pas confondre avec `DashboardSubject.review_load`, qui est la
   *  charge À VENIR sur 14 jours. Deux mesures, deux noms : celle-ci ne filtre pas les cartes
   *  suspendues, l'autre si. */
  review_overdue: number;
  review_max_overdue_days: number;
}

/** Y a-t-il seulement de quoi travailler ? Évite de lancer un conseil sur un programme vide. */
export interface AnalysisReferentiel {
  has_referentiel: boolean;
  lessons: number;
  lessons_validated: number;
  courses_written: number;
  derivatives_percent: number;
}

/** Une notion ENGAGÉE — elle porte une ligne de maîtrise (addendum ADR-0038 §2). */
export interface AnalysisEngagedNotion {
  skill_id: number;
  skill_name: string;
  /** Segment de `notions_breakdown`, jamais reclassé côté client : un statut inconnu tombe dans
   *  `in_progress` plutôt que d'être perdu. */
  segment: "consolidated" | "fragile" | "in_progress";
  mastery_status?: string | null;
  mastery_score?: number | null;
}

/** Une notion AU PROGRAMME que rien n'a encore touchée — le reste de la barre d'avancement. */
export interface AnalysisNotStarted {
  skill_id: number;
  skill_name: string;
}

/** L'XP d'une matière réparti par GESTE.
 *
 *  ⚠️ **Par motif, jamais par notion** : `XPEvent` ne porte pas de `skill_id`. « Quelles notions
 *  ont rapporté ces 367 XP » n'a aucune réponse en base — ce n'est pas une approximation faute de
 *  mieux, c'est le plafond de ce que la donnée permet (addendum ADR-0038 §3). */
export interface AnalysisXpByReason {
  reason: string;
  count: number;
  amount: number;
}

export interface SubjectAnalysis {
  /** Écho de la matière demandée : permet de jeter une réponse en retard, en plus de la garde
   *  d'annulation du hook. */
  subject_id: number;
  slug: string;
  name: string;
  generated_at: string;
  /** Fragiles ∪ lacunes ouvertes, les plus urgentes d'abord. NON plafonné. */
  to_reinforce: AnalysisNotion[];
  /** Redondants avec la liste, et c'est VOULU : ils rendent la cohérence vérifiable d'un coup
   *  d'œil — `fragile_count` est ce à quoi le constat « N notions à renforcer » doit répondre. */
  fragile_count: number;
  open_gap_count: number;
  without_mission_count: number;
  in_progress: AnalysisInProgress;
  referentiel: AnalysisReferentiel;
  /** Dépliage d'une ligne de Progression (addendum ADR-0038).
   *
   *  🔴 Ces trois listes RECOMPOSENT les nombres de la ligne : `engaged.length === engaged` de
   *  `/progress/overview`, `engaged.length + not_started.length === notions.total`, et la somme
   *  des `xp_by_reason.amount` vaut `xp`. Un détail qui ne recompose pas son nombre est le défaut
   *  que tout ce chantier ferme, reproduit à quelques pixels d'écart.
   *
   *  Le panneau du dashboard les ignore — il n'a pas eu à changer. */
  engaged?: AnalysisEngagedNotion[];
  not_started?: AnalysisNotStarted[];
  xp_by_reason?: AnalysisXpByReason[];
}
