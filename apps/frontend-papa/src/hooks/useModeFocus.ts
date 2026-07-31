import { useCallback, useEffect, useState } from "react";
import type { OpenGap } from "@zetis/types";
import { fetchOpenGaps } from "../lib/activity";
import { commandConfirm, notifyPendingChanged } from "../lib/missionsPilotage";

// État du mode focus — même source que la page Lacunes (`GET /api/parent/progress/gaps`).
//
// Le « focus » n'existe PAS comme état persistant côté backend : zéro occurrence. Ce qui existe,
// c'est `Mission.force_priority` — un plancher de score dans le sélecteur (ADR-0018). Mettre une
// notion en tête revient donc à créer une mission prioritaire sur elle, via la route Commander
// déjà en place. Aucune route nouvelle, aucune migration.

export interface UseModeFocus {
  loading: boolean;
  error: string | null;
  /** Notions qu'aucune mission active ne couvre — les seules qu'on puisse mettre en tête. */
  targets: OpenGap[];
  /** Notions déjà couvertes : affichées, mais pas proposées (créer un doublon n'aiderait pas). */
  covered: OpenGap[];
  busySkillId: number | null;
  /** Dernière notion mise en tête, pour l'accusé de réception. */
  done: OpenGap | null;
  reload: () => void;
  prioritise: (gap: OpenGap) => Promise<void>;
}

export function useModeFocus(): UseModeFocus {
  const [gaps, setGaps] = useState<OpenGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busySkillId, setBusySkillId] = useState<number | null>(null);
  const [done, setDone] = useState<OpenGap | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setGaps(await fetchOpenGaps());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Les notions n'ont pas pu être chargées.");
      setGaps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const prioritise = useCallback(
    async (gap: OpenGap) => {
      setBusySkillId(gap.skill_id);
      setError(null);
      try {
        await commandConfirm({
          // `gate` est requis par le contrat mais non persisté : il déclare d'où vient la
          // commande. `theme_ref` = « une notion identifiée », par opposition à `deadline`.
          gate: "theme_ref",
          skill_ids: [gap.skill_id],
          force_priority: true,
        });
        setDone(gap);
        notifyPendingChanged();
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "La mise en tête a échoué.");
      } finally {
        setBusySkillId(null);
      }
    },
    [load],
  );

  return {
    loading,
    error,
    targets: gaps.filter((gap) => !gap.has_active_mission),
    covered: gaps.filter((gap) => gap.has_active_mission),
    busySkillId,
    done,
    reload: () => void load(),
    prioritise,
  };
}
