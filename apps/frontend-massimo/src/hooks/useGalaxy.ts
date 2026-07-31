// État de la page « Ma Galaxie » (`/galaxy`) — ZETIS Galaxy (ADR-0024).
//
// Deux écrans (galaxie complète → constellation) + le panneau d'actions d'une notion.
// `Promise.allSettled` et jamais `all` : une source en panne ne doit pas emporter la page —
// Massimo doit toujours voir sa progression, même dégradée.
//
// `fullGraph` et `timeline` sont arrivés ici le 2026-07-31 (addendum ADR-0024 §C) : ils
// alimentaient l'aperçu de l'Accueil, qui a été révoqué. La brique n'a pas été supprimée, elle
// a CHANGÉ D'ADRESSE — c'est son emplacement qui était faux, pas son contenu.
import { useCallback, useEffect, useState } from "react";
import type {
  GalaxyConstellation,
  GalaxyFullGraph,
  GalaxyNotion,
  GalaxySubject,
  GalaxyTimeline,
} from "@zetis/types";
import {
  fetchConstellation,
  fetchFullGraph,
  fetchGalaxyOverview,
  fetchGalaxyTimeline,
  fetchNotionPanel,
} from "../lib/galaxy";
import {
  type GamificationSummary,
  fetchGamificationSummary,
} from "../lib/gamification";
import { fetchWelcome } from "../lib/motivation";

export interface GalaxyState {
  subjects: GalaxySubject[] | null;
  /** La galaxie COMPLÈTE, toutes matières (`root` → matières → chapitres → notions) : c'est la
   *  vue par défaut de `/galaxy` depuis le 2026-07-31 (addendum ADR-0024 §C). */
  fullGraph: GalaxyFullGraph | null;
  /** Frise de progression, MONOTONE par construction — elle ne peut que monter. */
  timeline: GalaxyTimeline | null;
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
  const [fullGraph, setFullGraph] = useState<GalaxyFullGraph | null>(null);
  const [timeline, setTimeline] = useState<GalaxyTimeline | null>(null);
  const [summary, setSummary] = useState<GamificationSummary | null>(null);
  const [consolidated, setConsolidated] = useState<number | null>(null);
  const [constellation, setConstellation] = useState<GalaxyConstellation | null>(null);
  const [notion, setNotion] = useState<GalaxyNotion | null>(null);
  const [loadingConstellation, setLoadingConstellation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      fetchGalaxyOverview(),
      fetchGamificationSummary(),
      fetchWelcome(),
      fetchFullGraph(),
      fetchGalaxyTimeline(),
    ]).then(([overview, gamification, welcome, graph, frise]) => {
      if (!active) return;
      if (overview.status === "fulfilled") setSubjects(overview.value.subjects);
      // Pas d'année active → pas de galaxie, mais ce n'est pas une erreur à afficher :
      // la page montre un état d'attente positif.
      else setSubjects([]);
      if (gamification.status === "fulfilled") setSummary(gamification.value);
      if (welcome.status === "fulfilled")
        setConsolidated(welcome.value.context.consolidated_this_week);
      // Une frise en panne ne doit pas emporter le graphe, ni l'inverse.
      if (graph.status === "fulfilled") setFullGraph(graph.value);
      if (frise.status === "fulfilled") setTimeline(frise.value);
    });
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
    fullGraph,
    timeline,
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
