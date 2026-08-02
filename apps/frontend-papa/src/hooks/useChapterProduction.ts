import { useCallback, useEffect, useRef, useState } from "react";
import { type ProductionPreview, type ProductionRun } from "@zetis/types";

import {
  fetchProductionRun,
  previewChapterProduction,
  startChapterProduction,
} from "../lib/production";

// Production en lot d'un chapitre (ADR-0031). Patron **preview → confirm** de la maison
// (ADR-0010/0018, `useChampionMission`) : rien n'est produit tant que Papa n'a pas vu ce qui le
// sera. C'est aussi ce qui évite de charger un aperçu par chapitre au rendu de la page — un seul
// appel, au moment du geste.
//
// Le gate du §7 (addendum ADR-0031) se lit ICI, avant le clic : sur un chapitre neuf, `eligible`
// est vide et `blocked` porte le motif. Sans ça, Papa lancerait un lot qui ne produirait rien et
// lirait un échec là où le gate fonctionne.

const POLL_MS = 3000;

export interface UseChapterProduction {
  chapterId: number | null;
  preview: ProductionPreview | null;
  run: ProductionRun | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  open: (chapterId: number) => void;
  close: () => void;
  confirm: () => void;
}

export function useChapterProduction(onFinished?: () => void): UseChapterProduction {
  const [chapterId, setChapterId] = useState<number | null>(null);
  const [preview, setPreview] = useState<ProductionPreview | null>(null);
  const [run, setRun] = useState<ProductionRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const open = useCallback((id: number) => {
    setChapterId(id);
    setRun(null);
    setPreview(null);
    setError(null);
    setLoading(true);
    void previewChapterProduction(id)
      .then(setPreview)
      .catch(() => setError("Aperçu indisponible — réessaie dans un instant."))
      .finally(() => setLoading(false));
  }, []);

  const close = useCallback(() => {
    stopPolling();
    setChapterId(null);
    setPreview(null);
    setRun(null);
    setError(null);
  }, [stopPolling]);

  const confirm = useCallback(() => {
    if (chapterId === null) return;
    setError(null);
    setLoading(true);
    void startChapterProduction(chapterId)
      .then((started) => {
        setRun(started);
        // Suivi : le lot est ACCEPTÉ (202), pas fini. On interroge son état jusqu'au terme.
        timer.current = window.setInterval(() => {
          void fetchProductionRun(started.id)
            .then((fresh) => {
              setRun(fresh);
              if (fresh.status === "done" || fresh.status === "failed") {
                stopPolling();
                onFinished?.();
              }
            })
            .catch(() => {
              /* best-effort : une interrogation ratée n'annule pas le lot */
            });
        }, POLL_MS);
      })
      .catch((e: unknown) => {
        // 409 = l'arriéré de relecture déborde. Le message du serveur DIT pourquoi — on le
        // relaie tel quel plutôt que de le remplacer par un « erreur » générique.
        const detail = e instanceof Error ? e.message : "";
        setError(detail || "La production n'a pas pu démarrer.");
      })
      .finally(() => setLoading(false));
  }, [chapterId, onFinished, stopPolling]);

  const busy = run !== null && (run.status === "queued" || run.status === "running");
  return { chapterId, preview, run, loading, busy, error, open, close, confirm };
}
