import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ActiveSchoolYear,
  type ChapterManualCreateRequest,
  type ChapterPatchRequest,
  type CurriculumChapter,
} from "@zetis/types";
import {
  createManualChapter,
  deleteChapter,
  fetchActiveSchoolYear,
  fetchChapters,
  generateChapters,
  patchChapter,
  reorderChapters,
} from "../lib/curriculum";

// Hook de données de la page Programme (Papa, Slice B — ADR-0009).
// Toute la logique API + état vit ici ; la page reste présentationnelle.

/** Position d'insertion d'un chapitre manuel (formulaire d'ajout inline). */
export type AddPosition =
  | { kind: "end" }
  | { kind: "start" }
  | { kind: "after"; chapterId: number };

export interface CurriculumData {
  /** Chargement initial (année active + matières). */
  loading: boolean;
  /** Erreur de chargement de page (année ou chapitres). */
  error: string | null;
  /** Erreur d'action (génération, validation, suppression, reorder) — detail backend verbatim. */
  actionError: string | null;
  year: ActiveSchoolYear | null;
  selectedSysId: number | null;
  chapters: CurriculumChapter[];
  chaptersLoading: boolean;
  generating: boolean;
  select: (sysId: number) => void;
  retry: () => void;
  clearActionError: () => void;
  generate: () => Promise<void>;
  addChapter: (data: ChapterManualCreateRequest, position: AddPosition) => Promise<void>;
  editChapter: (chapterId: number, data: ChapterPatchRequest) => Promise<void>;
  validate: (chapterId: number) => Promise<void>;
  reject: (chapterId: number) => Promise<void>;
  removeChapter: (chapterId: number) => Promise<void>;
  /** Monter/descendre d'un cran : optimiste côté UI, rollback si l'appel échoue. */
  move: (chapterId: number, direction: -1 | 1) => Promise<void>;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : "Erreur inattendue";
}

export function useCurriculum(): CurriculumData {
  const [year, setYear] = useState<ActiveSchoolYear | null>(null);
  const [selectedSysId, setSelectedSysId] = useState<number | null>(null);
  const [chapters, setChapters] = useState<CurriculumChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Miroir de selectedSysId lisible au moment de la résolution des mutations
  // (évite la closure obsolète — même pattern que useSubjects).
  const selectedSysIdRef = useRef<number | null>(null);

  const loadYear = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchActiveSchoolYear();
      setYear(data);
      // Première matière active par défaut ; la sélection existante survit au re-fetch.
      const current = selectedSysIdRef.current;
      if (current === null || !data.subjects.some((s) => s.id === current)) {
        const first = data.subjects.find((s) => s.status === "active") ?? data.subjects[0];
        selectedSysIdRef.current = first ? first.id : null;
        setSelectedSysId(selectedSysIdRef.current);
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadYear();
  }, [loadYear]);

  const loadChapters = useCallback(async (sysId: number) => {
    setChaptersLoading(true);
    setError(null);
    try {
      const list = await fetchChapters(sysId);
      // Ignore les réponses arrivées après un changement de matière.
      if (selectedSysIdRef.current === sysId) setChapters(list);
    } catch (e) {
      if (selectedSysIdRef.current === sysId) setError(message(e));
    } finally {
      if (selectedSysIdRef.current === sysId) setChaptersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSysId !== null) void loadChapters(selectedSysId);
    else setChapters([]);
  }, [selectedSysId, loadChapters]);

  const select = useCallback((sysId: number) => {
    selectedSysIdRef.current = sysId;
    setSelectedSysId(sysId);
    setActionError(null);
  }, []);

  const retry = useCallback(() => {
    if (year === null) void loadYear();
    else if (selectedSysIdRef.current !== null) void loadChapters(selectedSysIdRef.current);
  }, [year, loadYear, loadChapters]);

  const refresh = useCallback(async () => {
    const current = selectedSysIdRef.current;
    if (current !== null) await loadChapters(current);
  }, [loadChapters]);

  const generate = useCallback(async () => {
    const sysId = selectedSysIdRef.current;
    if (sysId === null || generating) return;
    setGenerating(true);
    setActionError(null);
    try {
      // Requête longue (~10-30 s) : la liste reste affichée pendant l'appel.
      await generateChapters(sysId);
      await refresh();
    } catch (e) {
      // 503 (clé absente) / 502 : detail backend verbatim (explique le repli).
      setActionError(message(e));
    } finally {
      setGenerating(false);
    }
  }, [generating, refresh]);

  const addChapter = useCallback(
    async (data: ChapterManualCreateRequest, position: AddPosition) => {
      const sysId = selectedSysIdRef.current;
      if (sysId === null) return;
      // Le backend ajoute toujours en fin de liste : une position différente
      // s'obtient par un reorder complet juste après la création.
      const created = await createManualChapter(sysId, data);
      if (position.kind !== "end") {
        const ids = chapters.map((c) => c.id);
        const insertAt =
          position.kind === "start" ? 0 : ids.indexOf(position.chapterId) + 1;
        ids.splice(insertAt, 0, created.id);
        await reorderChapters(sysId, ids);
      }
      await refresh();
    },
    [chapters, refresh],
  );

  const editChapter = useCallback(
    async (chapterId: number, data: ChapterPatchRequest) => {
      await patchChapter(chapterId, data);
      await refresh();
    },
    [refresh],
  );

  const setValidation = useCallback(
    async (chapterId: number, action: "validate" | "reject") => {
      setActionError(null);
      try {
        await patchChapter(chapterId, { validation_action: action });
        await refresh();
      } catch (e) {
        setActionError(message(e));
      }
    },
    [refresh],
  );

  const validate = useCallback(
    (chapterId: number) => setValidation(chapterId, "validate"),
    [setValidation],
  );
  const reject = useCallback(
    (chapterId: number) => setValidation(chapterId, "reject"),
    [setValidation],
  );

  const removeChapter = useCallback(
    async (chapterId: number) => {
      setActionError(null);
      try {
        await deleteChapter(chapterId);
        await refresh();
      } catch (e) {
        setActionError(message(e));
      }
    },
    [refresh],
  );

  const move = useCallback(
    async (chapterId: number, direction: -1 | 1) => {
      const sysId = selectedSysIdRef.current;
      if (sysId === null) return;
      const index = chapters.findIndex((c) => c.id === chapterId);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= chapters.length) return;
      const previous = chapters;
      const next = [...chapters];
      [next[index], next[target]] = [next[target], next[index]];
      // Optimiste : la ligne bouge tout de suite ; rollback si l'appel échoue.
      setChapters(next);
      setActionError(null);
      try {
        await reorderChapters(
          sysId,
          next.map((c) => c.id),
        );
      } catch (e) {
        setChapters(previous);
        setActionError(message(e));
      }
    },
    [chapters],
  );

  const clearActionError = useCallback(() => setActionError(null), []);

  return {
    loading,
    error,
    actionError,
    year,
    selectedSysId,
    chapters,
    chaptersLoading,
    generating,
    select,
    retry,
    clearActionError,
    generate,
    addChapter,
    editChapter,
    validate,
    reject,
    removeChapter,
    move,
  };
}
