import { useEffect, useState } from "react";

import { useEstimatedProgress } from "@zetis/ui";

import { API_URL } from "../lib/authClient";
import { asJson, authHeader } from "../lib/httpClient";

// Combien de temps chaque type de travail prend — **lu, jamais deviné** (ADR-0041 §9).
//
// ## Ce que ce hook remplace
//
// Vingt-trois surfaces Papa portaient chacune leur durée en dur. La rédaction d'un cours en avait
// **cinq** selon l'écran d'où on la lançait (45 / 42 / 50 / 50 / 22 s) ; l'équipement d'une notion,
// quatre. Aucun test de rendu ne pouvait attraper ça : chaque composant était juste **tout seul**.
//
// ⚠️ **Ce n'est pas la même chose que `estimated_ms`, et les deux sont nécessaires.**
//
// - `estimated_ms` (porté par `/activity` et `/ai/jobs/{id}`) répond pour un travail **qui
//   existe** — avec, en prime, son `started_at` serveur ;
// - cette table répond **avant** qu'il existe : l'aperçu d'un lot (« ~36 min »), et la poignée de
//   secondes entre le clic et la première réponse du sondage. Sans elle, chaque écran aurait dû
//   garder une valeur en dur juste pour cet instant-là — c'est-à-dire garder le défaut.
//
// Les valeurs sont la **médiane des dernières exécutions réussies** de chaque type, amorce sinon.

/** Un cache de module : la table change à l'échelle de la journée, pas de la navigation. Sans lui,
 *  chaque montage d'une modale referait la requête — et il y a douze surfaces concernées. */
let cache: Record<string, number> | null = null;
let enVol: Promise<Record<string, number>> | null = null;
/** 🔴 **L'échec se retient, sinon il se répète.** Constaté en direct le 2026-08-06 : le backend a
 *  reçu `GET /production/estimations` en rafale, quatorze fois en quelques secondes, depuis quatre
 *  ports. Cause : `enVol` était remis à `null` dans un `finally`, donc **chaque montage de
 *  composant relançait la requête** — et il y a seize barres réparties sur vingt-deux pages, que la
 *  navigation démonte et remonte sans cesse. Le `catch` silencieux du hook masquait la boucle.
 *
 *  Une seule tentative par chargement de page. Si elle échoue (401 sur un onglet déconnecté,
 *  backend éteint), on sert `{}` : les barres deviennent **indéterminées**, ce qui est honnête —
 *  cette table est un confort d'affichage, pas une donnée. */
let echoue = false;

export async function fetchEstimations(): Promise<Record<string, number>> {
  if (cache) return cache;
  if (echoue) return {};
  // ⚠️ Une seule requête même si dix composants montent dans le même tic : on partage la promesse.
  enVol ??= asJson<Record<string, number>>(
    await fetch(`${API_URL}/api/production/estimations`, { headers: authHeader() }),
  )
    .then((t) => {
      cache = t;
      enVol = null;
      return t;
    })
    .catch((e) => {
      // ⚠️ `enVol` n'est PAS remis à `null` avant d'avoir armé `echoue` : sans ça, un montage
      // concurrent repartirait pour un tour et la rafale reprendrait.
      echoue = true;
      enVol = null;
      throw e;
    });
  return enVol;
}

/** Uniquement pour les tests : repart d'un cache vide, échec compris. */
export function _reinitialiserPourTest(): void {
  cache = null;
  enVol = null;
  echoue = false;
}

/** Les durées attendues par `job_type`. `{}` tant que la réponse n'est pas là.
 *
 *  ⚠️ **`estimationMs` rend `null` quand il ne sait pas encore**, et il ne faut surtout pas y
 *  substituer un nombre : `useEstimatedProgress` doit alors rester INACTIF, sinon la barre
 *  démarrerait sur une durée inventée — précisément ce que ce hook supprime. Une barre
 *  indéterminée pendant une seconde est honnête ; une barre qui ment ne l'est pas. */
export function useEstimations(): {
  estimations: Record<string, number>;
  estimationMs: (jobType: string) => number | null;
} {
  const [estimations, setEstimations] = useState<Record<string, number>>(cache ?? {});

  useEffect(() => {
    let vivant = true;
    // Un échec est SILENCIEUX : cette table est un confort d'affichage, pas une donnée. Alarmer
    // sur son absence transformerait un détail de barre en incident.
    fetchEstimations()
      .then((t) => vivant && setEstimations(t))
      .catch(() => undefined);
    return () => {
      vivant = false;
    };
  }, []);

  return {
    estimations,
    estimationMs: (jobType: string) => estimations[jobType] ?? null,
  };
}

/** LA forme que prennent les barres locales depuis le §9 — remplacement d'une ligne.
 *
 *  ```tsx
 *  const pct = useEstimatedProgress(generating, 42000);        // avant
 *  const pct = useProgressionEstimee(generating, "lesson_content");  // après
 *  ```
 *
 *  ⚠️ **Rend `null` tant que la durée n'est pas connue**, et `ProgressBar` sait le rendre : barre
 *  indéterminée, sans chiffre. C'est le point entier — le passer à `0` fabriquerait la mesure
 *  qu'on vient de refuser de donner (même règle que `pct` côté serveur, §1).
 *
 *  `ancreMs` = le `started_at` **serveur** quand la surface le connaît. Sans lui, l'estimation
 *  mesure l'âge de l'AFFICHAGE : Papa quitte la page, revient, et retrouve « 0 % » sur un travail
 *  commencé depuis une minute (constaté le 2026-08-05).
 *
 *  `facteur` multiplie la durée unitaire quand une surface lance N travaux du même type — un kit
 *  de chapitre, c'est N équipements de notion. ⚠️ Il multiplie une durée **mesurée**, il n'en
 *  invente pas une.
 */
export function useProgressionEstimee(
  actif: boolean,
  jobType: string,
  options?: { ancreMs?: number | null; facteur?: number },
): number | null {
  const { estimationMs } = useEstimations();
  const unitaire = estimationMs(jobType);
  const attendu = unitaire === null ? null : unitaire * Math.max(1, options?.facteur ?? 1);
  // ⚠️ Le hook est appelé SANS condition — un hook ne se saute pas. C'est `actif` qui décide, et
  // il est faux tant qu'on ne sait pas combien de temps ça dure.
  const pct = useEstimatedProgress(actif && attendu !== null, attendu ?? 0, options?.ancreMs);
  return attendu === null ? null : pct;
}
