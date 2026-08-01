import { useEffect, useMemo, useRef, useState } from "react";
import type { GalaxyFullGraph, GalaxyTimeline } from "@zetis/types";
import { litCountAt, radialTreeLayout, revealSchedule } from "@zetis/ui/galaxy";

/**
 * La galaxie qui pousse depuis `root` (addendum ADR-0029 §2, réécrit le 2026-07-31).
 *
 * Extrait de `GalaxyReplayModal` le 2026-07-31 au soir, quand l'Accueil est devenu la SECONDE
 * surface à montrer cette construction. Une seule implémentation pour les deux : le rejeu est
 * plein de pièges qu'on ne veut pas retomber en dupliquant.
 *
 * ⚠️ LE PIÈGE PRINCIPAL, et il a déjà coûté une session : le graphe rendu ne doit PAS se
 * recalculer sur l'horloge. `elapsed` avance à chaque image ; s'il sert de dépendance, on
 * réassigne `graphData` 60 fois par seconde — et `three-forcegraph` exécute `stop().alpha(1)` à
 * CHAQUE assignation. Le graphe passe alors sa vie à se réinitialiser et ne s'affiche jamais.
 * D'où `bornCount`, un compte DISCRET qui ne bouge qu'aux naissances.
 */
export interface GalaxyGrowth {
  /** Le graphe à cet instant. Identité STABLE entre deux naissances — c'est l'invariant. */
  shown: { nodes: GalaxyFullGraph["nodes"]; edges: GalaxyFullGraph["edges"] } | null;
  /** Positions imposées, calculées une fois pour le graphe complet. */
  pinned: Map<string, { x: number; y: number; z: number }> | null;
  /** Étoiles allumées — un COMPTE, jamais un pourcentage (ADR-0024 §5). */
  litCount: number;
  /** La construction est terminée. */
  done: boolean;
  /** Relance la construction depuis le début. */
  replay: () => void;
}

export function useGalaxyGrowth(
  graph: GalaxyFullGraph | null,
  timeline: GalaxyTimeline | null,
  { reduced = false, enabled = true } = {},
): GalaxyGrowth {
  /** Instant de la construction, en ms de RANG. `null` tant qu'il n'y a rien à construire. */
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [run, setRun] = useState(0);

  /** Les notions dans l'ordre de leur PREMIÈRE fois — c'est l'ordre de la construction. */
  const orderedSkillIds = useMemo(
    () => (timeline?.skills ?? []).map((s) => `skill-${s.skill_id}`),
    [timeline],
  );

  /** Qui descend de qui : la naissance des ancêtres est DÉRIVÉE, aucun appel réseau de plus. */
  const parentOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const edge of graph?.edges ?? []) {
      if (!map.has(edge.target)) map.set(edge.target, edge.source);
    }
    return map;
  }, [graph]);

  const schedule = useMemo(
    () => revealSchedule(orderedSkillIds, parentOf),
    [orderedSkillIds, parentOf],
  );

  /** L'arbre radial du graphe COMPLET, calculé une fois. Déterministe : la galaxie de Massimo
   *  se construit de la même façon à chaque visite, sinon ce n'est pas la sienne. */
  const pinned = useMemo(
    () => (graph ? radialTreeLayout(graph.nodes.map((n) => n.id), graph.edges) : null),
    [graph],
  );

  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled || !graph || orderedSkillIds.length === 0) return;
    // `prefers-reduced-motion` → état final d'emblée, aucune construction.
    if (reduced) {
      setElapsed(schedule.total);
      return;
    }
    setElapsed(0);
    const start = performance.now();
    const step = (now: number) => {
      const value = now - start;
      if (value >= schedule.total) {
        setElapsed(schedule.total);
        return;
      }
      setElapsed(value);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, graph, orderedSkillIds, schedule, reduced, run]);

  /** Combien de nœuds sont nés. Change par PALIERS — voir l'avertissement en tête de fichier. */
  const bornCount = useMemo(() => {
    if (elapsed === null) return -1;
    let count = 0;
    for (const born of schedule.at.values()) {
      if (born <= elapsed) count += 1;
    }
    return count;
  }, [elapsed, schedule]);

  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed ?? 0;
  const started = elapsed !== null;

  const shown = useMemo(() => {
    if (!graph) return null;
    if (!started || orderedSkillIds.length === 0) return graph;
    const now = elapsedRef.current;
    const keep = new Set<string>();
    for (const [id, born] of schedule.at) {
      if (born <= now) keep.add(id);
    }
    return {
      nodes: graph.nodes.filter((n) => keep.has(n.id)),
      edges: graph.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
    };
    // `elapsed` volontairement absent : c'est `bornCount` qui décide, et il ne bouge qu'aux
    // paliers. Le relire ici rendrait le graphe instable à chaque image.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, bornCount, started, schedule, orderedSkillIds]);

  const litCount =
    elapsed === null || orderedSkillIds.length === 0
      ? (graph?.nodes.filter((n) => n.kind === "skill").length ?? 0)
      : litCountAt(orderedSkillIds, elapsed);

  return {
    shown,
    pinned,
    litCount,
    done: elapsed === null || elapsed >= schedule.total,
    replay: () => setRun((r) => r + 1),
  };
}
