import { useCallback, useEffect, useRef, useState } from "react";
import { type ActiveProductionRun, type ProductionRun } from "@zetis/types";

import { fetchActiveProductionRun, fetchProductionRun } from "../lib/production";

// Indicateur d'en-tête « ZETIS travaille » (Papa uniquement).
//
// Il comble le trou que la slice C laissait : une fois la modale fermée, plus rien ne disait que
// le lot tournait. Papa l'a lancé, il a le droit de savoir où il en est sans rouvrir la modale.
//
// ⚠️ **Papa SEULEMENT.** Rien de tel côté Massimo : lui montrer que du contenu se prépare serait
// une PROMESSE, donc une relance (« rappel ≠ relance », ADR-0026 §4), et rendrait impossible
// l'invariant V1 de l'addendum §G — un contenu retiré avant consommation doit n'avoir jamais
// existé pour lui, ce qu'on ne peut pas faire après l'avoir annoncé.

// ⚠️ **Ramené de 20 s à 4 s le 2026-08-03**, et le motif est un constat, pas un réglage de confort :
// un lot-PIÈCE dure 15 à 17 s (mesuré). À 20 s de période, l'indicateur pouvait ne JAMAIS voir un
// lot entier — il naissait et mourait entre deux sondages.
//
// Le coût est borné : `GET /runs/active` est UNE requête indexée qui rend un état, jamais un
// agrégat. Ce n'est pas le motif qui avait tué le sondage de l'en-tête le 2026-08-02 — celui-là
// faisait N requêtes par page.
const POLL_MS = 4000;

export interface ActiveProduction {
  /** Le lot en cours, ou `null`. Il porte `worker_alive` — cette route est la seule à le savoir. */
  run: ActiveProductionRun | null;
  /** Le lot qui vient de se TERMINER, à annoncer une fois. `null` le reste du temps. */
  finished: ProductionRun | null;
  /** Acquitte l'annonce. Sans ça, la carte reviendrait au sondage suivant. */
  acknowledge: () => void;
}

export function useActiveProductionRun(): ActiveProduction {
  const [run, setRun] = useState<ActiveProductionRun | null>(null);
  const [finished, setFinished] = useState<ProductionRun | null>(null);

  // Le dernier lot vu ACTIF. C'est lui qui permet de détecter une fin : `/active` rend `null` dès
  // que le lot est terminé, donc l'état final ne s'y lit jamais — il faut le relire par son id.
  //
  // ⚠️ Il naît à `null`, et c'est voulu : au premier chargement de page, aucun lot n'est réputé
  // « en cours », donc un lot terminé AVANT l'ouverture n'est jamais annoncé. On annonce ce qu'on
  // a vu se terminer, jamais ce qu'on découvre déjà fini — sans quoi chaque navigation
  // ressusciterait la dernière production.
  const dernierActif = useRef<number | null>(null);

  const acknowledge = useCallback(() => setFinished(null), []);

  useEffect(() => {
    let alive = true;
    const read = () => {
      void fetchActiveProductionRun()
        .then((r) => {
          if (!alive) return;
          setRun(r);
          if (r) {
            dernierActif.current = r.id;
            return;
          }
          const id = dernierActif.current;
          if (id === null) return;
          dernierActif.current = null; // consommé : on n'annonce qu'une fois
          void fetchProductionRun(id)
            .then((f) => {
              if (alive) setFinished(f);
            })
            .catch(() => {
              // Le lot a bien fini ; on n'a juste pas pu lire son détail. Pas d'annonce
              // approximative — le Journal, lui, dira tout.
            });
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

  return { run, finished, acknowledge };
}
