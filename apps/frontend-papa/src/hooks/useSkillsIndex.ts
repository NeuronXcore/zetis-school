import { useCallback, useEffect, useState } from "react";
import type { SkillIndex, SkillTimeline } from "@zetis/types";
import { fetchSkillTimeline, fetchSkillsIndex } from "../lib/activity";

// L'index des notions (adr-0040 §11) — patron maison à trois couches, comme `useProgression`.
//
// **Un seul appel, au montage, et plus rien ensuite.** Filtres, tri, recherche et bascule de vue
// sont CLIENT : ils ne touchent jamais le réseau. C'est ce qui permet aux trois vues de partager
// un filtre matière sans qu'aucune bascule ne coûte une requête.
//
// ⚠️ La frise fait exception, et une seule : elle est **paresseuse, par notion**, chargée au
// dépliage. Troisième exception assumée au « zéro état de chargement » de l'`adr-0028` §4.

export interface UseSkillsIndex {
  loading: boolean;
  error: string | null;
  index: SkillIndex | null;
  reload: () => void;
  /** Frise d'une notion, mise en cache après le premier dépliage. */
  timelines: Record<number, SkillTimeline | undefined>;
  timelineLoading: number | null;
  loadTimeline: (skillId: number) => void;
}

export function useSkillsIndex(enabled = true): UseSkillsIndex {
  const [index, setIndex] = useState<SkillIndex | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [timelines, setTimelines] = useState<Record<number, SkillTimeline | undefined>>({});
  const [timelineLoading, setTimelineLoading] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setIndex(await fetchSkillsIndex());
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'index des notions n'a pas pu être chargé.");
      // L'index est vidé mais l'erreur reste AVEC son bouton : une vue qui se vide sans rien dire
      // se lit « aucune notion », pas « ça n'a pas chargé ».
      setIndex(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const loadTimeline = useCallback(
    (skillId: number) => {
      // Déjà en cache : une frise est un fait daté, elle ne bouge pas pendant qu'on la regarde.
      if (timelines[skillId] !== undefined) return;
      setTimelineLoading(skillId);
      void fetchSkillTimeline(skillId)
        .then((t) => setTimelines((prev) => ({ ...prev, [skillId]: t })))
        .catch(() => {
          /* l'échec d'une frise ne vide pas l'index : la ligne reste, son détail manque */
        })
        .finally(() => setTimelineLoading(null));
    },
    [timelines],
  );

  return {
    loading,
    error,
    index,
    reload: () => void load(),
    timelines,
    timelineLoading,
    loadTimeline,
  };
}
