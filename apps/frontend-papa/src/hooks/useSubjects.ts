import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ActiveSchoolYear,
  type CurriculumChapter,
  type CurriculumLesson,
} from "@zetis/types";
import {
  type ChapterCreate,
  type Subject,
  type SubjectCreate,
  type SubjectDetail,
  type ThemeCreate,
  createChapter,
  createSubject,
  createTheme,
  fetchSubjectDetail,
  fetchSubjects,
} from "../lib/subjects";
import { fetchActiveSchoolYear, fetchChapters, fetchLessons } from "../lib/curriculum";

// Hook de données de la page Matières (Papa).
// Toute la logique API + état vit ici ; la page reste présentationnelle.
export interface SubjectsData {
  loading: boolean;
  error: string | null;
  subjects: Subject[];
  selected: SubjectDetail | null;
  selectedId: number | null;
  selectLoading: boolean;
  /** Année active (pour le libellé de la section référentiel) — null si aucune. */
  year: ActiveSchoolYear | null;
  /** Chapitres du référentiel (année active) de la matière sélectionnée — les MÊMES
   *  que la page Programme. null = matière hors année active (ou année absente). */
  selectedYearChapters: CurriculumChapter[] | null;
  yearChaptersLoading: boolean;
  /** Leçons par chapitre déplié (liste brute — le composant filtre les validées).
   *  Cache : fetch au premier dépliage seulement. */
  chapterLessons: Record<number, CurriculumLesson[]>;
  chapterLessonsLoadingId: number | null;
  loadChapterLessons: (chapterId: number) => Promise<void>;
  select: (subjectId: number | null) => void;
  addSubject: (data: SubjectCreate) => Promise<void>;
  addTheme: (subjectId: number, data: ThemeCreate) => Promise<void>;
  addChapter: (themeId: number, data: ChapterCreate) => Promise<void>;
}

export function useSubjects(): SubjectsData {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selected, setSelected] = useState<SubjectDetail | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Miroir de selectedId lisible sans recréer addChapter (évite la closure obsolète).
  const selectedIdRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectLoading, setSelectLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSubjects = useCallback(async () => {
    setError(null);
    try {
      setSubjects(await fetchSubjects());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchSubjects()
      .then((list) => active && setSubjects(list))
      .catch((e: unknown) =>
        active && setError(e instanceof Error ? e.message : "Erreur de chargement"),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const refreshSelected = useCallback(async (subjectId: number) => {
    setSelected(await fetchSubjectDetail(subjectId));
  }, []);

  // --- Référentiel de l'année active (mêmes chapitres que la page Programme) ---
  const [year, setYear] = useState<ActiveSchoolYear | null>(null);
  // Cache par subject_id : fetch à la première sélection seulement.
  const [yearChapters, setYearChapters] = useState<Record<number, CurriculumChapter[]>>({});
  const [yearChaptersLoading, setYearChaptersLoading] = useState(false);

  useEffect(() => {
    let active = true;
    fetchActiveSchoolYear()
      .then((y) => active && setYear(y))
      // Pas d'année active : la section référentiel est simplement absente.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (selectedId === null || year === null) return;
    const sys = year.subjects.find((s) => s.subject_id === selectedId);
    if (!sys || yearChapters[selectedId]) return;
    let active = true;
    setYearChaptersLoading(true);
    fetchChapters(sys.id)
      .then((list) => active && setYearChapters((m) => ({ ...m, [selectedId]: list })))
      .catch((e: unknown) =>
        active && setError(e instanceof Error ? e.message : "Erreur de chargement"),
      )
      .finally(() => active && setYearChaptersLoading(false));
    return () => {
      active = false;
    };
  }, [selectedId, year, yearChapters]);

  const selectedYearChapters =
    selectedId !== null && year !== null && year.subjects.some((s) => s.subject_id === selectedId)
      ? (yearChapters[selectedId] ?? [])
      : null;

  // Leçons d'un chapitre du référentiel (consultation lecture seule) : fetch au
  // premier dépliage, cache ensuite — les ids de chapitre sont globalement uniques.
  const [chapterLessons, setChapterLessons] = useState<Record<number, CurriculumLesson[]>>({});
  const [chapterLessonsLoadingId, setChapterLessonsLoadingId] = useState<number | null>(null);
  const lessonsLoadedRef = useRef(new Set<number>());

  const loadChapterLessons = useCallback(async (chapterId: number) => {
    if (lessonsLoadedRef.current.has(chapterId)) return;
    lessonsLoadedRef.current.add(chapterId);
    setChapterLessonsLoadingId(chapterId);
    try {
      const list = await fetchLessons(chapterId);
      setChapterLessons((m) => ({ ...m, [chapterId]: list }));
    } catch (e) {
      // Pas de cache d'erreur : le prochain dépliage retentera.
      lessonsLoadedRef.current.delete(chapterId);
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setChapterLessonsLoadingId((current) => (current === chapterId ? null : current));
    }
  }, []);

  const select = useCallback(
    (subjectId: number | null) => {
      setSelectedId(subjectId);
      selectedIdRef.current = subjectId;
      if (subjectId === null) {
        setSelected(null);
        return;
      }
      setSelectLoading(true);
      setError(null);
      refreshSelected(subjectId)
        .catch((e: unknown) =>
          setError(e instanceof Error ? e.message : "Erreur de chargement"),
        )
        .finally(() => setSelectLoading(false));
    },
    [refreshSelected],
  );

  const addSubject = useCallback(
    async (data: SubjectCreate) => {
      await createSubject(data);
      await loadSubjects();
    },
    [loadSubjects],
  );

  const addTheme = useCallback(
    async (subjectId: number, data: ThemeCreate) => {
      await createTheme(subjectId, data);
      await Promise.all([refreshSelected(subjectId), loadSubjects()]);
    },
    [loadSubjects, refreshSelected],
  );

  const addChapter = useCallback(
    async (themeId: number, data: ChapterCreate) => {
      await createChapter(themeId, data);
      // Lit la matière sélectionnée au moment de la résolution (pas celle capturée).
      const current = selectedIdRef.current;
      if (current !== null) {
        await Promise.all([refreshSelected(current), loadSubjects()]);
      }
    },
    [loadSubjects, refreshSelected],
  );

  return {
    loading,
    error,
    subjects,
    selected,
    selectedId,
    selectLoading,
    year,
    selectedYearChapters,
    yearChaptersLoading,
    chapterLessons,
    chapterLessonsLoadingId,
    loadChapterLessons,
    select,
    addSubject,
    addTheme,
    addChapter,
  };
}
