// Frise de progression — le chemin parcouru, en une ligne (ADR-0024, 2026-07-28).
//
// ⚠️ La courbe est MONOTONE par construction côté serveur : elle compte chaque notion au jour
// où Massimo l'a travaillée pour la première fois. Ne jamais la « corriger » avec l'état
// courant de la maîtrise, qui peut régresser — elle deviendrait décroissante, donc un
// compteur de pertes. Ce composant se contente de tracer ce qu'on lui donne.
//
// Aucun axe, aucun pourcentage, aucune date d'échéance : ce n'est pas un tableau de bord,
// c'est une trace de chemin.
import type { GalaxyTimeline } from "@zetis/types";

export interface ProgressSparklineProps {
  timeline: GalaxyTimeline;
  className?: string;
}

const W = 300;
const H = 44;

export function ProgressSparkline({ timeline, className = "" }: ProgressSparklineProps) {
  const { points } = timeline;
  if (points.length < 2) return null;

  const max = points[points.length - 1].lit || 1;
  const step = W / (points.length - 1);
  const coords = points.map((p, i) => [i * step, H - (p.lit / max) * (H - 6) - 3] as const);
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${H} ${line} ${W},${H}`;

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-11 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`De ${first.lit} à ${last.lit} notions explorées`}
      >
        <defs>
          <linearGradient id="zetis-spark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#zetis-spark)" />
        <polyline
          points={line}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={coords[coords.length - 1][0]}
          cy={coords[coords.length - 1][1]}
          r="3"
          fill="#e8ecf8"
        />
      </svg>
      <p className="mt-1 text-[11px] text-zetis-muted">
        Ta galaxie s'allume, semaine après semaine.
      </p>
    </div>
  );
}
