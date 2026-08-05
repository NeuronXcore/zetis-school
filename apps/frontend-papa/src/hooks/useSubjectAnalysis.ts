import { useCallback, useEffect, useState } from "react";
import type { SubjectAnalysis } from "@zetis/types";
import { fetchSubjectAnalysis } from "../lib/subjectAnalysis";

// Chargement paresseux de l'analyse d'une matière — patron de `DayDetailPanel`, la première
// exception réseau du dashboard (ADR-0028 §4).
//
// `subjectId === null` = panneau fermé = AUCUNE requête. La garde est ici et non chez l'appelant :
// un composant qui oublierait de démonter le panneau ne doit pas pouvoir déclencher un appel.

export interface UseSubjectAnalysis {
  /** `true` seulement pendant un chargement réel — `false` quand `subjectId` est `null`. */
  loading: boolean;
  error: string | null;
  analysis: SubjectAnalysis | null;
  /** Relance la MÊME matière après une erreur. Sans effet si `subjectId` est `null`. */
  retry: () => void;
}

export function useSubjectAnalysis(subjectId: number | null): UseSubjectAnalysis {
  const [analysis, setAnalysis] = useState<SubjectAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Seul rôle : forcer un nouveau passage de l'effet à `subjectId` constant.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (subjectId === null) {
      setAnalysis(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    // ⚠️ Purge AVANT l'appel, et c'est un CORRECTIF sur le précédent : `DayDetailPanel` garde son
    // détail pendant le chargement du jour suivant. Toléré pour des minutes ; intenable ici, où
    // les notions de Mathématiques resteraient NOMMÉES sous le titre « SVT » le temps de
    // l'aller-retour.
    setAnalysis(null);
    setLoading(true);
    setError(null);

    fetchSubjectAnalysis(subjectId)
      .then((data) => {
        if (!cancelled) setAnalysis(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "L'analyse n'a pas pu être chargée.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Couvre les deux cas : changement de matière (la réponse de la précédente arrive après et
    // est jetée) et démontage (désélection, navigation).
    return () => {
      cancelled = true;
    };
  }, [subjectId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { loading, error, analysis, retry };
}
