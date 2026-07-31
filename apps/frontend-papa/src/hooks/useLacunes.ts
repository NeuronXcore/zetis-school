import { useCallback, useEffect, useState } from "react";
import type { OpenGap } from "@zetis/types";
import { fetchOpenGaps } from "../lib/activity";
import { generateRemediation, generateRevision, notifyPendingChanged } from "../lib/missionsPilotage";

// État de la page Lacunes — patron maison à trois couches (référence : `useCouncilClass`).
//
// La page est la surface de DÉCISION vers laquelle le dashboard renvoie. Elle ne compose rien
// elle-même : elle appelle les deux générateurs existants et relit la liste.

export interface UseLacunes {
  loading: boolean;
  error: string | null;
  gaps: OpenGap[];
  /** Lacunes qu'aucune mission active ne couvre — celles qui attendent vraiment un geste. */
  pending: OpenGap[];
  busy: null | "remediation" | "revision";
  /** Message de résultat de la dernière génération (« 2 missions créées »). */
  result: string | null;
  reload: () => void;
  createRemediation: () => Promise<void>;
  createRevision: () => Promise<void>;
}

export function useLacunes(): UseLacunes {
  const [gaps, setGaps] = useState<OpenGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "remediation" | "revision">(null);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setGaps(await fetchOpenGaps());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Les notions à renforcer n'ont pas pu être chargées.");
      setGaps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (kind: "remediation" | "revision") => {
      setBusy(kind);
      setError(null);
      setResult(null);
      try {
        const { created } =
          kind === "remediation" ? await generateRemediation() : await generateRevision();
        setResult(
          created === 0
            ? "Aucune mission à créer : tout ce qui pouvait l'être l'est déjà."
            : `${created} mission${created > 1 ? "s" : ""} créée${created > 1 ? "s" : ""}, en attente de ta validation.`,
        );
        // La sidebar tient un compteur « à valider » : sans ce signal il mentirait jusqu'au
        // prochain rechargement complet.
        notifyPendingChanged();
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "La génération a échoué.");
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  return {
    loading,
    error,
    gaps,
    pending: gaps.filter((gap) => !gap.has_active_mission),
    busy,
    result,
    reload: () => void load(),
    createRemediation: () => run("remediation"),
    createRevision: () => run("revision"),
  };
}
