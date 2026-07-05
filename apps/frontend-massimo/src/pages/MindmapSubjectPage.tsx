import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { type MindmapDetail, type MindmapListItem } from "@zetis/types";
import { MindmapWorkspace } from "../components/mindmap/MindmapWorkspace";
import { type MindmapMode } from "../components/mindmap/ModeSegmented";
import { FicheSidePanel } from "../components/mindmap/FicheSidePanel";
import { NeonBackdrop } from "../components/glass";
import { subjectIconFor } from "../lib/subjectIcons";
import { subjectEmoji } from "../lib/subjectEmoji";
import { fetchMindmap, fetchSubjectMindmaps, markMindmapSeen } from "../lib/mindmaps";

// Écrans 2 (liste des cartes d'une matière) + 3 (la carte interactive). À l'ouverture d'une carte :
// POST /seen. Aucune logique métier : le serveur ne sert que le validé et évalue la reconstruction.

function prettifySlug(slug: string): string {
  const s = slug.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function MindmapSubjectPage() {
  const { slug = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const subjectName = (location.state as { name?: string } | null)?.name ?? prettifySlug(slug);

  const [list, setList] = useState<MindmapListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [detail, setDetail] = useState<MindmapDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Mode possédé ici (et non dans MindmapWorkspace) : il pilote le panneau « fiche » — consultable
  // en Regarde/Mémorise, fermé de force en Reconstruire (voir la fiche pendant le test = triche).
  const [mode, setMode] = useState<MindmapMode>("view");
  const [ficheOpen, setFicheOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setError(null);
    fetchSubjectMindmaps(slug)
      .then((data) => alive && setList(data))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Chargement impossible"));
    return () => {
      alive = false;
    };
  }, [slug]);

  const open = useCallback(
    async (idx: number) => {
      if (!list || idx < 0 || idx >= list.length) return;
      const item = list[idx];
      setOpenIdx(idx);
      setDetail(null);
      setDetailLoading(true);
      setMode("view");
      setFicheOpen(false);
      try {
        const [mm] = await Promise.all([fetchMindmap(item.id), markMindmapSeen(item.id)]);
        setDetail(mm);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Carte indisponible");
        setOpenIdx(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [list],
  );

  const iconUrl = subjectIconFor(slug);
  const heading = (
    <div className="flex items-center gap-2 text-slate-200">
      {iconUrl ? (
        <img src={iconUrl} alt="" aria-hidden className="h-7 w-7 object-contain" />
      ) : (
        <span aria-hidden>{subjectEmoji(slug)}</span>
      )}
      <span className="font-semibold">{subjectName}</span>
    </div>
  );

  // ── Écran 3 : la carte interactive ────────────────────────────────────────
  if (openIdx !== null && list) {
    // Le panneau « fiche » n'est ouvert que hors mode Reconstruire (build).
    const showFiche = ficheOpen && mode !== "build";
    return (
      <div className={`relative mx-auto ${showFiche ? "max-w-7xl" : "max-w-5xl"}`}>
        <NeonBackdrop />
        <div className="relative">
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setOpenIdx(null)}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:border-cyan-400/40"
            >
              ← Retour
            </button>
            {heading}
          </div>

          {detailLoading || !detail ? (
            <p className="text-zetis-muted">Chargement de la carte…</p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-lg font-bold text-slate-100">{detail.title}</span>
                  {detail.chapter && (
                    <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-cyan-300">
                      {detail.chapter}
                    </span>
                  )}
                </div>
                {/* En Reconstruire, on masque le bouton : consulter la fiche fausserait le test. */}
                {mode !== "build" && (
                  <button
                    type="button"
                    onClick={() => setFicheOpen((o) => !o)}
                    aria-pressed={showFiche}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      showFiche
                        ? "border-cyan-300/60 bg-cyan-500/20 text-cyan-100"
                        : "border-cyan-400/40 bg-cyan-500/15 text-cyan-100 hover:border-cyan-300/70 hover:bg-cyan-500/25 motion-safe:animate-[mm-fiche-cta_2.2s_ease-in-out_infinite]"
                    }`}
                  >
                    {showFiche ? "✕ Masquer la fiche" : "🗂️ Voir la fiche"}
                  </button>
                )}
              </div>

              {/* Fiche à GAUCHE, carte à droite (même page) — empilé en mobile, côte à côte en lg. */}
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                {showFiche && (
                  <div className="min-w-0 lg:flex-[2]">
                    <FicheSidePanel
                      key={detail.lesson_id}
                      subjectSlug={detail.subject_slug || slug}
                      lessonId={detail.lesson_id}
                      title={detail.title}
                      onClose={() => setFicheOpen(false)}
                    />
                  </div>
                )}
                <div className="min-w-0 lg:flex-[3]">
                  <MindmapWorkspace
                    mm={detail.mindmap_json}
                    mindmapId={detail.id}
                    mode={mode}
                    onModeChange={(m) => {
                      setMode(m);
                      if (m === "build") setFicheOpen(false);
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Écran 2 : liste des cartes de la matière ──────────────────────────────
  return (
    <div className="relative mx-auto max-w-3xl">
      <NeonBackdrop />
      <div className="relative">
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate("/mindmaps")}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:border-cyan-400/40"
          >
            ← Mes decks
          </button>
          {heading}
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200">{error}</p>
        )}

        {list === null ? (
          <p className="text-zetis-muted">Chargement…</p>
        ) : list.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur-xl">
            <p className="text-2xl">🌱</p>
            <p className="mt-2 text-lg font-semibold text-slate-100">
              Les mindmaps de cette matière arrivent bientôt.
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Elles apparaîtront ici dès qu'un cours sera prêt.
            </p>
          </div>
        ) : (
          <>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Ouvre une carte
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {list.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => open(i)}
                  className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-white/5 p-4 text-left shadow-lg backdrop-blur-xl transition hover:border-cyan-400/40"
                >
                  {m.chapter && (
                    <span className="text-[11px] font-medium uppercase tracking-wide text-cyan-300">
                      {m.chapter}
                    </span>
                  )}
                  <span className="font-semibold text-slate-100">{m.title}</span>
                  <span className="flex items-center gap-2 text-xs text-slate-400">🧠 Carte mentale</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
