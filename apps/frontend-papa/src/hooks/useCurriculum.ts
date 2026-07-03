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
import { chapterActions, lessonActions } from "../lib/chapterActions";
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

export type SubjectBatchKind = "lessons" | "contents";

/** Lot au niveau MATIÈRE en cours — null = aucun. UN SEUL lot global à la fois
 *  (verrou croisé avec la passe 1 et toute activité par chapitre). */
export interface SubjectBatchState {
  kind: SubjectBatchKind;
  /** Matière figée au lancement : le lot survit à un changement de matière affichée. */
  sysId: number;
  subjectName: string;
  /** `scan` = fetch FRAIS des leçons pour décider les cibles, `run` = boucle. */
  phase: "scan" | "run";
  done: number;
  /** 0 pendant le scan (cibles inconnues). */
  total: number;
  /** Nom du chapitre (lot leçons) ou titre de la leçon (lot cours). */
  currentLabel: string;
  errors: { label: string; message: string }[];
}

/** Récapitulatif affiché après la fin du lot matière (succès, annulation ou coupe-circuit). */
export interface SubjectBatchReport {
  kind: SubjectBatchKind;
  subjectName: string;
  done: number;
  total: number;
  /** Lot leçons uniquement : chapitres éligibles sautés car ils ont déjà des leçons. */
  skipped: number;
  cancelled: boolean;
  /** Coupe-circuit : 3 échecs consécutifs (moteur local ou clé API indisponible). */
  aborted: boolean;
  errors: { label: string; message: string }[];
}

/** Coupe-circuit commun aux lots (chapitre et matière) : au-delà de N échecs
 *  consécutifs, le moteur (local ou clé API) est considéré indisponible. */
const MAX_CONSECUTIVE_FAILURES = 3;

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
  /** Écriture/édition MANUELLE du cours (PATCH content, provenance 'parent', statut
   *  inchangé) : remplacement ciblé dans le cache. LÈVE en cas d'échec (l'éditeur
   *  garde le brouillon), l'erreur est aussi posée dans `contentError` (modale). */
  saveContent: (chapterId: number, lessonId: number, content: string) => Promise<void>;
  /** Rédige SÉQUENTIELLEMENT les cours manquants des leçons validées du chapitre
   *  (N × ~40-60 s, moteur local). Continue après un échec isolé (résumé dans le
   *  bandeau du panneau), coupe-circuit à 3 échecs consécutifs. */
  generateMissingContents: (chapterId: number) => Promise<void>;
  /** Annule le lot en cours : la leçon en cours de rédaction se termine, pas la suite. */
  cancelMissingContents: (chapterId: number) => void;
  /** Lot matière en cours (leçons ou cours) — null = aucun. */
  subjectBatch: SubjectBatchState | null;
  /** Récapitulatif du dernier lot matière terminé — effacé par `clearSubjectBatchReport`. */
  subjectBatchReport: SubjectBatchReport | null;
  clearSubjectBatchReport: () => void;
  /** Passe 2 en LOT : propose les leçons de tous les chapitres éligibles SANS leçons
   *  de la matière affichée (les chapitres avec leçons sont sautés — jamais écrasés). */
  runSubjectLessonsBatch: () => Promise<void>;
  /** Rédige en LOT les cours manquants (leçons validées sans cours) de toute la matière. */
  runSubjectContentsBatch: () => Promise<void>;
  /** Annule le lot matière : l'élément en cours se termine, pas la suite. */
  cancelSubjectBatch: () => void;
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

  // Écriture/édition manuelle du cours : la réponse du PATCH EST la leçon à jour
  // (contenu scrubé + provenance) → remplacement ciblé, pas de re-fetch (≠ editLesson).
  const saveContent = useCallback(
    async (chapterId: number, lessonId: number, content: string) => {
      patchLessonsState(chapterId, { contentError: null });
      try {
        const updated = await patchLesson(lessonId, { content });
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
        // Affichée dans la modale ET relancée : l'éditeur reste ouvert, brouillon intact.
        patchLessonsState(chapterId, { contentError: message(e) });
        throw e;
      }
    },
    [patchLessonsState],
  );

  // Rédaction en LOT des cours manquants d'un chapitre : séquentiel (une leçon à la
  // fois, le moteur local n'aime pas le parallèle), annulable entre deux leçons.
  // Même politique d'erreur que les lots matière : on continue après un échec isolé
  // (collecté, puis résumé dans le bandeau du panneau), coupe-circuit à
  // MAX_CONSECUTIVE_FAILURES échecs consécutifs (moteur local indisponible
  // ⇒ tout échouerait).
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
      const errors: { label: string; message: string }[] = [];
      let aborted = false;
      let consecutiveFailures = 0;
      try {
        for (const [i, target] of targets.entries()) {
          if (batchCancelRef.current.has(chapterId)) break;
          patchLessonsState(chapterId, {
            batch: { done: i, total: targets.length, currentTitle: target.title },
          });
          try {
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
            consecutiveFailures = 0;
          } catch (e) {
            errors.push({ label: target.title, message: message(e) });
            consecutiveFailures += 1;
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              aborted = true;
              break;
            }
          }
        }
      } finally {
        batchCancelRef.current.delete(chapterId);
        patchLessonsState(chapterId, {
          batch: null,
          ...(errors.length > 0 && {
            error:
              `Rédaction en échec pour ${errors.length} cours : ` +
              errors.map((e) => `« ${e.label} » — ${e.message}`).join(" ; ") +
              (aborted
                ? ` Arrêt après ${MAX_CONSECUTIVE_FAILURES} échecs consécutifs.`
                : ""),
          }),
        });
      }
    },
    [lessonsByChapter, patchLessonsState],
  );

  const cancelMissingContents = useCallback((chapterId: number) => {
    batchCancelRef.current.add(chapterId);
  }, []);

  // ---------------------------------------------------------------------------
  // Lots au niveau MATIÈRE : boucles séquentielles côté client (même pattern que
  // le lot par chapitre — l'onglet doit rester ouvert). Contrairement au lot par
  // chapitre, on continue après un échec isolé (un 409 de course ne doit pas
  // gâcher 15 min de lot) avec un coupe-circuit à 3 échecs consécutifs
  // (moteur local ou clé API indisponible ⇒ tout échouerait).
  // ---------------------------------------------------------------------------

  const [subjectBatch, setSubjectBatch] = useState<SubjectBatchState | null>(null);
  const [subjectBatchReport, setSubjectBatchReport] =
    useState<SubjectBatchReport | null>(null);
  // Annulation globale et unique (≠ batchCancelRef, Set par chapitre) ; les deux
  // lots ne coexistent jamais grâce au verrou ci-dessous.
  const subjectBatchCancelRef = useRef(false);
  // Verrou de réentrance lisible dans la closure (l'état peut être en retard d'un rendu).
  const subjectBatchActiveRef = useRef(false);

  /** Gardes communes aux deux lots — null si un lot ne peut pas démarrer. */
  const beginSubjectBatch = useCallback((): {
    sysId: number;
    subjectName: string;
  } | null => {
    const sysId = selectedSysIdRef.current;
    if (sysId === null || subjectBatchActiveRef.current || generating) return null;
    const chapterActivity = Object.values(lessonsByChapter).some(
      (s) => s.generating || s.batch !== null || s.contentGeneratingId !== null,
    );
    if (chapterActivity) return null;
    subjectBatchActiveRef.current = true;
    subjectBatchCancelRef.current = false;
    setSubjectBatchReport(null);
    const subjectName =
      year?.subjects.find((s) => s.id === sysId)?.subject_name ?? "";
    return { sysId, subjectName };
  }, [generating, lessonsByChapter, year]);

  /** Fetch FRAIS des leçons d'un chapitre + alimentation du cache (un dépliage
   *  pendant le lot devient un no-op et affiche des données à jour). */
  const scanChapterLessons = useCallback(
    async (chapterId: number): Promise<CurriculumLesson[]> => {
      const list = await fetchLessons(chapterId);
      lessonsLoadedRef.current.add(chapterId);
      patchLessonsState(chapterId, { lessons: list, loading: false });
      return list;
    },
    [patchLessonsState],
  );

  const runSubjectLessonsBatch = useCallback(async () => {
    const ctx = beginSubjectBatch();
    if (!ctx) return;
    const { sysId, subjectName } = ctx;
    const base = { kind: "lessons" as const, sysId, subjectName };
    const errors: { label: string; message: string }[] = [];
    let done = 0;
    let skipped = 0;
    let total = 0;
    let cancelled = false;
    let aborted = false;
    setSubjectBatch({
      ...base,
      phase: "scan",
      done: 0,
      total: 0,
      currentLabel: "",
      errors: [],
    });
    try {
      // Scan sur fetch FRAIS obligatoire : generate-lessons REMPLACE les brouillons,
      // décider un skip sur un cache périmé serait destructif.
      const eligible = chapters.filter(
        (c) => chapterActions(c.source, c.validation_status).canProposeLessons,
      );
      const targets: CurriculumChapter[] = [];
      for (const c of eligible) {
        if (subjectBatchCancelRef.current) {
          cancelled = true;
          break;
        }
        const list = await scanChapterLessons(c.id);
        if (list.length > 0) skipped += 1;
        else targets.push(c);
      }
      total = targets.length;
      if (!cancelled) {
        let consecutiveFailures = 0;
        for (const c of targets) {
          if (subjectBatchCancelRef.current) {
            cancelled = true;
            break;
          }
          setSubjectBatch({
            ...base,
            phase: "run",
            done,
            total,
            currentLabel: c.name,
            errors: [...errors],
          });
          patchLessonsState(c.id, { generating: true, error: null });
          try {
            const list = await generateLessons(c.id);
            lessonsLoadedRef.current.add(c.id);
            patchLessonsState(c.id, { lessons: list });
            done += 1;
            consecutiveFailures = 0;
          } catch (e) {
            errors.push({ label: c.name, message: message(e) });
            patchLessonsState(c.id, { error: message(e) });
            consecutiveFailures += 1;
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              aborted = true;
              break;
            }
          } finally {
            patchLessonsState(c.id, { generating: false });
          }
        }
      }
    } catch (e) {
      // Échec du scan : abort — pas de décision de skip sur données incertaines.
      errors.push({ label: "Analyse des chapitres", message: message(e) });
      aborted = true;
    } finally {
      setSubjectBatchReport({
        kind: "lessons",
        subjectName,
        done,
        total,
        skipped,
        cancelled,
        aborted,
        errors,
      });
      setSubjectBatch(null);
      subjectBatchCancelRef.current = false;
      subjectBatchActiveRef.current = false;
    }
  }, [beginSubjectBatch, chapters, patchLessonsState, scanChapterLessons]);

  const runSubjectContentsBatch = useCallback(async () => {
    const ctx = beginSubjectBatch();
    if (!ctx) return;
    const { sysId, subjectName } = ctx;
    const base = { kind: "contents" as const, sysId, subjectName };
    const errors: { label: string; message: string }[] = [];
    let done = 0;
    let total = 0;
    let cancelled = false;
    let aborted = false;
    setSubjectBatch({
      ...base,
      phase: "scan",
      done: 0,
      total: 0,
      currentLabel: "",
      errors: [],
    });
    try {
      // Des leçons validées existent indépendamment du statut du chapitre : scan complet.
      const targets: { chapterId: number; lesson: CurriculumLesson }[] = [];
      for (const c of chapters) {
        if (subjectBatchCancelRef.current) {
          cancelled = true;
          break;
        }
        const list = await scanChapterLessons(c.id);
        for (const l of list) {
          if (l.status === "validated" && l.content === null) {
            targets.push({ chapterId: c.id, lesson: l });
          }
        }
      }
      total = targets.length;
      if (!cancelled) {
        let consecutiveFailures = 0;
        for (const { chapterId, lesson } of targets) {
          if (subjectBatchCancelRef.current) {
            cancelled = true;
            break;
          }
          setSubjectBatch({
            ...base,
            phase: "run",
            done,
            total,
            currentLabel: lesson.title,
            errors: [...errors],
          });
          patchLessonsState(chapterId, {
            contentGeneratingId: lesson.id,
            contentError: null,
          });
          try {
            const updated = await generateLessonContent(lesson.id);
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
            done += 1;
            consecutiveFailures = 0;
          } catch (e) {
            errors.push({ label: lesson.title, message: message(e) });
            patchLessonsState(chapterId, { contentError: message(e) });
            consecutiveFailures += 1;
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              aborted = true;
              break;
            }
          } finally {
            patchLessonsState(chapterId, { contentGeneratingId: null });
          }
        }
      }
    } catch (e) {
      errors.push({ label: "Analyse des chapitres", message: message(e) });
      aborted = true;
    } finally {
      setSubjectBatchReport({
        kind: "contents",
        subjectName,
        done,
        total,
        skipped: 0,
        cancelled,
        aborted,
        errors,
      });
      setSubjectBatch(null);
      subjectBatchCancelRef.current = false;
      subjectBatchActiveRef.current = false;
    }
  }, [beginSubjectBatch, chapters, patchLessonsState, scanChapterLessons]);

  const cancelSubjectBatch = useCallback(() => {
    subjectBatchCancelRef.current = true;
  }, []);

  const clearSubjectBatchReport = useCallback(() => setSubjectBatchReport(null), []);

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
    saveContent,
    generateMissingContents,
    cancelMissingContents,
    subjectBatch,
    subjectBatchReport,
    clearSubjectBatchReport,
    runSubjectLessonsBatch,
    runSubjectContentsBatch,
    cancelSubjectBatch,
  };
}
