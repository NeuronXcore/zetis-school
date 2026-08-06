import { useCallback, useEffect, useState } from "react";
import {
  type CouncilReport,
  type CouncilReportListItem,
  type EquipNotionResult,
  composeChampionFromReco,
  createMissionsFromReco,
  equipNotion,
  fetchCouncilReport,
  fetchCouncilReports,
  generateCouncil,
} from "../lib/councilClass";
import {
  MISSION_CHAMPION_MAX_SKILLS,
  type MissionPilot,
  fetchPilotList,
} from "../lib/missionsPilotage";
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

/** Défi champion croisé proposé par le Conseil (ADR-0022 §8) : agrégat des recommandations
 *  ancrées de ≥ 2 matières du rapport. `null` si moins de 2 matières recommandées. */
export interface ChampionSuggestion {
  skillIds: number[];
  notions: { skill_id: number; name: string; subject_name: string }[];
  flavor: string;
}

/** Dérive une suggestion champion depuis le rapport figé : une notion recommandée en tête de
 *  chaque matière qui en a, sur ≥ 2 matières (plafond partagé). Réutilise l'ancrage (pas de LLM). */
function deriveChampionSuggestion(report: CouncilReport | null): ChampionSuggestion | null {
  if (!report) return null;
  const notions: ChampionSuggestion["notions"] = [];
  for (const s of report.subjects) {
    const rec = s.recommendations[0];
    if (!rec || rec.skill_ids.length === 0) continue;
    notions.push({
      skill_id: rec.skill_ids[0],
      name: rec.skill_names[0] ?? `notion ${rec.skill_ids[0]}`,
      subject_name: s.subject_name,
    });
    if (notions.length >= MISSION_CHAMPION_MAX_SKILLS) break;
  }
  if (notions.length < 2) return null; // une notion par matière → < 2 = pas croisé
  return { skillIds: notions.map((n) => n.skill_id), notions, flavor: "consolidation" };
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
  /** Défi champion croisé proposé (agrégat des recos ≥ 2 matières), ou null. */
  championSuggestion: ChampionSuggestion | null;
  /** Un défi champion planned|active existe déjà → on n'en propose pas un doublon. */
  hasActiveChampion: boolean;
  generate: (period?: string, subjectId?: number) => Promise<void>;
  openReport: (id: number) => Promise<void>;
  /** Équipe chaque notion (kit auto-validé) PUIS crée les missions (ADR-0021). */
  equipAndCreateMissions: (skillIds: number[], skillNames: string[]) => Promise<void>;
  /** Équipe chaque notion PUIS compose UN défi champion croisé (ADR-0022 §8). */
  equipAndCreateChampion: (skillIds: number[], skillNames: string[]) => Promise<void>;
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
  const [hasActiveChampion, setHasActiveChampion] = useState(false);

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
      // Défi champion déjà en cours → on ne repropose pas (reload-safe, sans doublon).
      setHasActiveChampion(
        missions.some(
          (mm) => mm.mission_type === "champion" && ["planned", "active"].includes(mm.status),
        ),
      );
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

  const generate = useCallback(async (period?: string, subjectId?: number) => {
    setGenerating(true);
    setError(null);
    setCreated(null);
    try {
      const fresh = await generateCouncil(period, subjectId);
      setReport(fresh);
      setHistory((prev) => [
        {
          id: fresh.id,
          period: fresh.period,
          // La portée VOYAGE jusque dans l'historique : sans elle, un rapport ciblé et un rapport
          // global se liraient pareil dans la liste, à la même période.
          subject_id: fresh.subject_id,
          subject_name: fresh.subject_name,
          subjects_count: fresh.subjects.length,
          created_at: fresh.created_at,
          // ⚠️ La version VOYAGE elle aussi. Sans elle, l'entrée optimiste retomberait sur `""`,
          // que le client traite comme « antérieur au daté » : un rapport qu'on vient de générer
          // porterait la marque « rédigé sans historique daté ». `tsc` l'a attrapé.
          prompt_version: fresh.prompt_version,
        },
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

  // Défi champion croisé : même geste que « Créer ces missions » (équipe chaque notion, barres par
  // notion) puis COMPOSE une mission champion unique au lieu du fan-out mono-notion (ADR-0022 §8).
  const equipAndCreateChampion = useCallback(
    async (skillIds: number[], skillNames: string[]) => {
      setError(null);
      setCreated(null);
      setEquipResults([]);
      const results: EquipNotionResult[] = [];
      try {
        for (let i = 0; i < skillIds.length; i++) {
          setEquipping({
            name: skillNames[i] ?? `notion ${skillIds[i]}`,
            index: i + 1,
            total: skillIds.length,
          });
          results.push(await equipNotion(skillIds[i]));
        }
        setEquipResults(results);
        await composeChampionFromReco(skillIds); // compose seul (notions déjà équipées)
        setCreated({ count: 1, skillNames });
        setGeneratedSkillIds((prev) => new Set([...prev, ...skillIds]));
        setHasActiveChampion(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Équipement / création du défi impossible");
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
    championSuggestion: deriveChampionSuggestion(report),
    hasActiveChampion,
    generate,
    openReport,
    equipAndCreateMissions,
    equipAndCreateChampion,
    dismissCreated: () => setCreated(null),
  };
}
