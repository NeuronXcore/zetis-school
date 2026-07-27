import { type ReactNode } from "react";

// Primitives visuelles extraites du LoginScreen (packages/auth) pour garder la même
// « matière » glassmorphique sur les pages Massimo : verre dépoli + halos néon.
// Aucune couleur inventée — uniquement les classes déjà présentes dans le login.

/**
 * Halos lumineux d'arrière-plan (indigo / cyan), issus du login
 * (`bg-…-600/20 blur-[120px]`). Purement décoratif, ne capte pas les clics.
 */
export function NeonBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-indigo-600/20 blur-[120px]" />
      <div className="absolute right-1/4 top-1/3 h-80 w-80 rounded-full bg-cyan-500/15 blur-[120px]" />
    </div>
  );
}

/**
 * Surface en verre dépoli (mêmes tokens que la carte de connexion du login :
 * `rounded-3xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl`).
 */
export function GlassPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}

/** Bouton principal — dégradé exact du login (`from-indigo-500 via-violet-500 to-fuchsia-500`). */
export const NEON_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-4 py-2.5 font-semibold text-white shadow-lg shadow-indigo-900/30 transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50";

/** Remplissage de barre de progression — même dégradé que le bouton néon. */
export const NEON_BAR_FILL =
  "h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500";

/** Texte accentué (dégradé cyan → fuchsia du login). */
export const NEON_TEXT =
  "bg-gradient-to-r from-cyan-300 to-fuchsia-400 bg-clip-text font-bold text-transparent";
