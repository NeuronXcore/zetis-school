import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { type ReviewDeck } from "@zetis/types";
import { FlipCard } from "../components/FlipCard";
import { SessionEndPopup } from "../components/SessionEndPopup";
import { NeonBackdrop } from "../components/glass";
import { subjectIconFor } from "../lib/subjectIcons";
import { useReviewSession } from "../hooks/useReviewSession";

// État du routeur passé par l'écran des decks. Sans lui (accès direct / refresh sur
// /revision/session), on redirige vers /revision — rien n'est perdu, les notes sont
// POSTées au fil de l'eau.
export interface RevisionSessionState {
  deck: ReviewDeck;
  /** Libellé d'en-tête (« Mélange du jour » / nom de matière). */
  label: string;
  /** Slug de matière (deck matière) : icône d'en-tête. */
  subjectSlug?: string;
  /** slug → nom d'affichage (pour l'étiquette de matière de chaque carte de mélange). */
  subjectNames?: Record<string, string>;
}

// Repli d'affichage si le nom d'une matière n'a pas été transmis.
function prettifySlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div aria-hidden className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full ${i < current ? "bg-cyan-400" : "bg-white/15"}`}
        />
      ))}
    </div>
  );
}

export function RevisionSessionPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as RevisionSessionState | null;

  // Toujours appeler les hooks avant tout retour conditionnel (règle des hooks) ;
  // sans deck, le hook ne lance aucune session (l'écran redirige juste après).
  const session = useReviewSession(state?.deck ?? null);

  // Fin de session (ou deck déjà à jour) → retour à l'écran des decks.
  useEffect(() => {
    if (session.status === "done") navigate("/revision");
  }, [session.status, navigate]);

  if (!state?.deck) return <Navigate to="/revision" replace />;

  const { card, status, progress, showRatings, summary, error, reducedMotion } = session;
  const headerIcon = state.subjectSlug ? subjectIconFor(state.subjectSlug) : undefined;

  const cardSubjectName = card
    ? (state.subjectNames?.[card.subject_slug] ?? prettifySlug(card.subject_slug))
    : "";

  return (
    <div className="relative mx-auto max-w-3xl">
      <NeonBackdrop />
      <div className="relative">
        {/* En-tête : Quitter (sans confirmation), deck, points de progression. */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate("/revision")}
            className="text-sm text-zetis-accent-2 hover:underline"
          >
            ← Quitter
          </button>
          <div className="flex items-center gap-2 font-semibold text-slate-100">
            {headerIcon && <img src={headerIcon} alt="" aria-hidden className="h-6 w-6 object-contain" />}
            <span>{state.label}</span>
          </div>
          <ProgressDots current={progress.current} total={progress.total} />
        </div>

        {status === "loading" && <p className="text-zetis-muted">Préparation de tes cartes…</p>}

        {status === "error" && (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center shadow-2xl backdrop-blur-xl">
            <p className="text-sm text-amber-200">{error ?? "Un souci est survenu."}</p>
            <div className="mt-4 flex items-center justify-center gap-3 text-sm">
              <button type="button" onClick={session.reload} className="text-cyan-300 hover:underline">
                Réessayer
              </button>
              <button
                type="button"
                onClick={() => navigate("/revision")}
                className="text-slate-400 hover:underline"
              >
                Retour aux decks
              </button>
            </div>
          </div>
        )}

        {card && (status === "front" || status === "back") && (
          <>
            {error && (
              <p className="mb-4 text-center text-sm text-amber-200">{error}</p>
            )}
            <FlipCard
              subjectName={cardSubjectName}
              subjectIconUrl={subjectIconFor(card.subject_slug)}
              front={card.front_markdown}
              back={card.back_markdown}
              flipped={status === "back"}
              onReveal={session.reveal}
              showRatings={showRatings}
              onRate={session.rate}
              reducedMotion={reducedMotion}
            />
          </>
        )}

        {status === "summary" && summary && (
          <SessionEndPopup
            tier={summary.tier}
            good={summary.good}
            total={summary.total}
            pct={summary.pct}
            xp={summary.xp}
            canRedo={summary.canRedo}
            fragileCount={summary.fragileCount}
            onRedo={session.redo}
            onFinish={session.finish}
            reducedMotion={reducedMotion}
            wrapUp={session.wrapUp}
          />
        )}
      </div>
    </div>
  );
}
