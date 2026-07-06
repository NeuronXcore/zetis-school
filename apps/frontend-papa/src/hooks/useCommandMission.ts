import { useCallback, useEffect, useRef, useState } from "react";
import { type ActiveSchoolYear, type CurriculumChapter } from "@zetis/types";
import { fetchActiveSchoolYear, fetchChapters } from "../lib/curriculum";
import {
  type CommandPreview,
  MISSION_COMMAND_MAX_SKILLS,
  commandConfirm,
  commandPreview,
} from "../lib/missionsPilotage";

// Logique de la modale « Commander une mission » (ADR-0018). Preview/confirm sans état : la
// résolution des notions (fragilité, décochage, composition) est SERVEUR ; ici on n'orchestre
// que scope → preview → (dé)cochage → confirm. Zéro logique métier front.

export type CommandGate = "deadline" | "theme_ref";

export interface UseCommandMission {
  open: boolean;
  gate: CommandGate;
  year: ActiveSchoolYear | null;
  chapters: CurriculumChapter[];
  sysId: number | null; // school_year_subject sélectionné
  chapterId: number | null;
  dueDate: string;
  forcePriority: boolean;
  preview: CommandPreview | null;
  checked: Set<number>;
  loadingChapters: boolean;
  loadingPreview: boolean;
  busy: boolean;
  error: string | null;
  maxSkills: number;
  openModal: () => void;
  closeModal: () => void;
  setGate: (gate: CommandGate) => void;
  selectSubject: (sysId: number) => void;
  selectChapter: (chapterId: number) => void;
  setDueDate: (value: string) => void;
  setForcePriority: (value: boolean) => void;
  toggleNotion: (skillId: number) => void;
  confirm: () => Promise<void>;
}

export function useCommandMission(onCreated: () => void): UseCommandMission {
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  const [open, setOpen] = useState(false);
  const [gate, setGateState] = useState<CommandGate>("theme_ref");
  const [year, setYear] = useState<ActiveSchoolYear | null>(null);
  const [chapters, setChapters] = useState<CurriculumChapter[]>([]);
  const [sysId, setSysId] = useState<number | null>(null);
  const [chapterId, setChapterId] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [forcePriority, setForcePriority] = useState(false);
  const [preview, setPreview] = useState<CommandPreview | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setChapters([]);
    setSysId(null);
    setChapterId(null);
    setDueDate("");
    setPreview(null);
    setChecked(new Set());
    setError(null);
  }, []);

  const openModal = useCallback(() => {
    reset();
    setGateState("theme_ref");
    setForcePriority(false);
    setOpen(true);
    // Année active (matières + mapping school_year_subject) — chargée à l'ouverture seulement.
    fetchActiveSchoolYear()
      .then(setYear)
      .catch(() => setError("Aucune année scolaire active — configurez le programme d'abord."));
  }, [reset]);

  const closeModal = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  // La porte Échéance force la priorité par défaut ; la Thématique la laisse libre (ADR-0018).
  const setGate = useCallback((next: CommandGate) => {
    setGateState(next);
    setForcePriority(next === "deadline");
  }, []);

  const runPreview = useCallback(
    async (gateArg: CommandGate, chapter: number) => {
      setLoadingPreview(true);
      setError(null);
      try {
        const res = await commandPreview(gateArg, chapter);
        setPreview(res);
        setChecked(new Set(res.notions.filter((n) => n.checked).map((n) => n.skill_id)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Résolution impossible");
        setPreview(null);
      } finally {
        setLoadingPreview(false);
      }
    },
    [],
  );

  const selectSubject = useCallback((nextSysId: number) => {
    setSysId(nextSysId);
    setChapterId(null);
    setPreview(null);
    setChecked(new Set());
    setLoadingChapters(true);
    setError(null);
    fetchChapters(nextSysId)
      .then((list) => setChapters(list.filter((c) => c.validation_status === "validated")))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Chargement des chapitres impossible"),
      )
      .finally(() => setLoadingChapters(false));
  }, []);

  const selectChapter = useCallback(
    (nextChapterId: number) => {
      setChapterId(nextChapterId);
      void runPreview(gate, nextChapterId);
    },
    [gate, runPreview],
  );

  const toggleNotion = useCallback((skillId: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) {
        next.delete(skillId);
      } else if (next.size < MISSION_COMMAND_MAX_SKILLS) {
        next.add(skillId);
      }
      return next;
    });
  }, []);

  const confirm = useCallback(async () => {
    if (checked.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      await commandConfirm({
        gate,
        chapter_id: chapterId ?? undefined,
        due_date: gate === "deadline" && dueDate ? dueDate : null,
        skill_ids: [...checked],
        force_priority: forcePriority,
      });
      onCreatedRef.current();
      setOpen(false);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création impossible");
    } finally {
      setBusy(false);
    }
  }, [checked, gate, chapterId, dueDate, forcePriority, reset]);

  // Sécurité : si la modale se ferme, on relâche l'état lourd au démontage.
  useEffect(() => () => reset(), [reset]);

  return {
    open,
    gate,
    year,
    chapters,
    sysId,
    chapterId,
    dueDate,
    forcePriority,
    preview,
    checked,
    loadingChapters,
    loadingPreview,
    busy,
    error,
    maxSkills: MISSION_COMMAND_MAX_SKILLS,
    openModal,
    closeModal,
    setGate,
    selectSubject,
    selectChapter,
    setDueDate,
    setForcePriority,
    toggleNotion,
    confirm,
  };
}
