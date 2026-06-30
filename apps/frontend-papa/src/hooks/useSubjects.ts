import { useCallback, useEffect, useState } from "react";
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

// Hook de données de la page Matières & programmes (Papa).
// Toute la logique API + état vit ici ; la page reste présentationnelle.
export interface SubjectsData {
  loading: boolean;
  error: string | null;
  subjects: Subject[];
  selected: SubjectDetail | null;
  selectedId: number | null;
  selectLoading: boolean;
  select: (subjectId: number | null) => void;
  addSubject: (data: SubjectCreate) => Promise<void>;
  addTheme: (subjectId: number, data: ThemeCreate) => Promise<void>;
  addChapter: (themeId: number, data: ChapterCreate) => Promise<void>;
}

export function useSubjects(): SubjectsData {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selected, setSelected] = useState<SubjectDetail | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
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

  const select = useCallback(
    (subjectId: number | null) => {
      setSelectedId(subjectId);
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
      if (selectedId !== null) {
        await Promise.all([refreshSelected(selectedId), loadSubjects()]);
      }
    },
    [loadSubjects, refreshSelected, selectedId],
  );

  return {
    loading,
    error,
    subjects,
    selected,
    selectedId,
    selectLoading,
    select,
    addSubject,
    addTheme,
    addChapter,
  };
}
