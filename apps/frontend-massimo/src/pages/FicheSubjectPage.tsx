import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { type FicheDetail, type FicheListItem } from "@zetis/types";
import { FicheCard } from "../components/FicheCard";
import { CoursPanel } from "../components/CoursPanel";
import { NeonBackdrop } from "../components/glass";
import { subjectIconFor } from "../lib/subjectIcons";
import { subjectEmoji } from "../lib/subjectEmoji";
import { fetchFiche, fetchSubjectFiches, markFicheSeen } from "../lib/fiches";

// Écrans 2 (liste des fiches d'une matière) + 3 (la fiche, avec feuilletage ‹/›). La liste
// reste en mémoire → le feuilletage est instantané. À l'ouverture d'une fiche : POST /seen
// (retrait du badge « Nouveau »). Aucune logique métier : le serveur ne sert que le validé.

function prettifySlug(slug: string): string {
  const s = slug.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function FicheSubjectPage() {
  const { slug = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const subjectName = (location.state as { name?: string } | null)?.name ?? prettifySlug(slug);

  const [list, setList] = useState<FicheListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [detail, setDetail] = useState<FicheDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Cours source affiché À CÔTÉ de la fiche (colonne droite, même page — pas de superposition).
  const [coursOpen, setCoursOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setError(null);
    fetchSubjectFiches(slug)
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
      try {
        const [fiche] = await Promise.all([fetchFiche(item.id), markFicheSeen(item.id)]);
        setDetail(fiche);
        // Retrait local du badge « Nouveau » (le serveur l'a enregistré).
        setList((cur) => cur?.map((f) => (f.id === item.id ? { ...f, seen: true } : f)) ?? cur);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fiche indisponible");
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

  // ── Écran 3 : la fiche ────────────────────────────────────────────────────
  if (openIdx !== null && list) {
    const total = list.length;
    return (
      <div className={`relative mx-auto ${coursOpen ? "max-w-7xl" : "max-w-3xl"}`}>
        <NeonBackdrop />
        <div className="relative">
          <div className="mb-4 flex items-center justify-between" data-print-hide>
            <button
              type="button"
              onClick={() => {
                setCoursOpen(false);
                setOpenIdx(null);
              }}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:border-cyan-400/40"
            >
              ← Retour
            </button>
            {heading}
          </div>

          <div className="mb-3 flex items-center justify-between" data-print-hide>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Fiche {openIdx + 1} / {total} · {subjectName}
            </span>
            <div className="flex items-center gap-2">
              {/* Ouvre / masque le cours source à droite de la fiche (haut de fiche, à droite). */}
              <button
                type="button"
                onClick={() => setCoursOpen((o) => !o)}
                aria-pressed={coursOpen}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  coursOpen
                    ? "border-cyan-300/60 bg-cyan-500/20 text-cyan-100"
                    : "border-cyan-400/30 bg-cyan-500/10 text-cyan-200 hover:border-cyan-300/60 hover:bg-cyan-500/20"
                }`}
              >
                {coursOpen ? "✕ Masquer le cours" : "📖 Voir le cours"}
              </button>
              <button
                type="button"
                onClick={() => open(openIdx - 1)}
                disabled={openIdx <= 0}
                aria-label="Fiche précédente"
                className="rounded-lg border border-white/10 px-3 py-1.5 text-slate-200 disabled:opacity-30"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => open(openIdx + 1)}
                disabled={openIdx >= total - 1}
                aria-label="Fiche suivante"
                className="rounded-lg border border-white/10 px-3 py-1.5 text-slate-200 disabled:opacity-30"
              >
                ›
              </button>
            </div>
          </div>

          {detailLoading || !detail ? (
            <p className="text-zetis-muted">Chargement de la fiche…</p>
          ) : (
            // Fiche à gauche, cours à droite (même page) — empilé en mobile, côte à côte en lg.
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
              <div className={`min-w-0 ${coursOpen ? "lg:flex-[2]" : "w-full"}`}>
                <FicheCard spec={detail.spec} subjectSlug={detail.subject_slug || slug} />
              </div>
              {coursOpen && (
                <div className="min-w-0 lg:flex-[3]">
                  <CoursPanel
                    key={detail.lesson_id}
                    lessonId={detail.lesson_id}
                    title={detail.title}
                    onClose={() => setCoursOpen(false)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Écran 2 : liste des fiches de la matière ──────────────────────────────
  return (
    <div className="relative mx-auto max-w-3xl">
      <NeonBackdrop />
      <div className="relative">
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate("/fiches")}
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
              Les fiches de cette matière arrivent bientôt.
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Elles apparaîtront ici dès qu'un cours sera prêt.
            </p>
          </div>
        ) : (
          <>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Ouvre une fiche pour réviser
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {list.map((f, i) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => open(i)}
                  className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-white/5 p-4 text-left shadow-lg backdrop-blur-xl transition hover:border-cyan-400/40"
                >
                  {f.chapter && (
                    <span className="text-[11px] font-medium uppercase tracking-wide text-cyan-300">
                      {f.chapter}
                    </span>
                  )}
                  <span className="font-semibold text-slate-100">{f.title}</span>
                  <span className="flex items-center gap-2 text-xs text-slate-400">
                    🗂️ Fiche
                    {!f.seen && (
                      <span className="rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-fuchsia-200">
                        ✨ nouveau
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
