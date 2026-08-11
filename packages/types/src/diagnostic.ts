// Contrats de la page Papa « Diagnostic » (adr-0043).
//
// ⚠️ **Côté PAPA uniquement.** Massimo a ses propres formes, plus étroites, dans son
// `lib/diagnostic.ts` : il ne reçoit ni provenance, ni statut de relecture, ni état de contenu.
// Les fusionner ferait remonter la machinerie de pilotage dans l'espace de l'enfant.
//
// Le module `diagnostics` était resté sans types partagés depuis l'étape 14, seul de son espèce.
// L'adr-0043 change ses contrats : ils rejoignent `packages/types` plutôt que de creuser
// l'exception.

/** Les trois crans du témoin de passation. L'ordre est celui du temps, et il ne se saute pas.
 *
 *  - `genere` — existe, attend la relecture de Papa ; **invisible de Massimo** ;
 *  - `propose` — relu, disponible pour Massimo, pas encore passé ;
 *  - `passe` — une tentative complétée existe.
 *
 *  🔴 Le troisième est **lu** dans les tentatives, jamais déclaré : le cocher serait affirmer un
 *  fait que rien n'a mesuré. */
export type DiagnosticCran = "genere" | "propose" | "passe";

/** Palier de maîtrise servi par le serveur. ⚠️ **À LIRE, jamais à recalculer** : la page actuelle
 *  le reçoit et l'ignore, ce qui fait disparaître `mastered` (≥ 90) de l'écran. */
export type DiagnosticPalier = "mastered" | "solid" | "learning" | "weak";

/** État du contenu disponible pour retravailler une notion (adr-0042).
 *
 *  🔴 `aucune_lecon` et `cours_brouillon` **ne se confondent pas** : sans leçon le quiz s'ancre sur
 *  la notion (réparable), avec une leçon en brouillon la voie notion refuse (il faut valider le
 *  cours). Le geste de Papa diffère. */
export type DiagnosticContentState = "ok" | "aucune_lecon" | "cours_brouillon";

export interface DiagnosticSkillScore {
  skill_id: number | null;
  skill_name: string;
  score: number;
  status: DiagnosticPalier;
  /** Le GRAIN de la mesure : 2 avant l'adr-0043, 5 après. La granularité du dépôt est **mixte
   *  pour toujours** — un 50 % ne dit pas la même chose sur 2 ou sur 5 questions. */
  questions_count: number;
}

export interface DiagnosticGap {
  skill_id: number | null;
  skill_name: string;
  severity: string;
  /** Relu en base à chaque affichage — c'est le badge, pas un filtre d'affichage. */
  status: "open" | "in_progress" | "resolved" | "ignored" | string;
  content_state: DiagnosticContentState;
  /** Où le geste doit MENER (2026-08-11). Sans eux, « Valider le cours de cette leçon » ne
   *  construisait que `/programme?subject=` : la matière s'ouvrait et Papa se retrouvait devant
   *  tous ses chapitres, sans rien qui désigne la leçon.
   *
   *  ⚠️ **Les deux vont ensemble ou pas du tout** — `ProgrammePage` a besoin de `subject` pour
   *  sélectionner, `chapter` pour déplier, `lesson` pour mettre en évidence. Un `lesson_id` seul
   *  rouvrirait le cul-de-sac un cran plus bas. Le front ne rend le lien que si les deux sont là. */
  lesson_id?: number | null;
  chapter_id?: number | null;
}

export interface DiagnosticResult {
  attempt_id: number;
  quiz_id: number;
  subject_id: number | null;
  subject: string;
  score_percent: number;
  completed_at: string | null;
  per_skill: DiagnosticSkillScore[];
  gaps: DiagnosticGap[];
  /** `null` = ZETIS ne regardait pas (passation d'avant l'ADR-0048), ≠ « rien à signaler ». */
  fiabilite: DiagnosticFiabilite | null;
  verbalisation: DiagnosticVerbalisation | null;
}

// ── La fiabilité d'une mesure (ADR-0048) ────────────────────────────────────────

/** Les FAITS observés. Un seul suffit à porter le verdict à « à confirmer ». */
export interface DiagnosticFiabiliteFaits {
  /** Combien de fois l'écran a été quitté PENDANT la passation.
   *  🔴 Pas « questions quittées » (Décision 1 bis) : l'écran de passation affiche toutes les
   *  questions d'un bloc, on ne sait pas laquelle était lue. */
  sorties_ecran: number;
  enonces_copies: number;
  plein_ecran_quitte: boolean;
  acquises_sans_trace: number;
  notions_total: number;
}

/** Les INDICES. Ils s'affichent en gris et ne déclenchent JAMAIS : les cacher au motif qu'ils
 *  sont bruités reviendrait à décider à la place de Papa, qui lit mieux qu'un seuil. */
export interface DiagnosticFiabiliteIndices {
  reponses_rapides: number;
  taille_changee: boolean;
}

export type DiagnosticVerdict = "a_confirmer" | "rien_a_signaler";

/** Les conditions dans lesquelles une mesure a été prise.
 *
 * 🔴 **`null` ne veut PAS dire « rien à signaler »** : il veut dire **ZETIS ne regardait pas**,
 * l'état de toutes les passations d'avant le chantier. La page rend TROIS états, pas deux. */
export interface DiagnosticFiabilite {
  verdict: DiagnosticVerdict;
  regle_version: number;
  faits: DiagnosticFiabiliteFaits;
  indices: DiagnosticFiabiliteIndices;
  declencheurs: string[];
  /** 🔴 L'instrument dit sa PORTÉE : sans elle, l'absence d'un signal se lirait comme l'absence du
   *  comportement. Le plein écran n'existe pas sur iPhone. */
  portee: { observables: string[] };
}

/** Le mot de Massimo sur une de ses bonnes réponses.
 *
 * 🔴 **Il ne doit JAMAIS lui être reproché.** Le jour où « j'ai cherché » se retourne contre lui,
 * la question ne reçoit plus jamais de réponse vraie, et ZETIS aura échangé son meilleur
 * instrument contre une remontrance. */
export interface DiagnosticVerbalisation {
  question_id: number;
  skill_id: number | null;
  skill_name: string;
  explication: string | null;
}

// ── L'aperçu : bandeau, rail, matières jamais mesurées ──────────────────────────

export interface DiagnosticRailEntry {
  cle: string;
  cran: DiagnosticCran;
  quiz_id: number;
  attempt_id: number | null;
  subject_id: number;
  subject: string;
  subject_slug: string;
  date: string | null;
  notions_count: number;
  /** 🔴 `null` sur les deux premiers crans, **jamais 0** : aucun score n'existe avant qu'une
   *  tentative n'ait été complétée, et un zéro se lirait comme une mesure catastrophique. */
  score_percent: number | null;
  /** Rang de la passation DANS SA MATIÈRE (1ʳᵉ, 2ᵉ…). `null` hors du 3ᵉ cran. */
  rang: number | null;
  /** Le verdict SEUL, pour repérer la marque sans ouvrir le panneau : le rail signale, le panneau
   *  explique. 🔴 `null` hors du 3ᵉ cran — une passation qui n'a pas eu lieu n'a pas de mesure,
   *  donc rien à qualifier — ET sur les passations d'avant le chantier. */
  fiabilite_verdict: DiagnosticVerdict | null;
}

export interface DiagnosticJauges {
  matieres_mesurees: number;
  matieres_total: number;
  a_relire: number;
  proposes_non_passes: number;
  jamais_generees: number;
  /** La mesure la plus ancienne **encore invoquée** : pour chaque matière on garde la plus
   *  récente, et on prend la plus vieille de celles-là. Ce n'est pas la plus vieille du dépôt. */
  plus_ancienne_lecture: { subject: string; date: string; jours: number } | null;
  lacunes_ouvertes: number;
  lacunes_sans_contenu: number;
  /** 🔴 **Toujours 0, par décision.** `trigger='evidence'` reste fermé : ZETIS ne se commande pas
   *  de production sur sa propre mesure. À rendre comme un vide voulu — hachures, gris, jamais
   *  rouge — et non comme un compteur de panne. */
  lots_declenches: number;
}

export interface DiagnosticSubjectRef {
  id: number;
  name: string;
  slug: string;
}

export interface DiagnosticApercuSubject extends DiagnosticSubjectRef {
  /** Les matières sans diagnostic restent dans la rangée, **atténuées** : leur absence est
   *  l'information. */
  a_un_diagnostic: boolean;
}

export interface DiagnosticApercu {
  subjects: DiagnosticApercuSubject[];
  jauges: DiagnosticJauges;
  rail: DiagnosticRailEntry[];
  jamais_genere: DiagnosticSubjectRef[];
}

// ── La portée : le pivot par notion ─────────────────────────────────────────────

export interface DiagnosticPorteePoint {
  attempt_id: number;
  score: number;
  questions_count: number;
}

export interface DiagnosticPorteeNotion {
  skill_id: number;
  skill_name: string;
  /** Indexé position par position sur `attempts`. 🔴 `null` = notion **non mesurée** par cette
   *  passation, jamais la valeur précédente reportée : un palier plat se lirait « rien n'a bougé »,
   *  l'exact contraire de « on n'a pas regardé ». */
  points: (DiagnosticPorteePoint | null)[];
  delta: number;
}

export interface DiagnosticPortee {
  subject_id: number;
  subject: string;
  /** Du plus ANCIEN au plus récent — une pente se lit dans le sens du temps. */
  attempts: { attempt_id: number; completed_at: string | null; score_percent: number }[];
  /** Seules les notions mesurées **au moins deux fois**. À une seule passation, la liste est vide
   *  et la page remplace la portée par son absence expliquée. */
  notions: DiagnosticPorteeNotion[];
}
