import { useEffect, useState } from "react";
import { cn } from "../lib/cn";

// Brique de progression partagée (Papa) pour toute opération IA opaque — génération de
// capsule, de fiche, de mindmap… Extraite de frontend-papa (ProgressBar) vers @zetis/ui :
// couleurs pilotées par les tokens sémantiques (primary/border/background/foreground), donc
// rendu identique dans chaque app. Deux variantes : barre (défaut) et anneau.

/**
 * Progression *estimée* d'une opération opaque : le backend (LLM, Piper) ne renvoie pas
 * d'avancement, on anime donc une valeur qui monte vers ~95 % sur une courbe qui ralentit
 * près de la fin (durée cible `expectedMs`), puis se complète à 100 % dès que `active`
 * repasse à false. Ce n'est pas une mesure réelle — juste un repère visuel « ça travaille ».
 */
export function useEstimatedProgress(active: boolean, expectedMs: number): number {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!active) {
      // Fin (ou inactif) : on complète la barre si une opération était en cours.
      setPct((p) => (p > 0 ? 100 : 0));
      return;
    }
    setPct(1);
    const start = Date.now();
    const timer = setInterval(() => {
      const t = (Date.now() - start) / expectedMs;
      // Courbe asymptotique : approche 95 % sans jamais l'atteindre avant la fin réelle.
      const eased = 1 - Math.exp(-t * 2.2);
      setPct(Math.max(1, Math.min(95, Math.round(eased * 100))));
    }, 120);
    return () => clearInterval(timer);
  }, [active, expectedMs]);

  return pct;
}

export interface GenerationProgressProps {
  /** Pourcentage courant (0–100), typiquement issu de `useEstimatedProgress`. */
  value: number;
  /** Décrit l'étape en cours (« Génération de la fiche… »). */
  label: string;
  variant?: "bar" | "ring";
  className?: string;
}

/** Barre de progression animée + pourcentage live. */
function ProgressBarView({ value, label, className }: Omit<GenerationProgressProps, "variant">) {
  return (
    <div className={cn("rounded-xl border border-border bg-background p-3", className)}>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-primary" />
          {label}
        </span>
        <span className="font-semibold tabular-nums text-primary">{value}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-border/60">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-[width] duration-200 ease-out"
          style={{ width: `${Math.max(3, value)}%` }}
        >
          <div className="h-full w-full animate-pulse rounded-full bg-white/20" />
        </div>
      </div>
    </div>
  );
}

/** Anneau de progression (variante compacte, autonome — pas de dépendance app). */
function ProgressRingView({ value, label, className }: Omit<GenerationProgressProps, "variant">) {
  const size = 44;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <svg width={size} height={size} className="shrink-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-border/60" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="fill-none stroke-primary transition-[stroke-dashoffset] duration-200 ease-out"
        />
      </svg>
      <span className="flex items-center gap-2 text-sm text-foreground">
        <span className="font-semibold tabular-nums text-primary">{value}%</span>
        {label}
      </span>
    </div>
  );
}

export function GenerationProgress({ variant = "bar", ...rest }: GenerationProgressProps) {
  return variant === "ring" ? <ProgressRingView {...rest} /> : <ProgressBarView {...rest} />;
}
