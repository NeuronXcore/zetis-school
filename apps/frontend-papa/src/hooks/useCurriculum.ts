import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ActiveSchoolYear,
  type ChapterManualCreateRequest,
  type ChapterPatchRequest,
  type CurriculumChapter,
  type CurriculumLesson,
  type LessonManualCreateRequest,
  type LessonPatchRequest,
} from "@zetis/types";
import { lessonActions } from "../lib/chapterActions";
import {
  createManualChapter,
  createManualLesson,
  deleteChapter,
  deleteLesson,
  fetchActiveSchoolYear,
  fetchChapters,
  fetchLessons,
  generateChapters,
  generateLessonContent,
  generateLessons,
  patchChapter,
  patchLesson,
  rejectLesson,
  reorderChapters,
  reorderLessons,
  validateAllActiveYear,
  validateAllChapters,
  validateLesson,
} from "../lib/curriculum";

// Hook de données de la page Programme (Papa, Slice B — ADR-0009).
// Toute la logique API + état vit ici ; la page reste présentationnelle.

/** Position d'insertion d'un chapitre manuel (formulaire d'ajout inline). */
export type AddPosition =
  | { kind: "end" }
  | { kind: "start" }
  | { kind: "after"; chapterId: number };

/** Leçons d'un chapitre déplié — chargées au premier dépliage, cachées ensuite (Lot 2 Slice B). */
export interface ChapterLessonsState {
  /** Liste COMPLÈTE renvoyée par l'API (`archived` incluses — l'UI filtre à l'affichage,
   *  le reorder backend exige tous les ids). */
  lessons: CurriculumLesson[];
  loading: boolean;
  /** Erreur de chargement ou d'action sur les leçons de CE chapitre — detail backend verbatim. */
  error: string | null;
  /** Passe 2 en cours (requête longue ~10-30 s, panneau maintenu ouvert). */
  generating: boolean;
  /** Rédaction du cours en cours pour CETTE leçon (moteur local, ~40-60 s). */
  contentGeneratingId: number | null;
  /** Erreur de rédaction du cours — verbatim, affichée DANS la modale (pas le panneau). */
  contentError: string | null;
  /** Rédaction en LOT des cours manquants (leçons validées sans cours) : avancement. */
  batch: { done: number; total: number; currentTitle: string } | null;
}

const EMPTY_LESSONS: ChapterLessonsState = {
  lessons: [],
  loading: false,
  error: null,
  generating: false,
  contentGeneratingId: null,
  contentError: null,
  batch: null,
};

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
  /** Validation par lot des `pending` : matière affichée ou année entière.
   *  Renvoie le nombre de chapitres validés, ou null si l'appel a échoué. */
  validateAll: (scope: "subject" | "year") => Promise<number | null>;
  removeChapter: (chapterId: number) => Promise<void>;
  /** Monter/descendre d'un cran : optimiste côté UI, rollback si l'appel échoue. */
  move: (chapterId: number, direction: -1 | 1) => Promise<void>;
  /** Leçons par chapitre — clé absente = jamais chargées (dépliage jamais ouvert). */
  lessonsByChapter: Record<number, ChapterLessonsState>;
  /** Chargement paresseux : fetch au premier appel seulement, no-op si déjà en cache. */
  loadLessons: (chapterId: number) => Promise<void>;
  /** Passe 2 : propose des leçons (chapitre validé ou manuel — 409 backend sinon). */
  generateLessons: (chapterId: number) => Promise<void>;
  addLesson: (chapterId: number, data: LessonManualCreateRequest) => Promise<void>;
  editLesson: (
    chapterId: number,
    lessonId: number,
    data: LessonPatchRequest,
  ) => Promise<void>;
  validateLesson: (chapterId: number, lessonId: number) => Promise<void>;
  rejectLesson: (chapterId: number, lessonId: number) => Promise<void>;
  removeLesson: (chapterId: number, lessonId: number) => Promise<void>;
  /** Monter/descendre parmi les leçons VISIBLES : optimiste, rollback si échec. */
  moveLesson: (chapterId: number, lessonId: number, direction: -1 | 1) => Promise<void>;
  /** Rédige le cours de la leçon (moteur LOCAL, ~40-60 s) puis remplace la leçon
   *  dans le cache avec la réponse — pas de re-fetch global. */
  generateContent: (chapterId: number, lessonId: number) => Promise<void>;
  /** Rédige SÉQUENTIELLEMENT les cours manquants des leçons validées du chapitre
   *  (N × ~40-60 s, moteur local). S'arrête à la première erreur (verbatim). */
  generateMissingContents: (chapterId: number) => Promise<void>;
  /** Annule le lot en cours : la leçon en cours de rédaction se termine, pas la suite. */
  cancelMissingContents: (chapterId: number) => void;
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

  const validateAll = useCallback(
    async (scope: "subject" | "year"): Promise<number | null> => {
      const sysId = selectedSysIdRef.current;
      if (scope === "subject" && sysId === null) return null;
      setActionError(null);
      try {
        const result =
          scope === "subject"
            ? await validateAllChapters(sysId!)
            : await validateAllActiveYear();
        await refresh();
        return result.validated_count;
      } catch (e) {
        setActionError(message(e));
        return null;
      }
    },
    [refresh],
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

  // ---------------------------------------------------------------------------
  // Leçons (Lot 2 Slice B) : cache par chapitre, jamais de fetch global.
  // ---------------------------------------------------------------------------

  const [lessonsByChapter, setLessonsByChapter] = useState<
    Record<number, ChapterLessonsState>
  >({});
  // Chapitres dont les leçons ont été demandées — le cache survit aux re-dépliages
  // et aux changements de matière (les ids de chapitre sont globalement uniques).
  const lessonsLoadedRef = useRef(new Set<number>());

  const patchLessonsState = useCallback(
    (chapterId: number, patch: Partial<ChapterLessonsState>) => {
      setLessonsByChapter((m) => ({
        ...m,
        [chapterId]: { ...EMPTY_LESSONS, ...m[chapterId], ...patch },
      }));
    },
    [],
  );

  // Fetch + invalidation : utilisé au premier dépliage ET après toute mutation du chapitre.
  const fetchLessonsInto = useCallback(
    async (chapterId: number) => {
      lessonsLoadedRef.current.add(chapterId);
      patchLessonsState(chapterId, { loading: true, error: null });
      try {
        const list = await fetchLessons(chapterId);
        patchLessonsState(chapterId, { lessons: list, loading: false });
      } catch (e) {
        // Pas de cache d'erreur : le prochain dépliage retentera.
        lessonsLoadedRef.current.delete(chapterId);
        patchLessonsState(chapterId, { error: message(e), loading: false });
      }
    },
    [patchLessonsState],
  );

  const loadLessons = useCallback(
    async (chapterId: number) => {
      if (lessonsLoadedRef.current.has(chapterId)) return;
      await fetchLessonsInto(chapterId);
    },
    [fetchLessonsInto],
  );

  const generateLessonsFor = useCallback(
    async (chapterId: number) => {
      patchLessonsState(chapterId, { generating: true, error: null });
      try {
        // Requête longue (~10-30 s). La réponse EST la liste complète après génération
        // (contrat router.py) : pas de re-fetch séparé nécessaire.
        const list = await generateLessons(chapterId);
        lessonsLoadedRef.current.add(chapterId);
        patchLessonsState(chapterId, { lessons: list });
      } catch (e) {
        // 409 (chapitre ni validé ni manuel) / 503 / 502 : detail backend verbatim.
        patchLessonsState(chapterId, { error: message(e) });
      } finally {
        patchLessonsState(chapterId, { generating: false });
      }
    },
    [patchLessonsState],
  );

  // Lève en cas d'échec : le formulaire inline affiche l'erreur (patron addChapter).
  const addLesson = useCallback(
    async (chapterId: number, data: LessonManualCreateRequest) => {
      await createManualLesson(chapterId, data);
      await fetchLessonsInto(chapterId);
    },
    [fetchLessonsInto],
  );

  const editLesson = useCallback(
    async (chapterId: number, lessonId: number, data: LessonPatchRequest) => {
      await patchLesson(lessonId, data);
      await fetchLessonsInto(chapterId);
    },
    [fetchLessonsInto],
  );

  const setLessonValidation = useCallback(
    async (chapterId: number, lessonId: number, action: "validate" | "reject") => {
      patchLessonsState(chapterId, { error: null });
      try {
        if (action === "validate") await validateLesson(lessonId);
        else await rejectLesson(lessonId);
        await fetchLessonsInto(chapterId);
      } catch (e) {
        patchLessonsState(chapterId, { error: message(e) });
      }
    },
    [patchLessonsState, fetchLessonsInto],
  );

  const validateLessonFor = useCallback(
    (chapterId: number, lessonId: number) =>
      setLessonValidation(chapterId, lessonId, "validate"),
    [setLessonValidation],
  );
  const rejectLessonFor = useCallback(
    (chapterId: number, lessonId: number) =>
      setLessonValidation(chapterId, lessonId, "reject"),
    [setLessonValidation],
  );

  const removeLesson = useCallback(
    async (chapterId: number, lessonId: number) => {
      patchLessonsState(chapterId, { error: null });
      try {
        await deleteLesson(lessonId);
        await fetchLessonsInto(chapterId);
      } catch (e) {
        patchLessonsState(chapterId, { error: message(e) });
      }
    },
    [patchLessonsState, fetchLessonsInto],
  );

  const moveLesson = useCallback(
    async (chapterId: number, lessonId: number, direction: -1 | 1) => {
      const state = lessonsByChapter[chapterId];
      if (!state) return;
      const all = state.lessons;
      // On échange avec la voisine VISIBLE : les `archived` gardent leur position
      // absolue dans la liste complète (le reorder backend exige tous les ids).
      const visible = all.filter((l) => lessonActions(l.created_by, l.status).visible);
      const vIndex = visible.findIndex((l) => l.id === lessonId);
      const vTarget = vIndex + direction;
      if (vIndex === -1 || vTarget < 0 || vTarget >= visible.length) return;
      const a = all.indexOf(visible[vIndex]);
      const b = all.indexOf(visible[vTarget]);
      const next = [...all];
      [next[a], next[b]] = [next[b], next[a]];
      // Optimiste : la ligne bouge tout de suite ; rollback si l'appel échoue.
      patchLessonsState(chapterId, { lessons: next, error: null });
      try {
        const ordered = await reorderLessons(
          chapterId,
          next.map((l) => l.id),
        );
        patchLessonsState(chapterId, { lessons: ordered });
      } catch (e) {
        patchLessonsState(chapterId, { lessons: all, error: message(e) });
      }
    },
    [lessonsByChapter, patchLessonsState],
  );

  // Rédaction du cours d'une leçon : remplacement ciblé dans le cache (setter
  // fonctionnel — la liste courante n'est pas dans la closure), erreur dans la modale.
  const generateContent = useCallback(
    async (chapterId: number, lessonId: number) => {
      patchLessonsState(chapterId, { contentGeneratingId: lessonId, contentError: null });
      try {
        const updated = await generateLessonContent(lessonId);
        setLessonsByChapter((m) => ({
          ...m,
          [chapterId]: {
            ...EMPTY_LESSONS,
            ...m[chapterId],
            lessons: (m[chapterId]?.lessons ?? []).map((l) =>
              l.id === updated.id ? updated : l,
            ),
          },
        }));
      } catch (e) {
        // 409 (archivée) / 502 (génération échouée) : detail backend verbatim.
        patchLessonsState(chapterId, { contentError: message(e) });
      } finally {
        patchLessonsState(chapterId, { contentGeneratingId: null });
      }
    },
    [patchLessonsState],
  );

  // Rédaction en LOT des cours manquants d'un chapitre : séquentiel (une leçon à la
  // fois, le moteur local n'aime pas le parallèle), annulable entre deux leçons,
  // arrêt à la première erreur (backend local indisponible ⇒ tout échouerait).
  const batchCancelRef = useRef(new Set<number>());

  const generateMissingContents = useCallback(
    async (chapterId: number) => {
      const state = lessonsByChapter[chapterId];
      if (!state || state.batch) return;
      const targets = state.lessons.filter(
        (l) => l.status === "validated" && l.content === null,
      );
      if (targets.length === 0) return;
      batchCancelRef.current.delete(chapterId);
      patchLessonsState(chapterId, {
        batch: { done: 0, total: targets.length, currentTitle: targets[0].title },
        error: null,
      });
      try {
        for (const [i, target] of targets.entries()) {
          if (batchCancelRef.current.has(chapterId)) break;
          patchLessonsState(chapterId, {
            batch: { done: i, total: targets.length, currentTitle: target.title },
          });
          const updated = await generateLessonContent(target.id);
          setLessonsByChapter((m) => ({
            ...m,
            [chapterId]: {
              ...EMPTY_LESSONS,
              ...m[chapterId],
              lessons: (m[chapterId]?.lessons ?? []).map((l) =>
                l.id === updated.id ? updated : l,
              ),
            },
          }));
        }
      } catch (e) {
        patchLessonsState(chapterId, { error: message(e) });
      } finally {
        batchCancelRef.current.delete(chapterId);
        patchLessonsState(chapterId, { batch: null });
      }
    },
    [lessonsByChapter, patchLessonsState],
  );

  const cancelMissingContents = useCallback((chapterId: number) => {
    batchCancelRef.current.add(chapterId);
  }, []);

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
    validateAll,
    removeChapter,
    move,
    lessonsByChapter,
    loadLessons,
    generateLessons: generateLessonsFor,
    addLesson,
    editLesson,
    validateLesson: validateLessonFor,
    rejectLesson: rejectLessonFor,
    removeLesson,
    moveLesson,
    generateContent,
    generateMissingContents,
    cancelMissingContents,
  };
}
