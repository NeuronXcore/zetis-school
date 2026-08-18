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
export function useEstimatedProgress(
  active: boolean,
  expectedMs: number,
  /**
   * Instant de départ RÉEL de l'opération (ms epoch), quand on le connaît.
   *
   * ⚠️ **Sans lui, l'estimation mesure l'âge de l'AFFICHAGE, pas celui de l'opération.** Le
   * défaut (`Date.now()` au montage) est juste pour une génération lancée dans la page, qui meurt
   * avec elle. Il est faux dès que l'opération vit ailleurs — un lot de production tourne dans un
   * worker : Papa quittait la page Demandes, revenait, et retrouvait « 0 % » sur une fiche
   * commencée depuis une minute (constaté le 2026-08-05). Le montage n'est pas le départ.
   *
   * Passer `run.started_at` rend l'estimation continue d'une navigation à l'autre, et même d'un
   * onglet à l'autre : elle ne dépend plus de qui regarde.
   */
  startedAtMs?: number | null,
): number {
  // ⚠️ `?? Date.now()` et non `|| Date.now()` : un `startedAtMs` de 0 est un instant valide en
  // théorie, et surtout `||` traiterait `null` et `0` pareil pour de mauvaises raisons.
  // Courbe asymptotique : approche 95 % sans jamais l'atteindre avant la fin réelle.
  const calculer = (start: number): number => {
    const t = (Date.now() - start) / expectedMs;
    const eased = 1 - Math.exp(-t * 2.2);
    return Math.max(1, Math.min(95, Math.round(eased * 100)));
  };

  // 🔴 INITIALISEUR PARESSEUX, et c'est le cœur du correctif. L'intention était écrite juste en
  // dessous depuis l'origine — « le premier rendu ne doit pas afficher 1 % pour une opération déjà
  // avancée » — mais le calcul vivait dans le `useEffect`, qui s'exécute APRÈS la première
  // peinture : `useState(0)` gagnait toujours la première image. Papa voyait donc un « 0 % » fugace
  // sur un lot commencé depuis une minute, c'est-à-dire exactement le défaut que le paramètre
  // `startedAtMs` avait été ajouté pour supprimer (constaté le 2026-08-05).
  //
  // ⚠️ Ce n'était PAS qu'un scintillement : sur les 2 cœurs de la CI, un test qui interroge le DOM
  // pouvait gagner la course contre l'effet et lire « 0 % » — `DemandesPage` est tombée ainsi le
  // 2026-08-18. Un défaut d'affichage d'une image devient un test rouge une fois sur N.
  const [pct, setPct] = useState(() =>
    active && expectedMs > 0 ? calculer(startedAtMs ?? Date.now()) : 0,
  );

  useEffect(() => {
    if (!active) {
      // Fin (ou inactif) : on complète la barre si une opération était en cours.
      setPct((p) => (p > 0 ? 100 : 0));
      return;
    }
    const start = startedAtMs ?? Date.now();
    const lire = () => setPct(calculer(start));
    lire();
    const timer = setInterval(lire, 120);
    return () => clearInterval(timer);
    // `calculer` se referme sur `expectedMs`, déjà listé : pas de dépendance supplémentaire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, expectedMs, startedAtMs]);

  return pct;
}

// Liseré de la barre INDÉTERMINÉE — keyframe injectée localement, comme `confirm-dialog` : la
// brique partagée ne doit dépendre d'aucun CSS d'app hôte (elle sert Papa ET Massimo).
const SHIMMER_KEYFRAMES = `
@keyframes zetis-progress-shimmer {
  0%   { transform: translateX(-110%); }
  100% { transform: translateX(410%); }
}`;

export interface GenerationProgressProps {
  /** Pourcentage courant (0–100), typiquement issu de `useEstimatedProgress`.
   *
   *  ⚠️ **`null` = rien à mesurer, et ce n'est pas `0`.** Un lot en file d'attente n'a pas
   *  commencé : afficher « 0 % » en fait une mesure, donc une promesse d'avancement. Le
   *  2026-08-05, quatre lots arrêtés affichaient 0 % — lu comme « ça démarre », alors que rien
   *  n'écoutait la file. Dans ce cas la barre devient indéterminée et le chiffre disparaît. */
  value: number | null;
  /** Décrit l'étape en cours (« Génération de la fiche… »). */
  label: string;
  variant?: "bar" | "ring";
  className?: string;
}

/** Barre de progression animée + pourcentage live. */
function ProgressBarView({ value, label, className }: Omit<GenerationProgressProps, "variant">) {
  // Indéterminé : on ne SAIT pas où en est l'opération, et on ne le fait pas semblant.
  const indetermine = value === null;
  return (
    <div className={cn("rounded-xl border border-border bg-background p-3", className)}>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          {/* Le point ne bat que si quelque chose bat. */}
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full bg-primary",
              !indetermine && "animate-ping",
            )}
          />
          {label}
        </span>
        {/* ⚠️ Pas de « — » ni de « ? » à la place du chiffre : un caractère dans la case du
            pourcentage reste lu comme une valeur. On retire la case. */}
        {!indetermine && (
          <span className="font-semibold tabular-nums text-primary">{value}%</span>
        )}
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-border/60">
        {indetermine ? (
          // Un liseré qui balaie : il dit « en cours de quelque chose » sans dire « à x % ».
          // ⚠️ Il ne se remplit jamais — une barre partiellement remplie EST un pourcentage,
          // même sans chiffre à côté.
          <>
            <style>{SHIMMER_KEYFRAMES}</style>
            <div
              className="h-full w-1/4 rounded-full bg-gradient-to-r from-transparent via-primary/70 to-transparent"
              style={{ animation: "zetis-progress-shimmer 1.8s ease-in-out infinite" }}
            />
          </>
        ) : (
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-[width] duration-200 ease-out"
            style={{ width: `${Math.max(3, value)}%` }}
          >
            <div className="h-full w-full animate-pulse rounded-full bg-white/20" />
          </div>
        )}
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
  // Indéterminé : l'anneau reste vide (pas de portion colorée), le chiffre disparaît. Même règle
  // que la barre — une portion remplie est une mesure.
  const offset = value === null ? c : c * (1 - Math.max(0, Math.min(100, value)) / 100);
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
        {value !== null && (
          <span className="font-semibold tabular-nums text-primary">{value}%</span>
        )}
        {label}
      </span>
    </div>
  );
}

export function GenerationProgress({ variant = "bar", ...rest }: GenerationProgressProps) {
  return variant === "ring" ? <ProgressRingView {...rest} /> : <ProgressBarView {...rest} />;
}
