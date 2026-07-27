import { useCallback, useEffect, useRef, useState } from "react";
import { type Subject, fetchSubjects } from "../lib/subjects";
import {
  type ChampionCreateResponse,
  type ChampionFlavor,
  type ChampionPreview,
  MISSION_CHAMPION_MAX_SKILLS,
  championConfirm,
  championPreview,
} from "../lib/missionsPilotage";

// Logique de la modale « Défi champion » (ADR-0022). Preview/confirm sans état, comme le
// Commander : le scope (≥ 2 matières) + la saveur sont donnés ICI, la résolution des notions
// (classement par saveur, décochage, plafond) est SERVEUR. Le confirm équipe chaque notion
// (ADR-0021, opération LLM longue) puis compose UNE mission croisée — d'où la barre estimée.

export interface UseChampionMission {
  open: boolean;
  flavor: ChampionFlavor;
  subjects: Subject[];
  selectedSubjects: Set<number>;
  preview: ChampionPreview | null;
  checked: Set<number>;
  loadingSubjects: boolean;
  loadingPreview: boolean;
  busy: boolean;
  error: string | null;
  result: ChampionCreateResponse | null;
  maxSkills: number;
  openModal: () => void;
  closeModal: () => void;
  setFlavor: (flavor: ChampionFlavor) => void;
  toggleSubject: (subjectId: number) => void;
  toggleNotion: (skillId: number) => void;
  confirm: () => Promise<void>;
}

export function useChampionMission(onCreated: () => void): UseChampionMission {
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  const [open, setOpen] = useState(false);
  const [flavor, setFlavorState] = useState<ChampionFlavor>("mix");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<ChampionPreview | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ChampionCreateResponse | null>(null);

  const reset = useCallback(() => {
    setSelectedSubjects(new Set());
    setPreview(null);
    setChecked(new Set());
    setResult(null);
    setError(null);
  }, []);

  const openModal = useCallback(() => {
    reset();
    setFlavorState("mix");
    setOpen(true);
    setLoadingSubjects(true);
    fetchSubjects()
      .then((list) => setSubjects(list.filter((s) => s.is_active)))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Chargement des matières impossible"),
      )
      .finally(() => setLoadingSubjects(false));
  }, [reset]);

  const closeModal = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  // Résout dès que le scope (≥ 2 matières) et la saveur sont posés — l'ordre proposé dépend des deux.
  const runPreview = useCallback(async (subjectIds: number[], flavorArg: ChampionFlavor) => {
    if (subjectIds.length < 2) {
      setPreview(null);
      setChecked(new Set());
      return;
    }
    setLoadingPreview(true);
    setError(null);
    try {
      const res = await championPreview(subjectIds, flavorArg);
      setPreview(res);
      setChecked(new Set(res.notions.filter((n) => n.checked).map((n) => n.skill_id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Résolution impossible");
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  const setFlavor = useCallback(
    (next: ChampionFlavor) => {
      setFlavorState(next);
      void runPreview([...selectedSubjects], next);
    },
    [runPreview, selectedSubjects],
  );

  const toggleSubject = useCallback(
    (subjectId: number) => {
      setSelectedSubjects((prev) => {
        const next = new Set(prev);
        next.has(subjectId) ? next.delete(subjectId) : next.add(subjectId);
        void runPreview([...next], flavor);
        return next;
      });
    },
    [runPreview, flavor],
  );

  const toggleNotion = useCallback((skillId: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) {
        next.delete(skillId);
      } else if (next.size < MISSION_CHAMPION_MAX_SKILLS) {
        next.add(skillId);
      }
      return next;
    });
  }, []);

  const confirm = useCallback(async () => {
    if (checked.size < 2) return; // ≥ 2 notions ET ≥ 2 matières (le backend revérifie via 422)
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await championConfirm([...checked], flavor);
      setResult(res);
      onCreatedRef.current(); // le nouveau défi rejoint le pool en arrière-plan
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création impossible");
    } finally {
      setBusy(false);
    }
  }, [checked, flavor]);

  useEffect(() => () => reset(), [reset]);

  return {
    open,
    flavor,
    subjects,
    selectedSubjects,
    preview,
    checked,
    loadingSubjects,
    loadingPreview,
    busy,
    error,
    result,
    maxSkills: MISSION_CHAMPION_MAX_SKILLS,
    openModal,
    closeModal,
    setFlavor,
    toggleSubject,
    toggleNotion,
    confirm,
  };
}
