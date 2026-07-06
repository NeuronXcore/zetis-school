import { useCallback, useEffect, useState } from "react";
import {
  type CouncilReport,
  type CouncilReportListItem,
  createMissionsFromReco,
  fetchCouncilReport,
  fetchCouncilReports,
  generateCouncil,
} from "../lib/councilClass";
import { type Subject, fetchSubjects } from "../lib/subjects";

// Toute la logique de la page « Conseil de classe IA » vit ici (le composant reste
// présentationnel). Au montage : historique des rapports + dernier rapport en cours. `generate`
// crée un rapport figé (appel LLM local) ; `createMissions` réutilise le flux Commander.

export interface CreatedFeedback {
  count: number;
  skillNames: string[];
}

export interface UseCouncilClass {
  loading: boolean;
  error: string | null;
  report: CouncilReport | null;
  history: CouncilReportListItem[];
  /** Matières (pour résoudre l'icône circulaire par `subject_id`). */
  subjects: Subject[];
  generating: boolean;
  creatingKey: string | null; // clé de la reco en cours de création (skill_ids joints)
  created: CreatedFeedback | null;
  generate: (period?: string) => Promise<void>;
  openReport: (id: number) => Promise<void>;
  createMissions: (skillIds: number[], skillNames: string[]) => Promise<void>;
  dismissCreated: () => void;
}

export function useCouncilClass(): UseCouncilClass {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CouncilReport | null>(null);
  const [history, setHistory] = useState<CouncilReportListItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [generating, setGenerating] = useState(false);
  const [creatingKey, setCreatingKey] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedFeedback | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [items, subs] = await Promise.all([fetchCouncilReports(), fetchSubjects()]);
      setHistory(items);
      setSubjects(subs);
      setReport(items.length > 0 ? await fetchCouncilReport(items[0].id) : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = useCallback(async (period?: string) => {
    setGenerating(true);
    setError(null);
    setCreated(null);
    try {
      const fresh = await generateCouncil(period);
      setReport(fresh);
      setHistory((prev) => [
        { id: fresh.id, period: fresh.period, subjects_count: fresh.subjects.length, created_at: fresh.created_at },
        ...prev,
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Génération impossible");
    } finally {
      setGenerating(false);
    }
  }, []);

  const openReport = useCallback(async (id: number) => {
    setError(null);
    try {
      setReport(await fetchCouncilReport(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ouverture impossible");
    }
  }, []);

  const createMissions = useCallback(async (skillIds: number[], skillNames: string[]) => {
    const key = skillIds.join(",");
    setCreatingKey(key);
    setError(null);
    try {
      const missions = await createMissionsFromReco(skillIds);
      setCreated({ count: missions.length, skillNames });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création des missions impossible");
    } finally {
      setCreatingKey(null);
    }
  }, []);

  return {
    loading,
    error,
    report,
    history,
    subjects,
    generating,
    creatingKey,
    created,
    generate,
    openReport,
    createMissions,
    dismissCreated: () => setCreated(null),
  };
}
