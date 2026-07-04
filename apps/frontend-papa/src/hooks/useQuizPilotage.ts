import { useCallback, useEffect, useState } from "react";
import {
  type ManualQuestionCreate,
  type PapaQuizDetail,
  type QuestionPatch,
  type QuizGenerateRequest,
  type QuizPilotageOverview,
  type QuizPilotageTree,
} from "@zetis/types";
import {
  addManualQuestion,
  deleteQuiz,
  fetchOverview,
  fetchQuizDetail,
  fetchSubjectTree,
  generateQuiz,
  patchQuestion,
  regenerateQuiz,
  retireQuestion,
} from "../lib/quizPilotage";

// Toute la logique de la page « Quiz — pilotage » vit ici (les composants restent
// présentationnels). Chargement paresseux : overview léger au montage → arbre d'une matière au
// dépliage → détail d'un quiz (avec clés) à l'ouverture de la modale d'inspection.

export interface UseQuizPilotage {
  overview: QuizPilotageOverview | null;
  loading: boolean;
  error: string | null;
  expanded: Set<number>;
  trees: Record<number, QuizPilotageTree>;
  treeLoading: Set<number>;
  /** Leçons dont une génération est en cours (barre de progression estimée). */
  generating: Set<number>;
  busyQuiz: Set<number>;
  /** Détail du quiz inspecté (avec clés) ou null si la modale est fermée. */
  inspected: PapaQuizDetail | null;
  inspectLoading: boolean;
  reload: () => void;
  toggleSubject: (subjectId: number) => void;
  generate: (subjectId: number, lessonId: number, body: QuizGenerateRequest) => Promise<void>;
  regenerate: (subjectId: number, quizId: number) => Promise<void>;
  openInspect: (quizId: number) => Promise<void>;
  closeInspect: () => void;
  editQuestion: (questionId: number, body: QuestionPatch) => Promise<void>;
  addQuestion: (quizId: number, body: ManualQuestionCreate) => Promise<void>;
  retire: (questionId: number) => Promise<void>;
  removeQuiz: (subjectId: number, quizId: number) => Promise<void>;
}

const withItem = (set: Set<number>, id: number, on: boolean): Set<number> => {
  const next = new Set(set);
  on ? next.add(id) : next.delete(id);
  return next;
};

export function useQuizPilotage(): UseQuizPilotage {
  const [overview, setOverview] = useState<QuizPilotageOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [trees, setTrees] = useState<Record<number, QuizPilotageTree>>({});
  const [treeLoading, setTreeLoading] = useState<Set<number>>(new Set());
  const [generating, setGenerating] = useState<Set<number>>(new Set());
  const [busyQuiz, setBusyQuiz] = useState<Set<number>>(new Set());
  const [inspected, setInspected] = useState<PapaQuizDetail | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await fetchOverview());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadTree = useCallback(async (subjectId: number) => {
    setTreeLoading((s) => withItem(s, subjectId, true));
    try {
      const tree = await fetchSubjectTree(subjectId);
      setTrees((t) => ({ ...t, [subjectId]: tree }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement de la matière impossible");
    } finally {
      setTreeLoading((s) => withItem(s, subjectId, false));
    }
  }, []);

  const toggleSubject = useCallback(
    (subjectId: number) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(subjectId)) {
          next.delete(subjectId);
        } else {
          next.add(subjectId);
          if (!trees[subjectId]) void loadTree(subjectId);
        }
        return next;
      });
    },
    [trees, loadTree],
  );

  // Après une mutation : re-fetch de la matière touchée + de l'overview (compteurs/santé).
  const refreshSubject = useCallback(
    async (subjectId: number) => {
      await Promise.all([
        loadTree(subjectId),
        fetchOverview()
          .then(setOverview)
          .catch(() => {}),
      ]);
    },
    [loadTree],
  );

  const generate = useCallback(
    async (subjectId: number, lessonId: number, body: QuizGenerateRequest) => {
      setGenerating((s) => withItem(s, lessonId, true));
      setError(null);
      try {
        await generateQuiz(lessonId, body);
        await refreshSubject(subjectId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Génération impossible");
      } finally {
        setGenerating((s) => withItem(s, lessonId, false));
      }
    },
    [refreshSubject],
  );

  const openInspect = useCallback(async (quizId: number) => {
    setInspectLoading(true);
    setError(null);
    try {
      setInspected(await fetchQuizDetail(quizId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Inspection impossible");
    } finally {
      setInspectLoading(false);
    }
  }, []);

  const closeInspect = useCallback(() => setInspected(null), []);

  const runQuiz = useCallback(
    async (subjectId: number, quizId: number, action: () => Promise<unknown>) => {
      setBusyQuiz((s) => withItem(s, quizId, true));
      setError(null);
      try {
        await action();
        await refreshSubject(subjectId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action impossible");
      } finally {
        setBusyQuiz((s) => withItem(s, quizId, false));
      }
    },
    [refreshSubject],
  );

  const regenerate = useCallback(
    async (subjectId: number, quizId: number) => {
      await runQuiz(subjectId, quizId, () => regenerateQuiz(quizId));
      // Modale ouverte sur ce quiz → rafraîchir son détail (questions IA remplacées).
      if (inspected?.quiz_id === quizId) await openInspect(quizId);
    },
    [runQuiz, inspected, openInspect],
  );

  const removeQuiz = useCallback(
    async (subjectId: number, quizId: number) => {
      await runQuiz(subjectId, quizId, () => deleteQuiz(quizId));
      setInspected((cur) => (cur?.quiz_id === quizId ? null : cur));
    },
    [runQuiz],
  );

  const editQuestion = useCallback(
    async (questionId: number, body: QuestionPatch) => {
      setError(null);
      try {
        const updated = await patchQuestion(questionId, body);
        setInspected((cur) =>
          cur
            ? { ...cur, questions: cur.questions.map((q) => (q.id === questionId ? updated : q)) }
            : cur,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Édition impossible");
        throw e; // laisse le composant garder le mode édition ouvert
      }
    },
    [],
  );

  const addQuestion = useCallback(
    async (quizId: number, body: ManualQuestionCreate) => {
      setError(null);
      try {
        const created = await addManualQuestion(quizId, body);
        setInspected((cur) =>
          cur && cur.quiz_id === quizId
            ? { ...cur, questions: [...cur.questions, created] }
            : cur,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ajout impossible");
        throw e;
      }
    },
    [],
  );

  const retire = useCallback(async (questionId: number) => {
    setError(null);
    try {
      const updated = await retireQuestion(questionId);
      setInspected((cur) =>
        cur
          ? { ...cur, questions: cur.questions.map((q) => (q.id === questionId ? updated : q)) }
          : cur,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retrait impossible");
    }
  }, []);

  return {
    overview,
    loading,
    error,
    expanded,
    trees,
    treeLoading,
    generating,
    busyQuiz,
    inspected,
    inspectLoading,
    reload: () => void load(),
    toggleSubject,
    generate,
    regenerate,
    openInspect,
    closeInspect,
    editQuestion,
    addQuestion,
    retire,
    removeQuiz,
  };
}
