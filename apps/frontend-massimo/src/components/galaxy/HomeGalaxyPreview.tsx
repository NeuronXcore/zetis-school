// Aperçu de la galaxie ENTIÈRE sur l'Accueil (ADR-0024, amendé le 2026-07-28).
//
// ⚠️ Ce bloc revient sur l'ADR-0024 §9, qui excluait un graphe global : décision du user,
// prise en connaissance des deux coûts — la lisibilité d'un graphe qui rassemble toutes les
// matières, et le chargement du moteur 3D sur la page d'atterrissage. Les deux sont bornés :
// canvas en `lazy()` (l'Accueil peint avant Three.js) et repli sur matières + chapitres dès
// que le plafond adaptatif mord.
//
// En grand, la modale porte DEUX niveaux : la galaxie entière, puis la constellation d'une
// matière — sans quitter la page. Massimo descend et remonte sans perdre le fil ; il ne part
// vers la page Progression que s'il choisit d'agir sur une notion.
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import type {
  GalaxyConstellation,
  GalaxyFullGraph,
  GalaxyNode,
  GalaxyNotion,
  GalaxyStatus,
  GalaxySubject,
  GalaxyTimeline,
} from "@zetis/types";
import { hasWebGL, maxNodesFor, searchMatches, statusCounts } from "@zetis/ui/galaxy";
import { GalaxyLegend } from "@zetis/ui/galaxy";
import {
  fetchConstellation,
  fetchFullGraph,
  fetchGalaxyOverview,
  fetchGalaxyTimeline,
  fetchNotionPanel,
} from "../../lib/galaxy";
import { CloseFullscreenButton } from "./CloseFullscreenButton";
import { GalaxySearch } from "./GalaxySearch";
import { NotionActionPanel } from "./NotionActionPanel";
import { ProgressSparkline } from "./ProgressSparkline";
import { SubjectKpiRow } from "./SubjectKpiRow";

const GalaxyCanvas = lazy(() =>
  import("@zetis/ui/galaxy/canvas").then((m) => ({ default: m.GalaxyCanvas })),
);

export function HomeGalaxyPreview() {
  const [graph, setGraph] = useState<GalaxyFullGraph | null>(null);
  const [timeline, setTimeline] = useState<GalaxyTimeline | null>(null);
  const [subjects, setSubjects] = useState<GalaxySubject[]>([]);
  const [webgl] = useState(hasWebGL);
  const [fullscreen, setFullscreen] = useState(false);
  const [query, setQuery] = useState("");
  // Niveau ouvert : `null` = la galaxie entière, sinon la constellation d'une matière.
  const [constellation, setConstellation] = useState<GalaxyConstellation | null>(null);
  const [notion, setNotion] = useState<GalaxyNotion | null>(null);
  // Filtre par état, piloté par les KPI. Sans lui, la légende serait décorative — et c'est
  // exactement ce qu'elle était ici par oubli.
  const [highlightStatus, setHighlightStatus] = useState<GalaxyStatus | null>(null);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window === "undefined" ? 1280 : window.innerWidth,
    h: typeof window === "undefined" ? 900 : window.innerHeight,
  }));

  useEffect(() => {
    let active = true;
    // `allSettled` : une frise en panne ne doit pas emporter le graphe, ni l'inverse.
    Promise.allSettled([fetchFullGraph(), fetchGalaxyTimeline(), fetchGalaxyOverview()]).then(
      ([g, t, o]) => {
        if (!active) return;
        if (g.status === "fulfilled") setGraph(g.value);
        if (t.status === "fulfilled") setTimeline(t.value);
        if (o.status === "fulfilled") setSubjects(o.value.subjects);
      },
    );
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => {
      active = false;
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      // Échap remonte d'un niveau plutôt que de tout fermer : on ne perd pas son chemin.
      if (e.key !== "Escape") return;
      if (notion) setNotion(null);
      else if (constellation) backToGalaxy();
      else setFullscreen(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen, constellation, notion]);

  /** Le graphe réellement affiché : la constellation ouverte, sinon la galaxie entière. */
  const active = constellation ?? graph;

  // Un graphe global rassemble bien plus de nœuds qu'une constellation : le plafond mord
  // beaucoup plus tôt. Au-delà, on replie sur matières + chapitres — la vue reste lisible.
  const shown = useMemo(() => {
    if (!active) return null;
    if (active.nodes.length <= maxNodesFor(viewport.w)) return active;
    const keep = new Set(active.nodes.filter((n) => n.kind !== "skill").map((n) => n.id));
    return {
      nodes: active.nodes.filter((n) => keep.has(n.id)),
      edges: active.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
    };
  }, [active, viewport.w]);

  const matchedIds = useMemo(
    () => (active ? searchMatches(active.nodes, query) : new Set<string>()),
    [active, query],
  );
  const searching = query.trim().length > 0;
  const counts = useMemo(
    () => (constellation ? statusCounts(constellation.nodes) : null),
    [constellation],
  );

  /** Descend d'un niveau : la matière s'ouvre ICI, en grand, sans quitter la page. */
  function openSubject(slug: string | null | undefined) {
    if (!slug) return;
    setQuery("");
    setNotion(null);
    // Un filtre ne survit pas au changement de niveau : il porterait sur des étoiles qui ne
    // sont plus à l'écran.
    setHighlightStatus(null);
    // Une constellation dans la vignette de l'Accueil serait illisible : on passe en grand.
    setFullscreen(true);
    fetchConstellation(slug).then(setConstellation).catch(() => setConstellation(null));
  }

  function backToGalaxy() {
    setConstellation(null);
    setNotion(null);
    setQuery("");
    setHighlightStatus(null);
  }

  function onNodeClick(node: GalaxyNode) {
    // Dans la galaxie entière, tout mène à une matière. Dans une constellation, une étoile
    // ouvre son panneau d'actions ; un amas ou le soleil ne sont pas des destinations.
    if (!constellation) openSubject(node.subject_slug);
    else if (node.skill_id) fetchNotionPanel(node.skill_id).then(setNotion).catch(() => {});
  }

  // Une seule trouvaille → on descend sans attendre de clic : Massimo a déjà dit ce qu'il
  // cherchait en le tapant.
  useEffect(() => {
    if (matchedIds.size !== 1 || !active) return;
    const found = active.nodes.find((n) => n.id === [...matchedIds][0]);
    if (!found) return;
    const timer = window.setTimeout(() => {
      if (!constellation) openSubject(found.subject_slug);
      else if (found.skill_id) fetchNotionPanel(found.skill_id).then(setNotion).catch(() => {});
    }, 700);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedIds, fullscreen, active, constellation]);

  if (!graph || graph.nodes.length === 0) return null;

  const canvas = (height: number) =>
    webgl && shown ? (
      <Suspense fallback={<p className="p-6 text-sm text-zetis-muted">Ta galaxie se dessine…</p>}>
        <GalaxyCanvas
          nodes={shown.nodes}
          edges={shown.edges}
          matchedIds={matchedIds}
          // Une recherche en cours prime sur le filtre par état : deux mises en évidence
          // simultanées seraient illisibles.
          highlightStatus={searching ? null : highlightStatus}
          selectedId={notion ? `skill-${notion.skill_id}` : null}
          onNodeClick={onNodeClick}
          // Dans l'aperçu, le fond agrandit. En grand, il referme le panneau s'il est ouvert.
          onBackgroundClick={
            fullscreen ? () => notion && setNotion(null) : () => setFullscreen(true)
          }
          height={height}
        />
      </Suspense>
    ) : (
      <p className="p-6 text-sm text-zetis-muted">🌱 Ta galaxie t'attend dans Ma Galaxie.</p>
    );

  const notionCount = graph.nodes.filter((n) => n.kind === "skill").length;

  return (
    <>
      <section className="rounded-2xl border border-zetis-border bg-zetis-surface p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="font-bold">🌌 Ma galaxie</h2>
          {timeline && timeline.total > 0 && (
            <p className="text-xs text-zetis-muted">
              {timeline.total} notion{timeline.total > 1 ? "s" : ""} déjà explorée
              {timeline.total > 1 ? "s" : ""}
            </p>
          )}
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            className="ml-auto cursor-pointer rounded-xl border border-zetis-border bg-zetis-surface-2 px-3.5 py-2 text-sm font-bold hover:border-zetis-accent-2"
          >
            Explorer →
          </button>
        </div>

        {/* La recherche est ici aussi, pas seulement en grand : c'est le geste le plus direct
            pour retrouver une notion, et il ne doit pas demander d'ouvrir d'abord. */}
        <div className="mb-3">
          <GalaxySearch
            value={query}
            onChange={setQuery}
            matchCount={searching ? matchedIds.size : null}
          />
        </div>

        <div
          className="overflow-hidden rounded-xl bg-zetis-bg"
          role="img"
          aria-label={`Ta galaxie : ${notionCount} notions réparties dans tes matières`}
        >
          {/* La galaxie occupe la hauteur d'écran disponible plutôt qu'une bande fixe :
              sur une colonne de moitié de page, une vignette laisserait un grand vide. */}
          {canvas(viewport.w < 1024 ? 280 : Math.max(360, viewport.h - 360))}
        </div>

        {/* Entrée directe par matière : viser une sphère au doigt dans une galaxie dense est
            difficile, une puce ne l'est pas. */}
        {subjects.length > 0 && (
          <div className="mt-3">
            <SubjectKpiRow subjects={subjects} onOpen={openSubject} />
          </div>
        )}

        {timeline && timeline.points.length > 1 && (
          <ProgressSparkline timeline={timeline} className="mt-3" />
        )}
      </section>

      {fullscreen && (
        // Plein écran DANS LA PAGE : on couvre la zone de contenu, pas l'application. La
        // sidebar (`w-60`) et le bandeau (`h-24 sm:h-28`) restent visibles — Massimo garde
        // ses repères et peut partir ailleurs sans d'abord refermer.
        <div
          className="fixed bottom-0 left-60 right-0 top-24 z-50 flex flex-col gap-2 bg-zetis-bg p-3 sm:top-28 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={
            constellation
              ? `Constellation ${constellation.subject.name}`
              : "Ma galaxie en plein écran"
          }
        >
          <CloseFullscreenButton onClick={() => setFullscreen(false)} />
          <div className="flex flex-wrap items-center gap-3 pr-14">
            {constellation ? (
              <>
                <button
                  type="button"
                  onClick={backToGalaxy}
                  className="cursor-pointer rounded-xl border border-zetis-border bg-zetis-surface px-3.5 py-2 text-sm font-bold hover:border-zetis-accent-2"
                >
                  ← Ma galaxie
                </button>
                <h2 className="text-lg font-bold">{constellation.subject.name}</h2>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold">🌌 Ma galaxie</h2>
                <span className="text-xs text-zetis-muted">
                  Touche une matière pour entrer dedans
                </span>
              </>
            )}
            <div className="ml-auto w-full sm:w-auto">
              <GalaxySearch
                value={query}
                onChange={setQuery}
                matchCount={searching ? matchedIds.size : null}
              />
            </div>
          </div>

          {/* La colonne du panneau n'est réservée QUE s'il y a un panneau : sinon elle vole
              320px à la galaxie pour ne rien afficher. */}
          <div
            className={
              "grid min-h-0 flex-1 gap-3 " + (notion ? "lg:grid-cols-[1fr_320px]" : "grid-cols-1")
            }
          >
            <div className="min-h-0 overflow-hidden rounded-2xl border border-zetis-border bg-zetis-surface">
              {/* Hauteur disponible = fenêtre − bandeau (112) − chrome de la modale. */}
              {canvas(Math.max(300, viewport.h - (constellation ? 250 : 200)))}
            </div>
            {notion && <NotionActionPanel notion={notion} onClose={() => setNotion(null)} />}
          </div>

          {/* Pied de modale, symétrique : dans une constellation on lit les ÉTATS des
              étoiles ; dans la galaxie entière on choisit une MATIÈRE. Dans les deux cas,
              des comptes — jamais un pourcentage. */}
          <div className="shrink-0">
            {constellation && counts ? (
              <GalaxyLegend
                counts={counts}
                active={highlightStatus}
                onToggle={(status) =>
                  setHighlightStatus((current) => (current === status ? null : status))
                }
              />
            ) : (
              <SubjectKpiRow subjects={subjects} onOpen={openSubject} />
            )}
          </div>
        </div>
      )}
    </>
  );
}
