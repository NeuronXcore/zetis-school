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
  /**
   * Nombre d'étoiles allumées à cet instant — la frise se trace JUSQUE-LÀ (addendum ADR-0029
   * §3 : elle devient témoin du rejeu, plus barre de lecture).
   *
   * Absent (le cas de l'Accueil) → trace complète, comportement inchangé.
   *
   * ⚠️ L'axe X reste le JOUR ACTIF, jamais le rang. Une première rédaction proposait un axe de
   * rang « par cohérence » avec l'horloge du rejeu : c'était faux, cumul contre rang donne une
   * DROITE et la courbe ne dit plus rien. Avec l'axe jour, une journée à six notions monte en
   * marche d'escalier — et c'est ça, l'information. Ne pas « unifier ».
   */
  lit?: number | null;
}

const W = 300;
const H = 44;

export function ProgressSparkline({
  timeline,
  className = "",
  lit = null,
}: ProgressSparklineProps) {
  const { points } = timeline;
  if (points.length < 2) return null;

  const max = points[points.length - 1].lit || 1;
  const step = W / (points.length - 1);
  const coords = points.map((p, i) => [i * step, H - (p.lit / max) * (H - 6) - 3] as const);

  // Tête de tracé : la position, en fraction de JOUR, où le compte `lit` est atteint. On
  // interpole DANS le jour en cours — six notions le même jour font monter la courbe pendant
  // que six étoiles s'allument coup sur coup.
  let drawn = coords;
  if (lit !== null && lit < max) {
    let index = points.findIndex((p) => p.lit >= lit);
    if (index < 0) index = points.length - 1;
    const previous = index > 0 ? points[index - 1].lit : 0;
    const span = points[index].lit - previous;
    const fraction = span > 0 ? Math.min(1, Math.max(0, (lit - previous) / span)) : 0;
    const x = (index - 1 + fraction) * step;
    const y = H - (lit / max) * (H - 6) - 3;
    drawn = [...coords.slice(0, Math.max(1, index)), [Math.max(0, x), y] as const];
  }

  const line = drawn.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const head = drawn[drawn.length - 1];
  const area = `0,${H} ${line} ${head[0].toFixed(1)},${H}`;

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
        <circle cx={head[0]} cy={head[1]} r="3" fill="#e8ecf8" />
      </svg>
      <p className="mt-1 text-[11px] text-zetis-muted">
        Ta galaxie s'allume, semaine après semaine.
      </p>
    </div>
  );
}
