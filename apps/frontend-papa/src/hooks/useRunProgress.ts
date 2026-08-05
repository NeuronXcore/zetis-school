import { useEstimatedProgress } from "@zetis/ui";
import { type ProductionRun } from "@zetis/types";

import { SCOPE_MS } from "../lib/production";

// LA lecture d'un lot en cours — une seule, pour tous les écrans qui en montrent un.
//
// ## Pourquoi elle est sortie des composants (2026-08-04)
//
// La règle était **déjà écrite**, en toutes lettres, en tête de `ProductionProgress` :
//
// > « Le libellé dit la vérité, la barre montre la vie. Un lot part en file d'attente : tant qu'il
// >   n'a pas démarré, ZETIS ne génère RIEN, et une barre qui avancerait mentirait sur ce qui se
// >   passe. »
//
// L'en-tête utilisait la **même brique** (`useEstimatedProgress`) et **pas la même leçon** : il
// lançait l'estimation dès que le lot existait. Un lot resté en file — worker éteint — y montait
// donc jusqu'à 95 % et y restait, pour toujours. Constaté à l'écran le 2026-08-04, sur un lot
// `queued` depuis quatorze minutes.
//
// Recopier la condition dans le layout en aurait fait la **troisième** implémentation de « comment
// lire un lot ». La règle vit donc ici, une fois, et les écrans la consomment.
//
// ⚠️ **La règle est : on n'estime que ce qui a DÉMARRÉ.** `queued` ne rend aucun pourcentage —
// pas 0 %, pas 1 % : `null`. Un chiffre, quel qu'il soit, se lit comme une mesure ; l'absence de
// chiffre est la seule façon honnête de dire « ça n'a pas commencé ».

// ⚠️ **Deuxième leçon, 2026-08-05 : « en file d'attente » était vrai et insuffisant.**
//
// Quatre lots ont attendu six heures parce que `scripts/dev.sh` ne lançait pas le worker. L'écran
// disait la stricte vérité — ils étaient bien en file — et cette vérité laissait croire à une file
// qui avance. Une file sans consommateur n'est pas une attente, c'est un arrêt, et les deux ne
// demandent pas le même geste de Papa : l'une se laisse finir, l'autre se répare.
//
// Le serveur répond `worker_alive` ; ici on ne fait que choisir le mot.

export interface RunProgress {
  /** Pourcentage à afficher, ou `null` tant que le lot n'a pas démarré (rien à mesurer). */
  pct: number | null;
  /** Le lot existe mais attend son tour — c'est un état, pas un avancement. */
  enFile: boolean;
  /** Ce qu'il faut écrire à la place du pourcentage. `null` quand un chiffre a du sens. */
  libelle: string | null;
  /** Personne n'exécute la file : le lot ne progressera pas tout seul. */
  arrete: boolean;
}

/** Ce qu'il faut écrire à la place du pourcentage quand il n'y en a pas encore. */
export const EN_FILE_LABEL = "en file d'attente";
/** …et quand il n'y en aura pas, faute de worker. Un CONSTAT, pas une erreur technique : Papa
 *  n'a pas à savoir ce qu'est RQ, il a à savoir que rien ne viendra sans intervention. */
export const ARRETE_LABEL = "en attente — aucun moteur de production actif";

type LotLisible = Pick<
  ProductionRun,
  "status" | "total_notions" | "progress_pct" | "scope_kind" | "started_at"
> & {
  /** Absent (`undefined`) = la question n'a pas été posée, ce qui n'est pas « non ». Seule la
   *  route `/runs/active` la pose ; ailleurs on ne présume pas d'une panne. */
  worker_alive?: boolean;
};

export function useRunProgress(run: LotLisible | null): RunProgress {
  const demarre = run?.status === "running";
  // ⚠️ Le % du serveur compte des NOTIONS. Sur un lot-PIÈCE il n'y en a qu'une : il vaut 0 % du
  // début à la fin, puis le lot disparaît. Là où le serveur n'a pas de granularité, on estime ;
  // ailleurs c'est lui qui fait foi, et on ne touche à rien.
  const sansGranularite = demarre && (run?.total_notions ?? 0) <= 1;
  // ⚠️ Appelé sans condition : un hook ne se saute pas. C'est son argument `active` qui décide,
  // et il est faux tant que le lot n'a pas démarré — donc rien ne monte.
  //
  // ⚠️ **L'estimation s'ancre sur `started_at`, jamais sur le montage.** C'est la différence entre
  // « ça travaille depuis une minute » et « je viens d'ouvrir cette page » — deux phrases que le
  // même 0 % racontait indifféremment avant le 2026-08-05.
  const estime = useEstimatedProgress(
    sansGranularite,
    SCOPE_MS[run?.scope_kind ?? ""] || 30000,
    run?.started_at ? Date.parse(run.started_at) : null,
  );

  if (run === null) return { pct: null, enFile: false, libelle: null, arrete: false };
  if (!demarre) {
    const enFile = run.status === "queued";
    // `=== false` et non `!run.worker_alive` : `undefined` veut dire « pas demandé ».
    const arrete = enFile && run.worker_alive === false;
    return {
      pct: null,
      enFile,
      libelle: arrete ? ARRETE_LABEL : enFile ? EN_FILE_LABEL : null,
      arrete,
    };
  }
  return {
    pct: sansGranularite ? estime : run.progress_pct,
    enFile: false,
    libelle: null,
    arrete: false,
  };
}
