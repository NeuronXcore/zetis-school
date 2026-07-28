import type { BreakdownRow } from "../../lib/kpiBreakdown";

// Panneau de détail d'un KPI, déplié SOUS la grille de cartes.
//
// Inline et non en modale, pour la même raison que le panneau détail-jour : Papa doit pouvoir
// comparer un KPI à ceux d'à côté sans perdre le contexte de la page.
//
// La barre de proportion est de la PRÉSENTATION pure : elle rapporte chaque ligne au maximum de
// la série, elle n'ajoute aucune donnée. Les valeurs affichées sont celles servies par le serveur.

interface KpiBreakdownProps {
  title: string;
  rows: BreakdownRow[];
  /** Message affiché quand la période ne contient rien à détailler. */
  emptyLabel: string;
  loading?: boolean;
  onClose: () => void;
}

export function KpiBreakdown({ title, rows, emptyLabel, loading, onClose }: KpiBreakdownProps) {
  const max = rows.reduce((peak, row) => Math.max(peak, row.value), 0);
  const hasData = rows.some((row) => row.value > 0);

  return (
    <section className="mt-4 rounded-xl border border-papa-accent/40 bg-papa-surface p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-papa-muted hover:text-papa-text"
        >
          Fermer ✕
        </button>
      </div>

      {loading && <p className="text-sm text-papa-muted">Chargement du détail…</p>}

      {!loading && !hasData && <p className="text-sm italic text-papa-muted">{emptyLabel}</p>}

      {!loading && hasData && (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-3 text-sm">
              <span className="min-w-[92px] shrink-0 text-papa-muted">{row.label}</span>
              <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-papa-surface-2">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-papa-accent/70"
                  style={{ width: max > 0 ? `${(row.value / max) * 100}%` : "0%" }}
                />
              </span>
              {row.caption && (
                <span className="hidden max-w-[45%] truncate text-xs text-papa-muted sm:block">
                  {row.caption}
                </span>
              )}
              <span className="min-w-[74px] shrink-0 text-right font-semibold tabular-nums">
                {row.display}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
