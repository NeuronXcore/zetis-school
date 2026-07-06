import { useCallback, useEffect, useState } from "react";
import {
  type CouncilReport,
  type CouncilReportListItem,
  type EquipNotionResult,
  createMissionsFromReco,
  equipNotion,
  fetchCouncilReport,
  fetchCouncilReports,
  generateCouncil,
} from "../lib/councilClass";
import { type MissionPilot, fetchPilotList } from "../lib/missionsPilotage";
import { type Subject, fetchSubjects } from "../lib/subjects";

/** Notions déjà « équipées » = celles qui ont au moins une mission `manual` (créée depuis ce
 *  flux ou Commander). Dérivé du backend pour survivre à un rechargement. */
function manualMissionSkillIds(missions: MissionPilot[]): Set<number> {
  return new Set(
    missions
      .filter((m) => m.mission_type === "manual" && m.skill_id != null)
      .map((m) => m.skill_id as number),
  );
}

// Toute la logique de la page « Conseil de classe IA » vit ici (le composant reste
// présentationnel). Au montage : historique des rapports + dernier rapport en cours. `generate`
// crée un rapport figé (appel LLM local) ; `createMissions` réutilise le flux Commander.

export interface CreatedFeedback {
  count: number;
  skillNames: string[];
}

/** Notion en cours d'équipement (barre de progression par notion). */
export interface Equipping {
  name: string;
  index: number; // 1-based
  total: number;
}

export interface UseCouncilClass {
  loading: boolean;
  error: string | null;
  report: CouncilReport | null;
  history: CouncilReportListItem[];
  /** Matières (pour résoudre l'icône circulaire par `subject_id`). */
  subjects: Subject[];
  generating: boolean;
  /** Non-null pendant que ZETIS génère le kit d'une notion (barre de progression). */
  equipping: Equipping | null;
  /** Récap par notion du dernier « Créer ces missions » (généré / sauté / erreurs). */
  equipResults: EquipNotionResult[];
  /** `skill_id` dont les missions ont été générées cette session (mise en évidence + badge). */
  generatedSkillIds: Set<number>;
  created: CreatedFeedback | null;
  generate: (period?: string) => Promise<void>;
  openReport: (id: number) => Promise<void>;
  /** Équipe chaque notion (kit auto-validé) PUIS crée les missions (ADR-0021). */
  equipAndCreateMissions: (skillIds: number[], skillNames: string[]) => Promise<void>;
  dismissCreated: () => void;
}

export function useCouncilClass(): UseCouncilClass {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CouncilReport | null>(null);
  const [history, setHistory] = useState<CouncilReportListItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [generating, setGenerating] = useState(false);
  const [equipping, setEquipping] = useState<Equipping | null>(null);
  const [equipResults, setEquipResults] = useState<EquipNotionResult[]>([]);
  const [generatedSkillIds, setGeneratedSkillIds] = useState<Set<number>>(new Set());
  const [created, setCreated] = useState<CreatedFeedback | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [items, subs, missions] = await Promise.all([
        fetchCouncilReports(),
        fetchSubjects(),
        fetchPilotList(),
      ]);
      setHistory(items);
      setSubjects(subs);
      // Notions déjà équipées (missions `manual` existantes) → badge persistant après rechargement.
      setGeneratedSkillIds(manualMissionSkillIds(missions));
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

  const equipAndCreateMissions = useCallback(
    async (skillIds: number[], skillNames: string[]) => {
      setError(null);
      setCreated(null);
      setEquipResults([]);
      const results: EquipNotionResult[] = [];
      try {
        // 1) Équiper chaque notion (kit auto-validé) — une barre par notion.
        for (let i = 0; i < skillIds.length; i++) {
          setEquipping({ name: skillNames[i] ?? `notion ${skillIds[i]}`, index: i + 1, total: skillIds.length });
          results.push(await equipNotion(skillIds[i]));
        }
        setEquipResults(results);
        // 2) Créer les missions APRÈS l'équipement (leurs étapes résolvent les ressources fraîches).
        const missions = await createMissionsFromReco(skillIds);
        setCreated({ count: missions.length, skillNames });
        setGeneratedSkillIds((prev) => new Set([...prev, ...skillIds]));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Équipement / création impossible");
      } finally {
        setEquipping(null);
      }
    },
    [],
  );

  return {
    loading,
    error,
    report,
    history,
    subjects,
    generating,
    equipping,
    equipResults,
    generatedSkillIds,
    created,
    generate,
    openReport,
    equipAndCreateMissions,
    dismissCreated: () => setCreated(null),
  };
}
