import { useEffect, useState } from "react";

/**
 * Progression *estimée* d'une opération opaque : le backend (LLM, Piper) ne renvoie pas
 * d'avancement, on anime donc une barre qui monte vers ~95 % sur une courbe qui ralentit
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

/** Barre de progression animée + pourcentage live. `label` décrit l'étape en cours. */
export function ProgressBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="rounded-xl border border-papa-border bg-papa-bg p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-papa-text">
          <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-papa-accent" />
          {label}
        </span>
        <span className="font-semibold tabular-nums text-papa-accent">{pct}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-papa-border/60">
        <div
          className="h-full rounded-full bg-gradient-to-r from-papa-accent/60 to-papa-accent transition-[width] duration-200 ease-out"
          style={{ width: `${Math.max(3, pct)}%` }}
        >
          <div className="h-full w-full animate-pulse rounded-full bg-white/20" />
        </div>
      </div>
    </div>
  );
}
