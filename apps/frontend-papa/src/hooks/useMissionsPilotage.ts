import { useCallback, useEffect, useState } from "react";
import { type Subject, fetchSubjects } from "../lib/subjects";
import {
  type Election,
  type MissionPatch,
  type MissionPilot,
  type PilotSummary,
  type StepOptions,
  type Verdict,
  deleteMission,
  fetchElectionToday,
  fetchPending,
  fetchPilotList,
  fetchPilotSummary,
  fetchRecentVerdicts,
  fetchStepOptions,
  notifyPendingChanged,
  patchMission,
  regenerateMission,
  rejectMission,
  setMissionSteps,
  validateMissions,
} from "../lib/missionsPilotage";

// Toute la logique de la page « Missions — pilotage » vit ici (les composants restent
// présentationnels — décision ADR-0017 : zéro logique métier front). L'élection est recalculée
// côté serveur ; le filtrage type/matière passe par le contrat `/pilot?type=&subject=`.

export interface UseMissionsPilotage {
  loading: boolean;
  error: string | null;
  summary: PilotSummary | null;
  pending: MissionPilot[];
  election: Election | null;
  pilot: MissionPilot[];
  pilotLoading: boolean;
  verdicts: Verdict[];
  /** Matières (pour l'emoji par `subject_id` et le filtre par slug). */
  subjects: Subject[];
  typeFilter: string | null;
  subjectFilter: string | null; // slug
  /** Sélection en lot de la file « à valider » (état local éphémère, non persisté). */
  selected: Set<number>;
  busy: boolean;
  setTypeFilter: (type: string | null) => void;
  setSubjectFilter: (slug: string | null) => void;
  toggleSelected: (id: number) => void;
  toggleAll: (on: boolean) => void;
  validateSelected: () => Promise<void>;
  reject: (id: number) => Promise<void>;
  /** Actions cycle de vie (Papa). `busyMission` = ids en cours de mutation. */
  busyMission: Set<number>;
  remove: (id: number) => Promise<void>;
  regenerate: (id: number) => Promise<void>;
  patch: (id: number, body: MissionPatch) => Promise<void>;
  saveSteps: (id: number, stepTypes: string[]) => Promise<void>;
  loadStepOptions: (id: number) => Promise<StepOptions>;
  reload: () => void;
}

export function useMissionsPilotage(): UseMissionsPilotage {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<PilotSummary | null>(null);
  const [pending, setPending] = useState<MissionPilot[]>([]);
  const [election, setElection] = useState<Election | null>(null);
  const [pilot, setPilot] = useState<MissionPilot[]>([]);
  const [pilotLoading, setPilotLoading] = useState(false);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [typeFilter, setTypeFilterState] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilterState] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [busyMission, setBusyMission] = useState<Set<number>>(new Set());

  const loadPilot = useCallback(async (type: string | null, subject: string | null) => {
    setPilotLoading(true);
    try {
      setPilot(await fetchPilotList(type ?? undefined, subject ?? undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement du suivi impossible");
    } finally {
      setPilotLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sum, pend, elec, verd, subs] = await Promise.all([
        fetchPilotSummary(),
        fetchPending(),
        fetchElectionToday(),
        fetchRecentVerdicts(),
        fetchSubjects(),
      ]);
      setSummary(sum);
      setPending(pend);
      setElection(elec);
      setVerdicts(verd);
      setSubjects(subs);
      // La sélection en lot ne survit pas à un rechargement (ids potentiellement disparus).
      setSelected(new Set());
      await loadPilot(typeFilter, subjectFilter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
    // Volontairement sans deps de filtre : `reload` recharge tout avec les filtres courants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadPilot]);

  useEffect(() => {
    void load();
  }, [load]);

  const setTypeFilter = useCallback(
    (type: string | null) => {
      setTypeFilterState(type);
      void loadPilot(type, subjectFilter);
    },
    [loadPilot, subjectFilter],
  );

  const setSubjectFilter = useCallback(
    (slug: string | null) => {
      setSubjectFilterState(slug);
      void loadPilot(typeFilter, slug);
    },
    [loadPilot, typeFilter],
  );

  const toggleSelected = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (on: boolean) => setSelected(on ? new Set(pending.map((m) => m.id)) : new Set()),
    [pending],
  );

  // Après une mutation (validate/reject/delete/regenerate/patch/steps) : recharge « à valider »
  // + KPI + élection (les étapes/le pool changent) + suivi, et notifie la sidebar (compteur ambré).
  const refreshAfterMutation = useCallback(async () => {
    const [sum, pend, elec] = await Promise.all([
      fetchPilotSummary(),
      fetchPending(),
      fetchElectionToday(),
    ]);
    setSummary(sum);
    setPending(pend);
    setElection(elec);
    setSelected(new Set());
    notifyPendingChanged();
    await loadPilot(typeFilter, subjectFilter);
  }, [loadPilot, typeFilter, subjectFilter]);

  // Mutation ciblant UNE mission (delete/regenerate/patch/steps) : busy par id + refresh.
  // `rethrow` pour les actions en modale (patch/steps) qui doivent rester ouvertes sur erreur.
  const runMission = useCallback(
    async (id: number, action: () => Promise<unknown>, failMsg: string, rethrow = false) => {
      setBusyMission((s) => new Set(s).add(id));
      setError(null);
      try {
        await action();
        await refreshAfterMutation();
      } catch (e) {
        setError(e instanceof Error ? e.message : failMsg);
        if (rethrow) throw e;
      } finally {
        setBusyMission((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
      }
    },
    [refreshAfterMutation],
  );

  const remove = useCallback(
    (id: number) => runMission(id, () => deleteMission(id), "Suppression impossible"),
    [runMission],
  );
  const regenerate = useCallback(
    (id: number) => runMission(id, () => regenerateMission(id), "Régénération impossible"),
    [runMission],
  );
  const patch = useCallback(
    (id: number, body: MissionPatch) =>
      runMission(id, () => patchMission(id, body), "Édition impossible", true),
    [runMission],
  );
  const saveSteps = useCallback(
    (id: number, stepTypes: string[]) =>
      runMission(id, () => setMissionSteps(id, stepTypes), "Enregistrement impossible", true),
    [runMission],
  );
  const loadStepOptions = useCallback((id: number) => fetchStepOptions(id), []);

  const validateSelected = useCallback(async () => {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      await validateMissions([...selected]);
      await refreshAfterMutation();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation impossible");
    } finally {
      setBusy(false);
    }
  }, [selected, refreshAfterMutation]);

  const reject = useCallback(
    async (id: number) => {
      setBusy(true);
      setError(null);
      try {
        await rejectMission(id);
        await refreshAfterMutation();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Rejet impossible");
      } finally {
        setBusy(false);
      }
    },
    [refreshAfterMutation],
  );

  return {
    loading,
    error,
    summary,
    pending,
    election,
    pilot,
    pilotLoading,
    verdicts,
    subjects,
    typeFilter,
    subjectFilter,
    selected,
    busy,
    setTypeFilter,
    setSubjectFilter,
    toggleSelected,
    toggleAll,
    validateSelected,
    reject,
    busyMission,
    remove,
    regenerate,
    patch,
    saveSteps,
    loadStepOptions,
    reload: () => void load(),
  };
}
