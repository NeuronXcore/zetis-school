import { useCallback, useEffect, useState } from "react";
import type { MotivationWeek } from "@zetis/types";
import { fetchWeek, updateWeekGoal } from "../lib/motivation";

// « Ma semaine » : lecture + pose de l'engagement.
//
// Écriture OPTIMISTE : la pastille choisie s'allume immédiatement — un enfant qui se donne un
// objectif doit voir son geste pris en compte tout de suite, pas après un aller-retour réseau.
// En cas d'échec, on revient à l'état précédent et on le dit doucement (jamais de code HTTP).

export interface MotivationWeekState {
  week: MotivationWeek | null;
  loading: boolean;
  pending: boolean;
  /** Message doux en cas d'échec d'écriture. Jamais de détail technique. */
  notice: string | null;
  chooseGoal: (targetDays: number) => void;
}

/**
 * @param onGoalChanged appelé après une écriture RÉUSSIE. Sert à rafraîchir ce qui dépend de
 * l'engagement — le message de ZETIS, notamment : sans lui, il resterait sur « engagement tenu »
 * alors que Massimo vient de relever son objectif, et contredirait la carte juste en dessous.
 */
export function useMotivationWeek(onGoalChanged?: () => void): MotivationWeekState {
  const [week, setWeek] = useState<MotivationWeek | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchWeek()
      .then((data) => {
        if (active) setWeek(data);
      })
      .catch(() => {
        // Silence : la carte « Ma semaine » ne s'affiche pas, le reste de la page vit.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const chooseGoal = useCallback(
    (targetDays: number) => {
      if (pending) return; // pas deux envois en vol
      const previous = week;
      setNotice(null);
      setPending(true);
      // Optimiste : `goal_met` est recalculé serveur, on ne le devine pas ici.
      setWeek((current) => (current ? { ...current, goal_days: targetDays } : current));

      updateWeekGoal(targetDays)
        .then((fresh) => {
          setWeek(fresh);
          onGoalChanged?.();
        })
        .catch(() => {
          setWeek(previous);
          setNotice("Pas enregistré, réessaie.");
        })
        .finally(() => setPending(false));
    },
    [pending, week, onGoalChanged],
  );

  return { week, loading, pending, notice, chooseGoal };
}
