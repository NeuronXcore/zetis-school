import { GlassPanel } from "./glass";
import srsImg from "../assets/app/SRS-cards.png";

// Bannière motivante de la page Révision : illustre le concept de RÉVISION ESPACÉE (SRS)
// pour Massimo. Animation = courbe de mémoire qui monte à chaque révision, avec des points
// de révision de plus en plus espacés (1j → 3j → 7j → 14j). Toutes les animations sont en
// `motion-safe:` (respectent prefers-reduced-motion). Aucune donnée réelle de planification
// n'est exposée : c'est une illustration pédagogique, pas l'échéancier des cartes.

// Points de révision espacés (x croissant = intervalles qui s'allongent). Les classes
// d'animation sont écrites EN ENTIER (le scanner Tailwind v4 ne lit pas les templates).
const POINTS = [
  { x: 44, y: 92, label: "1j", cls: "motion-safe:animate-[srs-pulse_2.4s_ease-in-out_0s_infinite]" },
  { x: 116, y: 71, label: "3j", cls: "motion-safe:animate-[srs-pulse_2.4s_ease-in-out_0.4s_infinite]" },
  { x: 202, y: 51, label: "7j", cls: "motion-safe:animate-[srs-pulse_2.4s_ease-in-out_0.8s_infinite]" },
  { x: 302, y: 26, label: "14j", cls: "motion-safe:animate-[srs-pulse_2.4s_ease-in-out_1.2s_infinite]" },
];

function MemoryCurve() {
  return (
    <svg viewBox="0 0 340 128" className="mt-4 h-24 w-full" role="img" aria-label="Ta mémoire se renforce à chaque révision espacée">
      <defs>
        <linearGradient id="srs-line" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="0.55" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#e879f9" />
        </linearGradient>
        <radialGradient id="srs-glow">
          <stop offset="0" stopColor="#a5f3fc" stopOpacity="0.9" />
          <stop offset="1" stopColor="#a5f3fc" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Ligne de base discrète. */}
      <line x1="12" y1="110" x2="330" y2="110" stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" />

      {/* Courbe « mémoire » qui grimpe — tracée en boucle (motion-safe). */}
      <path
        d="M16 102 C 70 98, 92 78, 130 68 S 236 42, 324 20"
        fill="none"
        stroke="url(#srs-line)"
        strokeWidth="3.5"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="1"
        className="motion-safe:animate-[srs-draw_3.4s_ease-in-out_infinite]"
      />

      {/* Points de révision de plus en plus espacés. */}
      {POINTS.map((p) => (
        <g key={p.label}>
          <circle
            cx={p.x}
            cy={p.y}
            r="10"
            fill="url(#srs-glow)"
            className={p.cls}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
          <circle cx={p.x} cy={p.y} r="3.6" fill="#e0f2fe" />
          <text x={p.x} y="124" textAnchor="middle" fill="#64748b" fontSize="10" fontWeight="600">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function SpacedMemoryHero() {
  return (
    <GlassPanel className="relative mb-8 overflow-hidden">
      {/* Halo d'accent discret. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl"
      />
      <div className="relative flex flex-col items-center gap-5 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        {/* Icône SRS : flotte, se retourne comme une carte, avec halo + étincelles (motion-safe). */}
        <div className="relative shrink-0">
          <div
            aria-hidden
            className="absolute inset-1 rounded-2xl bg-cyan-400/25 opacity-25 blur-2xl motion-safe:animate-[srs-halo_6.5s_ease-in-out_infinite]"
          />
          <div className="relative motion-safe:animate-[srs-float_5s_ease-in-out_infinite]">
            <img
              src={srsImg}
              alt="Cartes de révision espacée"
              className="h-28 w-28 rounded-2xl shadow-xl shadow-indigo-950/40 motion-safe:animate-[srs-flip_6.5s_ease-in-out_infinite] sm:h-32 sm:w-32"
            />
          </div>
          <span
            aria-hidden
            className="pointer-events-none absolute -right-1 -top-2 text-base opacity-0 motion-safe:animate-[srs-sparkle_2.8s_ease-in-out_infinite]"
          >
            ✨
          </span>
          <span
            aria-hidden
            className="pointer-events-none absolute -left-2 top-6 text-sm opacity-0 motion-safe:animate-[srs-sparkle_3.4s_ease-in-out_0.7s_infinite]"
          >
            ✨
          </span>
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-1 left-9 text-xs opacity-0 motion-safe:animate-[srs-sparkle_3.1s_ease-in-out_1.4s_infinite]"
          >
            ⭐
          </span>
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            <span className="rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 px-2.5 py-0.5 text-xs font-extrabold tracking-wide text-white shadow-lg shadow-indigo-900/40">
              SRS
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-cyan-200/80">
              Révision espacée
            </span>
          </div>

          <h2 className="mt-2 text-xl font-extrabold text-slate-50">
            Ta mémoire devient un super-pouvoir 🧠
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
            Tu revois chaque carte <span className="font-semibold text-cyan-200">pile au bon moment</span>,
            juste avant de l'oublier. À chaque passage, ton souvenir devient plus solide et
            dure plus longtemps — moins de par-cœur, plus de vrais souvenirs qui restent ✨
          </p>

          <MemoryCurve />
        </div>
      </div>
    </GlassPanel>
  );
}
