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
  /** Ouvre la modale déjà scopée sur une échéance d'agenda (porte « échéance »). */
  openFor: (scope: { sysId: number; chapterId: number; dueDate: string }) => void;
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

  /** Charge les chapitres VALIDÉS d'une matière. Extrait de `selectSubject` pour qu'`openFor`
   *  le réutilise **sans** passer par le reset de `chapterId` qu'il fait, lui, à dessein. */
  const loadChapters = useCallback(async (nextSysId: number) => {
    setLoadingChapters(true);
    try {
      const list = await fetchChapters(nextSysId);
      setChapters(list.filter((c) => c.validation_status === "validated"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Chargement des chapitres impossible");
    } finally {
      setLoadingChapters(false);
    }
  }, []);

  const selectSubject = useCallback(
    (nextSysId: number) => {
      setSysId(nextSysId);
      setChapterId(null); // changer de matière invalide le chapitre : il n'y appartient plus
      setPreview(null);
      setChecked(new Set());
      setError(null);
      void loadChapters(nextSysId);
    },
    [loadChapters],
  );

  /** Ouvre la modale DÉJÀ SCOPÉE sur une échéance d'agenda — la porte « échéance » de
   *  l'ADR-0025 §11, restée déclarée et jamais alimentée jusqu'au 2026-08-03.
   *
   *  ⚠️ **Ne compose PAS `setGate` + `selectSubject` + `selectChapter`**, et c'est le piège de ce
   *  hook : `selectSubject` remet `chapterId` à `null` (à raison — changer de matière invalide le
   *  chapitre), et `selectChapter` lit `gate` dans sa FERMETURE, donc il partirait avec la porte
   *  précédente. On pose l'état d'un bloc et on passe la porte explicitement au preview.
   *
   *  `force_priority` est armé : c'est la doctrine de la porte échéance (plancher, jamais
   *  plafond — ADR-0018 §4). Papa peut le retirer, comme il peut décocher des notions. */
  const openFor = useCallback(
    (scope: { sysId: number; chapterId: number; dueDate: string }) => {
      reset();
      setGateState("deadline");
      setForcePriority(true);
      setOpen(true);
      setSysId(scope.sysId);
      setChapterId(scope.chapterId);
      setDueDate(scope.dueDate);
      fetchActiveSchoolYear()
        .then(setYear)
        .catch(() => setError("Aucune année scolaire active — configurez le programme d'abord."));
      void loadChapters(scope.sysId);
      void runPreview("deadline", scope.chapterId);
    },
    [reset, loadChapters, runPreview],
  );

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
    openFor,
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
