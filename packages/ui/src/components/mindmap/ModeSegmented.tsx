import { Fragment, type CSSProperties } from "react";

// Sélecteur des 3 modes présenté comme un PARCOURS chronologique numéroté et coloré :
// ① Regarde (cyan, découverte) › ② Mémorise (violet, effort) › ③ Reconstruire (or, récompense).
// TOUTE la pastille porte la couleur de l'étape : pleine (dégradé) quand active, teintée quand
// inactive — la chronologie se lit d'un coup d'œil. Un chevron relie les étapes ; au survol de
// « Reconstruire », un popup rappelle qu'on y gagne des XP.
// Les clés de mode restent view/train/build (contrat inchangé) — seuls libellés/présentation changent.

export type MindmapMode = "view" | "train" | "build";

interface ModeDef {
  mode: MindmapMode;
  label: string;
  step: number;
  active: string; // dégradé de la pastille active
  tint: string; // fond + texte teintés quand inactive
  glow: string; // halo coloré (ombre) quand active
  reward?: string;
}

const MODES: ModeDef[] = [
  {
    mode: "view",
    label: "Regarde",
    step: 1,
    active: "from-cyan-500 to-sky-600",
    tint: "bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20",
    glow: "rgba(34,211,238,.45)",
  },
  {
    mode: "train",
    label: "Mémorise",
    step: 2,
    active: "from-violet-500 to-purple-600",
    tint: "bg-violet-500/10 text-violet-200 hover:bg-violet-500/20",
    glow: "rgba(168,85,247,.45)",
  },
  {
    mode: "build",
    label: "Reconstruire",
    step: 3,
    active: "from-amber-500 to-orange-600",
    tint: "bg-amber-500/10 text-amber-200 hover:bg-amber-500/20",
    glow: "rgba(245,158,11,.5)",
    reward: "🏆 Gagne des XP",
  },
];

export function ModeSegmented({
  value,
  onChange,
}: {
  value: MindmapMode;
  onChange: (mode: MindmapMode) => void;
}) {
  return (
    // ⚠️ `flex-wrap`, JAMAIS de défilement horizontal ni de menu déroulant — même règle que la
    // barre d'onglets de la page matière (addendum ADR-0024 §3 bis). Sans lui, mesuré le
    // 2026-08-12 : à 390 px de viewport, le bouton « ③ Reconstruire » avait son bord droit à
    // 435 px — 45 px coupés, et la page ne défilant pas horizontalement, on ne pouvait pas aller
    // chercher ce qui manquait. C'est le mode que l'écran sert le plus qui disparaissait.
    <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
      {MODES.map((m, i) => {
        const active = value === m.mode;
        return (
          <Fragment key={m.mode}>
            {i > 0 && (
              <span aria-hidden className="px-0.5 text-sm text-slate-600">
                ›
              </span>
            )}
            <button
              type="button"
              onClick={() => onChange(m.mode)}
              aria-pressed={active}
              style={active ? ({ boxShadow: `0 4px 16px ${m.glow}` } as CSSProperties) : undefined}
              className={`group relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                active ? `bg-gradient-to-br ${m.active} text-white` : m.tint
              }`}
            >
              <span
                aria-hidden
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold ring-1 ring-white/30 transition ${
                  active ? "scale-105 bg-white/20 text-white" : "bg-white/5"
                }`}
              >
                {m.step}
              </span>
              {m.label}

              {m.reward && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-amber-300/40 bg-slate-900/95 px-2.5 py-1 text-xs font-medium text-amber-200 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
                >
                  {m.reward}
                  {/* petite pointe sous le popup */}
                  <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r border-amber-300/40 bg-slate-900/95" />
                </span>
              )}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
