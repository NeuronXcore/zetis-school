// État de la page Progression / ZETIS Galaxy (ADR-0024).
//
// Deux écrans (vue d'ensemble → constellation) + le panneau d'actions d'une notion.
// `Promise.allSettled` et jamais `all` : une source en panne ne doit pas emporter la page —
// Massimo doit toujours voir sa progression, même dégradée.
import { useCallback, useEffect, useState } from "react";
import type { GalaxyConstellation, GalaxyNotion, GalaxySubject } from "@zetis/types";
import { fetchConstellation, fetchGalaxyOverview, fetchNotionPanel } from "../lib/galaxy";
import {
  type GamificationSummary,
  fetchGamificationSummary,
} from "../lib/gamification";
import { fetchWelcome } from "../lib/motivation";

export interface GalaxyState {
  subjects: GalaxySubject[] | null;
  summary: GamificationSummary | null;
  consolidated: number | null;
  constellation: GalaxyConstellation | null;
  notion: GalaxyNotion | null;
  loadingConstellation: boolean;
  error: string | null;
  openSubject: (slug: string) => void;
  closeSubject: () => void;
  openNotion: (skillId: number) => void;
  closeNotion: () => void;
}

export function useGalaxy(): GalaxyState {
  const [subjects, setSubjects] = useState<GalaxySubject[] | null>(null);
  const [summary, setSummary] = useState<GamificationSummary | null>(null);
  const [consolidated, setConsolidated] = useState<number | null>(null);
  const [constellation, setConstellation] = useState<GalaxyConstellation | null>(null);
  const [notion, setNotion] = useState<GalaxyNotion | null>(null);
  const [loadingConstellation, setLoadingConstellation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([fetchGalaxyOverview(), fetchGamificationSummary(), fetchWelcome()]).then(
      ([overview, gamification, welcome]) => {
        if (!active) return;
        if (overview.status === "fulfilled") setSubjects(overview.value.subjects);
        // Pas d'année active → pas de galaxie, mais ce n'est pas une erreur à afficher :
        // la page montre un état d'attente positif.
        else setSubjects([]);
        if (gamification.status === "fulfilled") setSummary(gamification.value);
        if (welcome.status === "fulfilled")
          setConsolidated(welcome.value.context.consolidated_this_week);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const openSubject = useCallback((slug: string) => {
    setLoadingConstellation(true);
    setError(null);
    setNotion(null);
    fetchConstellation(slug)
      .then(setConstellation)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Cette constellation n'a pas pu s'ouvrir."),
      )
      .finally(() => setLoadingConstellation(false));
  }, []);

  const closeSubject = useCallback(() => {
    setConstellation(null);
    setNotion(null);
    setError(null);
  }, []);

  const openNotion = useCallback((skillId: number) => {
    fetchNotionPanel(skillId)
      .then(setNotion)
      .catch(() => setNotion(null));
  }, []);

  const closeNotion = useCallback(() => setNotion(null), []);

  return {
    subjects,
    summary,
    consolidated,
    constellation,
    notion,
    loadingConstellation,
    error,
    openSubject,
    closeSubject,
    openNotion,
    closeNotion,
  };
}
