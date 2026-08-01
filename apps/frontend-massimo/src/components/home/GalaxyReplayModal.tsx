import { Suspense, lazy, useEffect, useState } from "react";
import type { GalaxyFullGraph, GalaxyTimeline } from "@zetis/types";
import { hasWebGL } from "@zetis/ui/galaxy";
import { fetchFullGraph, fetchGalaxyTimelineWithSkills } from "../../lib/galaxy";
import { useGalaxyGrowth } from "../../hooks/useGalaxyGrowth";
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

  // Toute la mécanique de croissance vit dans `useGalaxyGrowth`, partagée avec la carte
  // d'Accueil depuis le 2026-07-31 au soir. Elle est pleine de pièges — le principal étant de
  // ne PAS recalculer le graphe sur l'horloge — et on ne veut pas y retomber en la dupliquant.
  const { shown, pinned, litCount, done, replay } = useGalaxyGrowth(graph, timeline, { reduced });

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
              onClick={replay}
              disabled={!done || reduced || !timeline?.skills?.length}
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
