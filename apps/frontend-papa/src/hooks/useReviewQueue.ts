import { useCallback, useEffect, useState } from "react";
import type { ReviewItem, ReviewQueue } from "@zetis/types";
import { fetchReviewQueue } from "../lib/reviewQueue";
import { reviewAction, type ReviewVerdict } from "../lib/reviewActions";

// État de la file de relecture : un chargement, puis des retraits optimistes.
//
// ⚠️ **Le filtrage se fait CÔTÉ SERVEUR ici, et c'est volontairement l'inverse du dashboard.**
// L'ADR-0028 §1 précharge tout parce que ses données sont un agrégat borné et que chaque clic doit
// être instantané. Une file est une liste : la précharger entière pour la filtrer en mémoire
// marcherait aussi, mais le serveur rend déjà `counts` et `subjects` NON filtrés — ce qui suffit à
// garder les pastilles stables sans rien conserver localement.

interface State {
  queue: ReviewQueue | null;
  loading: boolean;
  error: string | null;
}

const VIDE: ReviewQueue = {
  counts: { lesson: 0, fiche: 0, mindmap: 0, capsule: 0, chapter: 0, total: 0 },
  subjects: [],
  items: [],
};

export function useReviewQueue(subjectId: number | null, kind: string | null) {
  const [state, setState] = useState<State>({ queue: null, loading: true, error: null });
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setState((cur) => ({ ...cur, loading: true, error: null }));
    try {
      const queue = await fetchReviewQueue({ subjectId, kind });
      setState({ queue, loading: false, error: null });
    } catch (cause: unknown) {
      setState({
        queue: null,
        loading: false,
        error: cause instanceof Error ? cause.message : "Chargement de la file échoué",
      });
    }
  }, [subjectId, kind]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // La file se relit quand Papa REVIENT — pas au chronomètre. Le parcours de cette page envoie
  // vers une page de pilotage pour lire le contenu ; au retour, le statut a pu changer là-bas.
  // Même arbitrage que `DemandesPage`, et pour la même raison : un sondage ferait travailler une
  // page que personne ne regarde.
  useEffect(() => {
    const revenir = () => {
      if (document.visibilityState === "visible") void reload();
    };
    window.addEventListener("focus", revenir);
    document.addEventListener("visibilitychange", revenir);
    return () => {
      window.removeEventListener("focus", revenir);
      document.removeEventListener("visibilitychange", revenir);
    };
  }, [reload]);

  /** Verdict de Papa sur une ligne. **Retrait optimiste** : la ligne part tout de suite et la file
   *  ne se recharge pas — recharger ferait sauter la liste sous le curseur au moment précis où
   *  Papa enchaîne. En cas d'échec, on rétablit tout par un `reload` et on dit pourquoi. */
  const decide = useCallback(
    async (item: ReviewItem, verdict: ReviewVerdict) => {
      const clef = `${item.kind}:${item.id}`;
      setBusyId(clef);
      setState((cur) =>
        cur.queue === null
          ? cur
          : {
              ...cur,
              queue: {
                ...cur.queue,
                counts: {
                  ...cur.queue.counts,
                  [item.kind]: Math.max(0, cur.queue.counts[item.kind] - 1),
                  total: Math.max(0, cur.queue.counts.total - 1),
                },
                items: cur.queue.items.filter(
                  (row) => !(row.kind === item.kind && row.id === item.id),
                ),
              },
            },
      );
      try {
        await reviewAction(item.kind, verdict, item.id);
      } catch (cause: unknown) {
        // ⚠️ L'ordre compte : `reload()` remet `error` à `null` au départ ET à l'arrivée. Poser le
        // message AVANT le rechargement le ferait effacer par le rechargement lui-même — la ligne
        // reviendrait sans que rien n'explique pourquoi, ce qui se lit comme un clic ignoré.
        await reload();
        setState((cur) => ({
          ...cur,
          error: cause instanceof Error ? cause.message : "Le verdict n'a pas été enregistré",
        }));
      } finally {
        setBusyId(null);
      }
    },
    [reload],
  );

  return {
    queue: state.queue ?? VIDE,
    chargee: state.queue !== null,
    loading: state.loading,
    error: state.error,
    busyId,
    decide,
    reload,
  };
}
