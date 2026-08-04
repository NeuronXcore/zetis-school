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

export interface RunProgress {
  /** Pourcentage à afficher, ou `null` tant que le lot n'a pas démarré (rien à mesurer). */
  pct: number | null;
  /** Le lot existe mais attend son tour — c'est un état, pas un avancement. */
  enFile: boolean;
}

/** Ce qu'il faut écrire à la place du pourcentage quand il n'y en a pas encore. */
export const EN_FILE_LABEL = "en file d'attente";

type LotLisible = Pick<
  ProductionRun,
  "status" | "total_notions" | "progress_pct" | "scope_kind"
>;

export function useRunProgress(run: LotLisible | null): RunProgress {
  const demarre = run?.status === "running";
  // ⚠️ Le % du serveur compte des NOTIONS. Sur un lot-PIÈCE il n'y en a qu'une : il vaut 0 % du
  // début à la fin, puis le lot disparaît. Là où le serveur n'a pas de granularité, on estime ;
  // ailleurs c'est lui qui fait foi, et on ne touche à rien.
  const sansGranularite = demarre && (run?.total_notions ?? 0) <= 1;
  // ⚠️ Appelé sans condition : un hook ne se saute pas. C'est son argument `active` qui décide,
  // et il est faux tant que le lot n'a pas démarré — donc rien ne monte.
  const estime = useEstimatedProgress(sansGranularite, SCOPE_MS[run?.scope_kind ?? ""] || 30000);

  if (run === null) return { pct: null, enFile: false };
  if (!demarre) return { pct: null, enFile: run.status === "queued" };
  return { pct: sansGranularite ? estime : run.progress_pct, enFile: false };
}
