import { useCallback, useEffect, useState } from "react";
import type { ProgressionSubject } from "@zetis/types";
import { fetchProgressionOverview } from "../lib/activity";

// État de la page Progression — patron maison à trois couches (référence : `useLacunes`).
//
// **Un seul appel, au montage, et plus rien ensuite.** La page n'a aucun filtre, aucune période et
// aucune action : il n'existe donc aucun geste capable de déclencher une seconde requête. C'est
// volontaire (ADR-0038 §6) — le jour où un sélecteur apparaîtrait ici, il faudrait rouvrir l'ADR,
// pas ajouter un argument à `load`.

export interface UseProgression {
  loading: boolean;
  error: string | null;
  subjects: ProgressionSubject[];
  schoolYear: { label: string; level: string } | null;
  reload: () => void;
}

export function useProgression(): UseProgression {
  const [subjects, setSubjects] = useState<ProgressionSubject[]>([]);
  const [schoolYear, setSchoolYear] = useState<{ label: string; level: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await fetchProgressionOverview();
      setSubjects(body.subjects);
      setSchoolYear(body.school_year ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "La progression n'a pas pu être chargée.");
      // La liste est vidée, mais l'erreur reste affichée AVEC son bouton : une page qui se vide
      // sans rien dire se lit « il n'y a rien », pas « ça n'a pas chargé ».
      setSubjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { loading, error, subjects, schoolYear, reload: () => void load() };
}
