import { useEffect, useState } from "react";
import { type MotivationMessage } from "@zetis/types";
import { type SessionTier } from "../hooks/useReviewSession";
import { NEON_BUTTON } from "./glass";

// Popup de fin de passage (présentation pure) : 3 paliers sur `pct = (good+easy)/total`.
// Jauge animée (jamais de rouge), pilule XP (somme serveur), confettis au palier haut
// purgés après ~4 s. En reduced-motion : jauge et pop instantanés, aucun confetti.

export interface SessionEndPopupProps {
  tier: SessionTier;
  good: number;
  total: number;
  /** `good / total` (0..1). */
  pct: number;
  /** XP cumulée de session (somme des `xp_awarded` serveur). */
  xp: number;
  /** Re-tour proposable (palier bas uniquement, une seule fois). */
  canRedo: boolean;
  /** Nombre de cartes de la file `fragile` (libellé du bouton re-tour). */
  fragileCount: number;
  onRedo: () => void;
  onFinish: () => void;
  reducedMotion: boolean;
  /** Mot de la fin servi par ZETIS. Volontairement ABSENT de la branche « refaire un tour » :
   *  un second appel à l'action y concurrencerait « Refaire un tour », qui est l'intention
   *  principale à ce moment-là. */
  wrapUp?: MotivationMessage | null;
}

// Dégradés par palier — chaleur croissante mais jamais de rouge (vocabulaire enfant).
const GAUGE: Record<SessionTier, string> = {
  high: "linear-gradient(90deg, #6366f1, #22d3ee, #a855f7)",
  mid: "linear-gradient(90deg, #22d3ee, #34d399)",
  low: "linear-gradient(90deg, #fbbf24, #e879f9)",
};

const HEAD: Record<SessionTier, { emoji: string; title: string }> = {
  high: { emoji: "🎉", title: "Incroyable, Massimo !" },
  mid: { emoji: "🌟", title: "Bien joué !" },
  low: { emoji: "💪", title: "C'était costaud aujourd'hui" },
};

// Confetti léger en pur DOM (palette zetis), positions déterministes (pas de Math.random).
const CONFETTI_COLORS = ["#6366f1", "#22d3ee", "#a855f7", "#34d399", "#fbbf24"];
function Confetti() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 24 }).map((_, i) => (
        <span
          key={i}
          className="absolute top-0 h-2 w-2 rounded-[2px]"
          style={{
            left: `${(i * 4.17) % 100}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animation: `zetis-confetti-fall 3.2s ${(i % 6) * 0.18}s ease-in forwards`,
          }}
        />
      ))}
    </div>
  );
}

export function SessionEndPopup({
  tier,
  good,
  total,
  pct,
  xp,
  canRedo,
  fragileCount,
  onRedo,
  onFinish,
  reducedMotion,
  wrapUp = null,
}: SessionEndPopupProps) {
  const target = Math.round(pct * 100);
  const [fill, setFill] = useState(reducedMotion ? target : 0);
  const [confettiOn, setConfettiOn] = useState(tier === "high" && !reducedMotion);
  const head = HEAD[tier];

  // Jauge : animation 0 → pct au montage (instantané en reduced-motion).
  useEffect(() => {
    if (reducedMotion) return;
    const raf = requestAnimationFrame(() => setFill(target));
    return () => cancelAnimationFrame(raf);
  }, [target, reducedMotion]);

  // Confettis purgés après ~4 s (pas de fuite d'éléments animés).
  useEffect(() => {
    if (!confettiOn) return;
    const t = setTimeout(() => setConfettiOn(false), 4000);
    return () => clearTimeout(t);
  }, [confettiOn]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Fin de la révision"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-7 text-center shadow-2xl backdrop-blur-xl">
        {confettiOn && <Confetti />}

        <div className="text-5xl">{head.emoji}</div>
        <h2 className="mt-3 text-xl font-bold text-slate-100">{head.title}</h2>

        {tier === "mid" && (
          <p className="mt-2 text-sm text-slate-300">
            Les autres reviendront bientôt, au bon moment.
          </p>
        )}
        {tier === "low" && (
          <p className="mt-2 text-sm text-slate-300">
            Ces notions sont encore un peu timides — c'est normal, elles sont nouvelles.
          </p>
        )}

        {/* Jauge (jamais de rouge). */}
        <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-out"
            style={{ width: `${fill}%`, background: GAUGE[tier] }}
          />
        </div>
        <p className="mt-2 text-sm text-slate-300">
          {good}/{total} bien ancrées · {target} %
        </p>

        {/* Pilule XP (somme serveur, jamais recalculée côté client). */}
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-sm font-semibold text-amber-100">
          ✨ +{xp} XP
        </div>

        {/* Actions par palier. */}
        <div className="mt-6 flex flex-col items-center gap-3">
          {tier === "low" && canRedo ? (
            <>
              <button type="button" className={NEON_BUTTON} onClick={onRedo}>
                🔄 Refaire un tour ({fragileCount} carte{fragileCount > 1 ? "s" : ""})
              </button>
              <button
                type="button"
                onClick={onFinish}
                className="text-sm text-slate-400 underline-offset-2 hover:underline"
              >
                Plus tard, elles reviendront
              </button>
            </>
          ) : (
            <>
              {tier === "low" && (
                <p className="text-sm text-slate-300">Bel effort ! Elles reviendront très vite.</p>
              )}
              <button type="button" className={NEON_BUTTON} onClick={onFinish}>
                {tier === "high" ? "Continuer" : "Terminer"}
              </button>
              {/* Le mot de la fin, uniquement hors branche « refaire un tour » : là-bas,
                  l'intention principale est de refaire le tour, pas d'aller ailleurs. */}
              {wrapUp && (
                <p className="max-w-sm text-sm text-slate-300">
                  {wrapUp.title}
                  {wrapUp.subtitle && <span className="text-slate-400"> {wrapUp.subtitle}</span>}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
