// Célébration « mini-victoire » partagée (Massimo + Papa) : petit surgissement joyeux + carillon
// doux quand une capsule est créée / apparaît. Discret, non bloquant, respecte prefers-reduced-motion.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { playCelebrationChime } from "../lib/sound";

export interface CelebrateOptions {
  title?: string;
  subtitle?: string;
}

type CelebrateFn = (opts?: CelebrateOptions) => void;

const CelebrationContext = createContext<CelebrateFn>(() => {});

/** Hook : renvoie `celebrate({ title, subtitle })` à appeler sur un moment de réussite. */
export function useCelebrate(): CelebrateFn {
  return useContext(CelebrationContext);
}

const HOLD_MS = 1900; // durée totale de l'animation (in → hold → out), calée sur le keyframe zx-show

/** À placer autour de l'app (dans main.tsx), après les routeurs. Rend l'overlay au besoin. */
export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<(CelebrateOptions & { nonce: number }) | null>(null);
  const timer = useRef<number | null>(null);
  const nonceRef = useRef(0);

  const celebrate = useCallback<CelebrateFn>((opts) => {
    playCelebrationChime();
    nonceRef.current += 1;
    setActive({ ...(opts ?? {}), nonce: nonceRef.current });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setActive(null), HOLD_MS);
  }, []);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  return (
    <CelebrationContext.Provider value={celebrate}>
      {children}
      {active && (
        <CelebrationOverlay key={active.nonce} title={active.title} subtitle={active.subtitle} />
      )}
    </CelebrationContext.Provider>
  );
}

const PARTICLES = 10;

function CelebrationOverlay({ title, subtitle }: CelebrateOptions) {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[120] flex items-start justify-center pt-24"
      role="status"
      aria-live="polite"
    >
      <style>{CELEBRATION_CSS}</style>
      <div className="zx-card relative rounded-2xl border border-white/15 bg-white/10 px-6 py-4 backdrop-blur-xl">
        <span className="zx-halo" aria-hidden />
        <div className="relative flex items-center gap-3">
          <span className="zx-star text-2xl" aria-hidden>✨</span>
          <div>
            <div className="bg-gradient-to-r from-indigo-300 via-violet-300 to-fuchsia-300 bg-clip-text text-base font-semibold text-transparent">
              {title ?? "Nouvelle capsule !"}
            </div>
            {subtitle && <div className="max-w-[16rem] truncate text-sm text-white/70">{subtitle}</div>}
          </div>
        </div>
        <div className="zx-particles" aria-hidden>
          {Array.from({ length: PARTICLES }).map((_, i) => {
            const angle = (i / PARTICLES) * 2 * Math.PI;
            const r = 66;
            return (
              <span
                key={i}
                className="zx-p"
                style={
                  {
                    "--tx": `${Math.cos(angle) * r}px`,
                    "--ty": `${Math.sin(angle) * r}px`,
                    "--d": `${i * 22}ms`,
                  } as CSSProperties
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

const CELEBRATION_CSS = `
@keyframes zx-show {
  0%   { opacity: 0; transform: translateY(-12px) scale(.85); }
  7%   { opacity: 1; transform: translateY(0)     scale(1.04); }
  13%  { transform: translateY(0) scale(1); }
  84%  { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-8px) scale(.97); }
}
@keyframes zx-halo {
  0%, 100% { opacity: .35; transform: scale(1); }
  50%      { opacity: .8;  transform: scale(1.08); }
}
@keyframes zx-star {
  0% { transform: rotate(-12deg) scale(.6); }
  60% { transform: rotate(8deg) scale(1.25); }
  100% { transform: rotate(0) scale(1); }
}
@keyframes zx-burst {
  0%   { opacity: 0; transform: translate(0,0) scale(.2); }
  15%  { opacity: 1; }
  100% { opacity: 0; transform: translate(var(--tx), var(--ty)) scale(1); }
}
.zx-card { animation: zx-show 1900ms cubic-bezier(.2,.9,.2,1) both;
  box-shadow: 0 10px 40px rgba(99,102,241,.45), 0 0 0 1px rgba(255,255,255,.06) inset; }
.zx-halo { position: absolute; inset: -2px; border-radius: 1rem; z-index: -1;
  background: radial-gradient(60% 60% at 50% 50%, rgba(139,92,246,.55), rgba(34,211,238,.25) 60%, transparent 75%);
  filter: blur(10px); animation: zx-halo 1200ms ease-in-out 2; }
.zx-star { display: inline-block; animation: zx-star 700ms ease-out both; }
.zx-particles { position: absolute; inset: 0; overflow: visible; }
.zx-p { position: absolute; left: 50%; top: 50%; width: 7px; height: 7px; border-radius: 9999px;
  background: linear-gradient(135deg, #a5b4fc, #f0abfc); box-shadow: 0 0 8px rgba(217,180,255,.8);
  animation: zx-burst 900ms ease-out var(--d) both; }
@media (prefers-reduced-motion: reduce) {
  .zx-card { animation: none; opacity: 1; }
  .zx-halo, .zx-star, .zx-p { animation: none; }
  .zx-p { display: none; }
}
`;
