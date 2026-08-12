import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { type MindmapDetail, type MindmapListItem } from "@zetis/types";
import { MindmapWorkspace, type MindmapMode } from "@zetis/ui/mindmap";
import { FicheSidePanel } from "../components/mindmap/FicheSidePanel";
import { NeonBackdrop } from "../components/glass";
import { SubjectBackLink, prettifySlug } from "../components/SubjectBackLink";
import { subjectIconFor } from "../lib/subjectIcons";
import { subjectEmoji } from "../lib/subjectEmoji";
import {
  fetchMindmap,
  fetchSubjectMindmaps,
  markMindmapSeen,
  submitMindmapAttempt,
} from "../lib/mindmaps";

// Écrans 2 (liste des cartes d'une matière) + 3 (la carte interactive). À l'ouverture d'une carte :
// POST /seen. Aucune logique métier : le serveur ne sert que le validé et évalue la reconstruction.

export function MindmapSubjectPage() {
  const { slug = "", mindmapId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  // Deep-link mission (ADR-0019) : entrée par id → on ouvre la carte directement en Reconstruire.
  const reconstruire = mindmapId != null;

  const [list, setList] = useState<MindmapListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [detail, setDetail] = useState<MindmapDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Mode possédé ici (et non dans MindmapWorkspace) : il pilote le panneau « fiche » — consultable
  // en Regarde/Mémorise, fermé de force en Reconstruire (voir la fiche pendant le test = triche).
  const [mode, setMode] = useState<MindmapMode>(reconstruire ? "build" : "view");
  const [ficheOpen, setFicheOpen] = useState(false);

  // Le slug de matière vient des params (écran liste) ou de la carte résolue (deep-link par id).
  const effSlug = detail?.subject_slug || slug;
  const subjectName = (location.state as { name?: string } | null)?.name ?? prettifySlug(effSlug);

  // Écran liste : chargé seulement hors deep-link (en reconstruire on ouvre directement une carte).
  useEffect(() => {
    if (reconstruire) return;
    let alive = true;
    setError(null);
    fetchSubjectMindmaps(slug)
      .then((data) => alive && setList(data))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Chargement impossible"));
    return () => {
      alive = false;
    };
  }, [slug, reconstruire]);

  // Deep-link : résout la carte par id et l'ouvre en Reconstruire (pas de liste, pas de slug requis).
  useEffect(() => {
    if (mindmapId == null) return;
    let alive = true;
    setError(null);
    setDetail(null);
    setDetailLoading(true);
    setFicheOpen(false);
    Promise.all([fetchMindmap(Number(mindmapId)), markMindmapSeen(Number(mindmapId))])
      .then(([mm]) => alive && setDetail(mm))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Carte indisponible"))
      .finally(() => alive && setDetailLoading(false));
    return () => {
      alive = false;
    };
  }, [mindmapId]);

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

  const iconUrl = subjectIconFor(effSlug);
  const heading = (
    <div className="flex items-center gap-2 text-slate-200">
      {iconUrl ? (
        <img src={iconUrl} alt="" aria-hidden className="h-7 w-7 object-contain" />
      ) : (
        <span aria-hidden>{subjectEmoji(effSlug)}</span>
      )}
      <span className="font-semibold">{subjectName}</span>
    </div>
  );

  // ── Écran 3 : la carte interactive ────────────────────────────────────────
  if (reconstruire || (openIdx !== null && list)) {
    // Le panneau « fiche » n'est ouvert que hors mode Reconstruire (build).
    const showFiche = ficheOpen && mode !== "build";
    return (
      <div className={`relative mx-auto ${showFiche ? "max-w-7xl" : "max-w-5xl"}`}>
        <NeonBackdrop />
        <div className="relative">
          <div className="mb-4 flex items-center justify-between">
            {/* En mission, « ← Retour à ma mission » reste PRIORITAIRE : une action principale
                par écran, et la mission est le fil que Massimo est en train de suivre. Hors
                mission, le retour referme la carte (on reste sur la page). */}
            <button
              type="button"
              onClick={() => (reconstruire ? navigate("/missions") : setOpenIdx(null))}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:border-cyan-400/40"
            >
              {reconstruire ? "← Retour à ma mission" : "← Retour"}
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
                    // Évaluateur ÉLÈVE : persiste la tentative et crédite l'XP (serveur).
                    evaluator={(placements, failed) =>
                      submitMindmapAttempt(detail.id, placements, failed)
                    }
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
          {/* Remontait vers `/mindmaps` (le deck) alors que Massimo arrive de sa MATIÈRE.
              `slug` est passé explicitement : sur le deep-link `/mindmaps/reconstruire/:id`
              l'URL ne porte pas la matière, elle vient de la carte résolue CÔTÉ SERVEUR —
              c'est une donnée, pas un état de navigation. */}
          <SubjectBackLink slug={effSlug} name={subjectName} className="mb-0" />
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
            {/* « mindmap », jamais « carte » (ADR-0052 §5). Cet en-tête ne figurait PAS dans
                l'inventaire de l'ADR — trouvé à la relecture visuelle, le 2026-08-12. */}
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Ouvre une mindmap
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
                  {/* « Mindmap », jamais « Carte mentale » (ADR-0052 §5) — le mot « carte » est
                      pris par la carte de révision (SRS). */}
                  <span className="flex items-center gap-2 text-xs text-slate-400">🧠 Mindmap</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
