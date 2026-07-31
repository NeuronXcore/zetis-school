import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import type { GalaxyFullGraph, GalaxyTimeline } from "@zetis/types";
import { hasWebGL, litCountAt, radialTreeLayout, revealSchedule } from "@zetis/ui/galaxy";
import { fetchFullGraph, fetchGalaxyTimelineWithSkills } from "../../lib/galaxy";
import { CloseFullscreenButton } from "../galaxy/CloseFullscreenButton";
import { ProgressSparkline } from "../galaxy/ProgressSparkline";

// « Revoir ma galaxie grandir » — la galaxie se CONSTRUIT depuis `root` (ADR-0029 et son
// addendum « Construction depuis root », §2 réécrit le 2026-07-31).
//
// ⚠️ CE FICHIER NE DOIT JAMAIS ÊTRE IMPORTÉ STATIQUEMENT PAR L'ACCUEIL.
//
// Il est monté via `lazy()` depuis `AccueilMassimoPage`, et il charge lui-même le canvas en
// `lazy()`. Ce DOUBLE `lazy()` n'est pas une coquetterie : c'est ce qui fait que le graphe
// d'imports STATIQUES de l'Accueil n'atteint ni cette modale ni Three.js, donc que rien n'est
// téléchargé tant que Massimo n'a pas cliqué. Un import statique d'ici remettrait 1,37 Mo sur la
// page d'atterrissage SANS QU'AUCUN TEST NE LE VOIE — la régression du 2026-07-28 en pire,
// puisqu'elle passerait sous le radar posé exprès pour elle (`accueil.bundle.test.ts`).
//
// Le rejeu ne connaît que DEUX états : pas encore née, et allumée. Il se dérive de
// `learning_events` (append-only) et non de `SkillMastery` (qui régresse) : une étoile allumée
// ne s'éteint jamais en cours de rejeu.
//
// Une CROISSANCE, pas une lecture. Plus de curseur, plus de barre de lecture : les étoiles
// s'allument une par une à cadence fixe, et la frise se trace avec elles. Le temps réel n'est
// PAS à l'échelle — c'est un rang. Une horloge calendaire traverserait les vacances en ne
// montrant rien, ce qui EST l'annonce d'une période vide, interdite par le §4.

const GalaxyCanvas = lazy(() =>
  import("@zetis/ui/galaxy/canvas").then((m) => ({ default: m.GalaxyCanvas })),
);

export interface GalaxyReplayModalProps {
  onClose: () => void;
}

export function GalaxyReplayModal({ onClose }: GalaxyReplayModalProps) {
  const [graph, setGraph] = useState<GalaxyFullGraph | null>(null);
  const [timeline, setTimeline] = useState<GalaxyTimeline | null>(null);
  const [webgl] = useState(hasWebGL);
  // `prefers-reduced-motion` : état final d'emblée, aucune construction, aucune animation
  // continue. Ce n'est pas un réglage de confort (ADR-0024 §6).
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
  );
  /** Instant du rejeu, en ms de RANG. `null` tant qu'il n'y a rien à construire. */
  const [elapsed, setElapsed] = useState<number | null>(null);
  /** Incrémenté par « Revoir » : c'est ce qui relance la construction. */
  const [run, setRun] = useState(0);

  useEffect(() => {
    let active = true;
    // `allSettled` : une frise en panne ne doit pas emporter le graphe, ni l'inverse.
    Promise.allSettled([fetchFullGraph(), fetchGalaxyTimelineWithSkills()]).then(([g, t]) => {
      if (!active) return;
      if (g.status === "fulfilled") setGraph(g.value);
      if (t.status === "fulfilled") setTimeline(t.value);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  /** Les notions dans l'ordre de leur PREMIÈRE fois — c'est l'ordre de la construction. */
  const orderedSkillIds = useMemo(
    () => (timeline?.skills ?? []).map((s) => `skill-${s.skill_id}`),
    [timeline],
  );

  /** Qui descend de qui : sert à DÉRIVER la naissance des ancêtres côté client. Une matière
   *  naît avec sa première notion — aucun appel réseau de plus, `?with_skills=true` suffit. */
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

  // L'horloge de rang. Le §6 de l'addendum REFORMULE l'interdit d'autoplay : il visait
  // l'animation subie sur la page d'atterrissage. Dans une modale que Massimo vient d'ouvrir
  // exprès, le démarrage immédiat EST l'objet du clic.
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!graph || orderedSkillIds.length === 0) return;
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
  }, [graph, orderedSkillIds, schedule, reduced, run]);

  /**
   * Combien de nœuds sont nés. Change par PALIERS — toutes les `STAR_CADENCE`, pas à chaque
   * image.
   *
   * ⚠️ C'EST LA CLÉ DE TOUT LE REJEU, et son absence l'avait cassé net. `elapsed` avance à
   * chaque frame ; si le graphe rendu se recalcule sur `elapsed`, on réassigne `graphData` 60
   * fois par seconde — et `three-forcegraph` fait `stop().alpha(1)` à CHAQUE assignation. Le
   * graphe passait sa vie à se réinitialiser et ne s'affichait jamais. C'est précisément le
   * défaut que l'addendum décrit, réintroduit par la porte de derrière.
   *
   * En dérivant un compte discret, `shown` garde la même identité entre deux naissances, et la
   * lib ne voit un changement de données que quand il y en a vraiment un.
   */
  const bornCount = useMemo(() => {
    if (elapsed === null) return -1;
    let count = 0;
    for (const born of schedule.at.values()) {
      if (born <= elapsed) count += 1;
    }
    return count;
  }, [elapsed, schedule]);

  // `elapsed` au moment du dernier palier — lu sans être une dépendance, pour que `shown` ne se
  // recalcule qu'aux naissances.
  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed ?? 0;
  const started = elapsed !== null;

  /** Le graphe à cet instant : ce qui n'est pas encore né est RETIRÉ, pas éteint. */
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
    // paliers. Le relire ici rendrait le graphe instable à chaque image (voir ci-dessus).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, bornCount, started, schedule, orderedSkillIds]);

  const litCount =
    elapsed === null || orderedSkillIds.length === 0
      ? (graph?.nodes.filter((n) => n.kind === "skill").length ?? 0)
      : litCountAt(orderedSkillIds, elapsed);

  const done = elapsed === null || elapsed >= schedule.total;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col gap-3 bg-zetis-bg p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Ma galaxie, du premier jour à aujourd'hui"
    >
      <CloseFullscreenButton onClick={onClose} />

      <div className="pr-14">
        <h2 className="text-lg font-bold">Ma galaxie, depuis le début</h2>
        <p className="mt-0.5 text-sm text-zetis-muted">
          <span className="font-bold tabular-nums text-zetis-text">{litCount}</span> étoile
          {litCount > 1 ? "s" : ""} allumée{litCount > 1 ? "s" : ""}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-zetis-border bg-zetis-surface">
        {webgl && shown && shown.nodes.length > 0 ? (
          <Suspense
            fallback={<p className="p-6 text-sm text-zetis-muted">Ta galaxie se rassemble…</p>}
          >
            <GalaxyCanvas
              nodes={shown.nodes}
              edges={shown.edges}
              matchedIds={EMPTY}
              highlightStatus={null}
              selectedId={null}
              // Positions IMPOSÉES : chaque étoile naît sur son parent puis rejoint sa place.
              // Le moteur de forces est neutralisé — il réchaufferait à `alpha(1)` à chaque
              // ajout, ce qui est exactement la ré-explosion qu'on corrige.
              pinned={pinned}
              onNodeClick={() => {}}
              onBackgroundClick={() => {}}
              height={Math.max(280, window.innerHeight - 280)}
            />
          </Suspense>
        ) : (
          // Sans WebGL, le rejeu n'a pas lieu : on le dit sans en faire un échec.
          <p className="p-6 text-sm text-zetis-muted">
            🌱 Le rejeu a besoin d'un écran qui sait dessiner en 3D. Ta galaxie t'attend dans
            « Ma Galaxie ».
          </p>
        )}
      </div>

      {/* La frise est TÉMOIN, plus commande (addendum ADR-0029 §3) : elle se trace en
          synchronisation avec les étoiles. Aucun curseur, aucun drag, aucune date. */}
      {timeline && timeline.points.length > 1 && (
        <div className="shrink-0">
          <ProgressSparkline timeline={timeline} lit={litCount} />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setRun((r) => r + 1)}
              disabled={!done || reduced || orderedSkillIds.length === 0}
              className="shrink-0 rounded-xl border border-zetis-border bg-zetis-surface px-4 py-2 text-sm font-bold hover:border-zetis-accent-2 disabled:opacity-40"
            >
              Revoir
            </button>
            {reduced && (
              <p className="text-xs text-zetis-muted">
                Le mouvement est réduit sur ton appareil : voici ta galaxie entière.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY = new Set<string>();
