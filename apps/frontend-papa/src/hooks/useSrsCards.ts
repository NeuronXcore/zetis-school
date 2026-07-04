import { useCallback, useEffect, useState } from "react";
import {
  type SrsCardContent,
  type SrsCardsOverview,
  type SrsCardUpdate,
  type SrsSubjectTree,
} from "@zetis/types";
import {
  deleteCard,
  deleteSkillCards,
  fetchCardsOverview,
  fetchSkillCards,
  fetchSubjectTree,
  generateSkillCards,
  generateSubjectCards,
  reactivateSkill,
  updateCard,
} from "../lib/srsCards";

// Toute la logique de la page « Cartes de révision » vit ici (les composants restent
// présentationnels). Chargement paresseux systématique : overview léger au montage → arbre
// d'une matière au dépliage → contenu des cartes à la demande de l'aperçu.

/** Libellé du bouton « Générer les N » — visible seulement si des notions sont à générer.
 *  Fonction PURE (testée) : c'est elle qui pilote l'affichage du bouton (patron Programme). */
export function subjectGenerateLabel(toGenerate: number): string | null {
  if (toGenerate <= 0) return null;
  return toGenerate === 1 ? "Générer la notion" : `Générer les ${toGenerate}`;
}

export interface UseSrsCards {
  overview: SrsCardsOverview | null;
  loading: boolean;
  error: string | null;
  expanded: Set<number>;
  trees: Record<number, SrsSubjectTree>;
  treeLoading: Set<number>;
  previews: Record<number, SrsCardContent[]>;
  previewOpen: Set<number>;
  busySubject: Set<number>;
  busySkill: Set<number>;
  reload: () => void;
  toggleSubject: (subjectId: number) => void;
  generateSubject: (subjectId: number) => Promise<void>;
  generateSkill: (subjectId: number, skillId: number) => Promise<void>;
  togglePreview: (skillId: number) => void;
  reactivate: (subjectId: number, skillId: number) => Promise<void>;
  remove: (subjectId: number, skillId: number) => Promise<void>;
  editCard: (skillId: number, cardId: number, body: SrsCardUpdate) => Promise<void>;
  removeCard: (subjectId: number, skillId: number, cardId: number) => Promise<void>;
}

export function useSrsCards(): UseSrsCards {
  const [overview, setOverview] = useState<SrsCardsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [trees, setTrees] = useState<Record<number, SrsSubjectTree>>({});
  const [treeLoading, setTreeLoading] = useState<Set<number>>(new Set());
  const [previews, setPreviews] = useState<Record<number, SrsCardContent[]>>({});
  const [previewOpen, setPreviewOpen] = useState<Set<number>>(new Set());
  const [busySubject, setBusySubject] = useState<Set<number>>(new Set());
  const [busySkill, setBusySkill] = useState<Set<number>>(new Set());

  const withItem = (set: Set<number>, id: number, on: boolean) => {
    const next = new Set(set);
    on ? next.add(id) : next.delete(id);
    return next;
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await fetchCardsOverview());
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

  // Après une mutation : re-fetch de la matière touchée + de l'overview (compteurs).
  const refreshSubject = useCallback(
    async (subjectId: number) => {
      await Promise.all([
        loadTree(subjectId),
        fetchCardsOverview()
          .then(setOverview)
          .catch(() => {}),
      ]);
    },
    [loadTree],
  );

  const runSubject = useCallback(
    async (subjectId: number, action: () => Promise<unknown>) => {
      setBusySubject((s) => withItem(s, subjectId, true));
      setError(null);
      try {
        await action();
        // Ouvre la matière si repliée, pour montrer le résultat.
        setExpanded((prev) => (prev.has(subjectId) ? prev : new Set(prev).add(subjectId)));
        await refreshSubject(subjectId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Génération impossible");
      } finally {
        setBusySubject((s) => withItem(s, subjectId, false));
      }
    },
    [refreshSubject],
  );

  const runSkill = useCallback(
    async (subjectId: number, skillId: number, action: () => Promise<unknown>) => {
      setBusySkill((s) => withItem(s, skillId, true));
      setError(null);
      try {
        await action();
        setPreviews((p) => {
          const next = { ...p };
          delete next[skillId]; // invalide l'aperçu (contenu peut avoir changé)
          return next;
        });
        setPreviewOpen((s) => withItem(s, skillId, false));
        await refreshSubject(subjectId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action impossible");
      } finally {
        setBusySkill((s) => withItem(s, skillId, false));
      }
    },
    [refreshSubject],
  );

  const generateSubject = useCallback(
    (subjectId: number) => runSubject(subjectId, () => generateSubjectCards(subjectId)),
    [runSubject],
  );
  const generateSkill = useCallback(
    (subjectId: number, skillId: number) =>
      runSkill(subjectId, skillId, () => generateSkillCards(skillId)),
    [runSkill],
  );
  const reactivate = useCallback(
    (subjectId: number, skillId: number) =>
      runSkill(subjectId, skillId, () => reactivateSkill(skillId)),
    [runSkill],
  );
  const remove = useCallback(
    (subjectId: number, skillId: number) =>
      runSkill(subjectId, skillId, () => deleteSkillCards(skillId)),
    [runSkill],
  );

  // Édition d'une carte : met à jour l'aperçu en place (planification préservée côté serveur).
  const editCard = useCallback(
    async (skillId: number, cardId: number, body: SrsCardUpdate) => {
      setError(null);
      try {
        const updated = await updateCard(cardId, body);
        setPreviews((p) => ({
          ...p,
          [skillId]: (p[skillId] ?? []).map((c) => (c.id === cardId ? updated : c)),
        }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Édition impossible");
        throw e; // laisse le composant garder le mode édition ouvert
      }
    },
    [],
  );

  // Suppression d'une carte : retire de l'aperçu, referme si vide, puis re-fetch (compteurs/état).
  const removeCard = useCallback(
    async (subjectId: number, skillId: number, cardId: number) => {
      setError(null);
      try {
        await deleteCard(cardId);
        const remaining = (previews[skillId] ?? []).filter((c) => c.id !== cardId);
        setPreviews((p) => ({ ...p, [skillId]: remaining }));
        if (remaining.length === 0) setPreviewOpen((s) => withItem(s, skillId, false));
        await refreshSubject(subjectId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Suppression impossible");
        throw e;
      }
    },
    [previews, refreshSubject],
  );

  const togglePreview = useCallback(
    (skillId: number) => {
      setPreviewOpen((prev) => {
        const next = new Set(prev);
        if (next.has(skillId)) {
          next.delete(skillId);
        } else {
          next.add(skillId);
          if (!previews[skillId]) {
            fetchSkillCards(skillId)
              .then((cards) => setPreviews((p) => ({ ...p, [skillId]: cards })))
              .catch((e) =>
                setError(e instanceof Error ? e.message : "Aperçu indisponible"),
              );
          }
        }
        return next;
      });
    },
    [previews],
  );

  return {
    overview,
    loading,
    error,
    expanded,
    trees,
    treeLoading,
    previews,
    previewOpen,
    busySubject,
    busySkill,
    reload: () => void load(),
    toggleSubject,
    generateSubject,
    generateSkill,
    togglePreview,
    reactivate,
    remove,
    editCard,
    removeCard,
  };
}
