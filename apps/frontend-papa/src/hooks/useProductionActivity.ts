import { useCallback, useEffect, useState } from "react";
import { type ProductionActivity } from "@zetis/types";

import { acknowledgeActivity, fetchProductionActivity } from "../lib/production";

// L'activité de production (ADR-0041 §2) — **une seule lecture pour tout ce que ZETIS fabrique**.
//
// Remplace `useActiveProductionRun` dans l'en-tête : celui-là ne voyait que les LOTS, donc rien
// des ~20 producteurs synchrones. Le hook d'origine reste en place pour l'annonce de fin, qu'il
// est le seul à savoir faire (relecture par id mémorisé).
//
// ⚠️ **Papa SEULEMENT.** Rien de tel côté Massimo : lui montrer que du contenu se prépare serait
// une PROMESSE, donc une relance (ADR-0026 §4).

// ⚠️ 4 s, et c'est un constat, pas un réglage de confort : un lot-PIÈCE dure 15 à 17 s (mesuré).
// À 20 s de période, l'indicateur pouvait ne JAMAIS voir un travail entier — il naissait et
// mourait entre deux sondages. Le coût est borné : UNE requête agrégée, jamais un N+1.
const POLL_MS = 4000;

const VIDE: ProductionActivity = {
  current: null,
  queued_count: 0,
  queued: [],
  failed: [],
  worker_alive: null,
};

export interface ProductionActivityState {
  activity: ProductionActivity;
  /** « J'ai vu » — l'échec disparaît, et ne revient sur aucun appareil. */
  acknowledge: (kind: "run" | "job", id: number) => void;
}

export function useProductionActivity(): ProductionActivityState {
  const [activity, setActivity] = useState<ProductionActivity>(VIDE);

  const lire = useCallback(() => {
    void fetchProductionActivity()
      .then(setActivity)
      .catch(() => {
        // Best-effort, et c'est délibéré : une barre est un confort ; elle ne doit jamais devenir
        // une source d'alarme sur son propre compte, en travers d'un en-tête présent sur les 22
        // pages Papa.
      });
  }, []);

  useEffect(() => {
    let vivant = true;
    const tick = () => {
      if (vivant) lire();
    };
    tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      vivant = false;
      window.clearInterval(timer);
    };
  }, [lire]);

  const acknowledge = useCallback(
    (kind: "run" | "job", id: number) => {
      // Optimiste : l'échec quitte l'écran tout de suite, le serveur suit. Un aller-retour avant
      // de retirer ce que Papa vient de fermer se verrait.
      setActivity((a) => ({ ...a, failed: a.failed.filter((f) => f.id !== id || f.kind !== kind) }));
      void acknowledgeActivity(kind, id).catch(lire);
    },
    [lire],
  );

  return { activity, acknowledge };
}
