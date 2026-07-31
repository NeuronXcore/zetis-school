import type { DashboardFocus, DashboardPeriod, DashboardSeries } from "@zetis/types";
import { DashboardCard } from "./DashboardCard";

// « Évolution de la mémoire » — trois courbes sur douze points.
//
// La lecture que la carte doit rendre évidente : **l'écart entre la courbe grise (notions
// couvertes par un cours validé) et la verte (consolidées) est le travail restant.** D'où l'aire
// remplie sous la verte seule — c'est le seul acquis, les deux autres sont des contextes.
//
// Les trois séries sont reconstruites côté serveur par la même règle (« l'ensemble d'aujourd'hui,
// moins ce qui y est entré après »), ce qui garantit que le dernier point de chaque courbe vaut
// le compteur courant. Une courbe qui finirait ailleurs que sur le chiffre affiché en KPI serait
// illisible.
//
// ⚠️ La courbe ambre démarre à la mise en service de `skill_mastery_history` : avant, aucun
// horodatage de bascule n'existait. Elle ne remonte pas une histoire qu'on n'a pas.

const W = 620;
const H = 190;
const PAD = { l: 34, r: 12, t: 12, b: 26 };

interface MemoryTrendCardProps {
  series: DashboardSeries;
  period: DashboardPeriod;
  focus: DashboardFocus | null;
}

/** Dernier point d'une série — 0 si elle est vide. `Array.prototype.at` n'est pas dans la lib
 *  TypeScript ciblée par le dépôt. */
const last = (values: number[]): number => values[values.length - 1] ?? 0;

const X_LABELS: Record<DashboardPeriod, string[]> = {
  "7": ["J-6", "J-3", "auj."],
  "30": ["S-4", "S-2", "auj."],
  "90": ["M-3", "M-1", "auj."],
};

export function MemoryTrendCard({ series, period, focus }: MemoryTrendCardProps) {
  const points = series.covered.length;
  const max = Math.max(4, ...series.covered, ...series.consolidated, ...series.fragile);
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(1, points - 1);
  const y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);

  const path = (values: number[]) =>
    values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  const gridValues = [0, Math.round(max / 2), max];

  return (
    <DashboardCard
      card="memoire"
      title="Évolution de la mémoire"
      tagline="notions consolidées vs fragiles"
      focus={focus}
      className="xl:col-span-7"
    >
      {points < 2 ? (
        <p className="py-6 text-sm italic text-papa-muted">
          Pas encore assez d'historique pour tracer une évolution.
        </p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Évolution : ${last(series.covered)} notions couvertes, ${series.consolidated.at(-1)} consolidées, ${series.fragile.at(-1)} à renforcer`}>
            {gridValues.map((value) => (
              <g key={value}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(value)} y2={y(value)} className="stroke-papa-border" strokeWidth={1} />
                <text x={PAD.l - 8} y={y(value) + 3} textAnchor="end" className="fill-papa-muted font-mono text-[9.5px]">
                  {value}
                </text>
              </g>
            ))}

            {/* Gris : le programme couvert. Contexte, donc aucun remplissage. */}
            <path d={path(series.covered)} fill="none" stroke="currentColor" strokeWidth={2} className="text-papa-muted/50" strokeLinejoin="round" />
            {/* Ambre : les notions à renforcer. */}
            <path d={path(series.fragile)} fill="none" stroke="currentColor" strokeWidth={2} className="text-papa-warn" strokeLinejoin="round" />
            {/* Émeraude : l'acquis. Seule courbe remplie — c'est elle qu'on veut voir monter. */}
            <path
              d={`${path(series.consolidated)} L${x(points - 1)} ${y(0)} L${x(0)} ${y(0)} Z`}
              className="fill-papa-accent/15"
            />
            <path d={path(series.consolidated)} fill="none" stroke="currentColor" strokeWidth={2} className="text-papa-accent" strokeLinejoin="round" />

            {[0, Math.floor((points - 1) / 2), points - 1].map((index, k) => (
              <text key={index} x={x(index)} y={H - 8} textAnchor="middle" className="fill-papa-muted font-mono text-[9.5px]">
                {X_LABELS[period][k]}
              </text>
            ))}
          </svg>

          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-papa-muted">
            <li>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-[2px] bg-papa-accent align-[-1px]" />
              consolidées ({last(series.consolidated)})
            </li>
            <li>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-[2px] bg-papa-warn align-[-1px]" />
              à renforcer ({last(series.fragile)})
            </li>
            <li>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-[2px] bg-papa-muted/50 align-[-1px]" />
              couvertes par un cours validé ({last(series.covered) ?? 0})
            </li>
          </ul>
        </>
      )}
    </DashboardCard>
  );
}
