import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import type { GalaxyFullGraph, GalaxyTimeline } from "@zetis/types";
import { hasWebGL, maxNodesFor } from "@zetis/ui/galaxy";
import { fetchFullGraph, fetchGalaxyTimelineWithSkills } from "../../lib/galaxy";
import { CloseFullscreenButton } from "../galaxy/CloseFullscreenButton";
import { ProgressSparkline } from "../galaxy/ProgressSparkline";

// « Revoir ma galaxie grandir » — rejeu animé (ADR-0029).
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

const GalaxyCanvas = lazy(() =>
  import("@zetis/ui/galaxy/canvas").then((m) => ({ default: m.GalaxyCanvas })),
);

/** Durée d'un rejeu complet, quelle que soit la longueur de l'histoire. Un rejeu proportionnel
 *  au nombre de jours durerait dix secondes en septembre et deux minutes en juin. */
const REPLAY_MS = 9000;

export interface GalaxyReplayModalProps {
  onClose: () => void;
}

export function GalaxyReplayModal({ onClose }: GalaxyReplayModalProps) {
  const [graph, setGraph] = useState<GalaxyFullGraph | null>(null);
  const [timeline, setTimeline] = useState<GalaxyTimeline | null>(null);
  const [webgl] = useState(hasWebGL);
  // `prefers-reduced-motion` : on n'anime pas, on montre l'état final — et le curseur reste
  // manipulable à la main, pour que le rejeu reste accessible sans mouvement subi.
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
  );
  const [progress, setProgress] = useState(0); // 0 → 1
  const [playing, setPlaying] = useState(false);
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );

  useEffect(() => {
    let active = true;
    // `allSettled` : une frise en panne ne doit pas emporter le graphe, ni l'inverse.
    Promise.allSettled([fetchFullGraph(), fetchGalaxyTimelineWithSkills()]).then(([g, t]) => {
      if (!active) return;
      if (g.status === "fulfilled") setGraph(g.value);
      if (t.status === "fulfilled") setTimeline(t.value);
      // Le rejeu ne démarre JAMAIS tout seul quand le mouvement est refusé : on ouvre alors
      // directement sur la galaxie complète.
      setProgress(1);
      setPlaying(false);
    });
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => {
      active = false;
      window.removeEventListener("resize", onResize);
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

  // Lecture : `requestAnimationFrame` plutôt qu'un `setInterval`, pour que le rejeu suive le
  // rafraîchissement de l'écran et s'arrête quand l'onglet passe en arrière-plan.
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    let start: number | null = null;
    const from = progress >= 1 ? 0 : progress;
    const step = (now: number) => {
      if (start === null) start = now;
      const next = Math.min(1, from + (now - start) / (REPLAY_MS * (1 - from || 1)));
      setProgress(next);
      if (next < 1) rafRef.current = requestAnimationFrame(step);
      else setPlaying(false);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // `progress` volontairement hors des dépendances : le relire relancerait la boucle à chaque
    // image. Il n'est lu qu'au démarrage d'une lecture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  /** Notions allumées à l'instant `progress` du rejeu, dans l'ordre de leur première fois. */
  const litSkillIds = useMemo(() => {
    const skills = timeline?.skills ?? [];
    if (skills.length === 0) return null; // pas de rejeu possible → galaxie complète
    const count = Math.round(progress * skills.length);
    return new Set(skills.slice(0, count).map((s) => `skill-${s.skill_id}`));
  }, [timeline, progress]);

  /** Le graphe au temps `progress` : les étoiles pas encore nées sont RETIRÉES, pas éteintes. */
  const shown = useMemo(() => {
    if (!graph) return null;
    const capped =
      graph.nodes.length <= maxNodesFor(width)
        ? graph
        : {
            nodes: graph.nodes.filter((n) => n.kind !== "skill"),
            edges: graph.edges.filter(
              (e) => !e.source.startsWith("skill-") && !e.target.startsWith("skill-"),
            ),
          };
    if (!litSkillIds) return capped;
    const keep = new Set(
      capped.nodes.filter((n) => n.kind !== "skill" || litSkillIds.has(n.id)).map((n) => n.id),
    );
    return {
      nodes: capped.nodes.filter((n) => keep.has(n.id)),
      edges: capped.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
    };
  }, [graph, litSkillIds, width]);

  const litCount = litSkillIds
    ? litSkillIds.size
    : (graph?.nodes.filter((n) => n.kind === "skill").length ?? 0);

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

      {/* La frise devient la BARRE DE LECTURE (ADR-0029 §3) : plus de redondance avec l'Accueil,
          et la courbe gagne une raison d'être interactive. Aucune date n'est affichée. */}
      {timeline && timeline.points.length > 1 && (
        <div className="shrink-0">
          <ProgressSparkline timeline={timeline} />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              disabled={!litSkillIds}
              className="shrink-0 rounded-xl border border-zetis-border bg-zetis-surface px-4 py-2 text-sm font-bold hover:border-zetis-accent-2 disabled:opacity-40"
            >
              {playing ? "Pause" : progress >= 1 ? "Rejouer" : "Lecture"}
            </button>
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(progress * 1000)}
              onChange={(e) => {
                setPlaying(false);
                setProgress(Number(e.target.value) / 1000);
              }}
              aria-label="Avancer dans le temps"
              className="h-11 w-full accent-zetis-accent-2"
            />
          </div>
          {reduced && (
            <p className="mt-1 text-xs text-zetis-muted">
              Le mouvement est réduit sur ton appareil : tire la barre pour avancer toi-même.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const EMPTY = new Set<string>();
