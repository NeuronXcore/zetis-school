import { useEffect, useState } from "react";
import { type ProductionRun } from "@zetis/types";

import { fetchActiveProductionRun } from "../lib/production";

// Indicateur d'en-tête « ZETIS travaille » (Papa uniquement).
//
// Il comble le trou que la slice C laissait : une fois la modale fermée, plus rien ne disait que
// le lot tournait. Papa l'a lancé, il a le droit de savoir où il en est sans rouvrir la modale.
//
// ⚠️ **Papa SEULEMENT.** Rien de tel côté Massimo : lui montrer que du contenu se prépare serait
// une PROMESSE, donc une relance (« rappel ≠ relance », ADR-0026 §4), et rendrait impossible
// l'invariant V1 de l'addendum §G — un contenu retiré avant consommation doit n'avoir jamais
// existé pour lui, ce qu'on ne peut pas faire après l'avoir annoncé.

const POLL_MS = 20000;

export function useActiveProductionRun(): ProductionRun | null {
  const [run, setRun] = useState<ProductionRun | null>(null);

  useEffect(() => {
    let alive = true;
    const read = () => {
      void fetchActiveProductionRun()
        .then((r) => {
          if (alive) setRun(r);
        })
        .catch(() => {
          // Best-effort : un indicateur muet vaut mieux qu'une erreur en travers de l'en-tête,
          // qui est présent sur TOUTES les pages Papa.
        });
    };
    read();
    const timer = window.setInterval(read, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  return run;
}
