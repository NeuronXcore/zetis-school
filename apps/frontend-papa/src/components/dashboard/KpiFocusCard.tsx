import { Sparkline } from "@zetis/ui";
import type { DashboardFocus } from "@zetis/types";

// KPI actif — une mesure ET le contrôle qui montre ce qui la fonde (ADR-0028 §5).
//
// Ce n'est pas un `KpiCard` en mode « expand » : rien ne se déplie SOUS la carte, le clic met le
// reste de la page en focus. D'où `aria-pressed` et non `aria-expanded` — annoncer une zone
// révélée qui n'existe pas enverrait un lecteur d'écran la chercher.
//
// La carte active reçoit une BORDURE en plus de sa teinte : sur une page où le focus s'exprime
// par l'atténuation des autres cartes, l'opacité seule ne suffirait pas (elle est invisible pour
// qui ne perçoit pas les contrastes faibles).

interface KpiFocusCardProps {
  focus: DashboardFocus;
  label: string;
  value: string;
  /** Dénominateur affiché en petit après la valeur (« / 7 j », « / 46 »). */
  unit?: string;
  /** Écart déjà formaté et signé. `null` = rien à montrer — un « +0 » n'informe de rien. */
  delta?: string | null;
  deltaDirection?: "up" | "down";
  hint?: string;
  /** Infobulle d'honnêteté méthodologique, affichée au survol du « i ». */
  info?: string;
  spark: number[];
  active: boolean;
  focusHint: string;
  onToggle: (focus: DashboardFocus) => void;
}

export function KpiFocusCard({
  focus,
  label,
  value,
  unit,
  delta,
  deltaDirection,
  hint,
  info,
  spark,
  active,
  focusHint,
  onToggle,
}: KpiFocusCardProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onToggle(focus)}
      className={`rounded-xl border bg-papa-surface p-4 text-left transition-colors ${
        active
          ? "border-papa-accent ring-1 ring-papa-accent"
          : "border-papa-border hover:border-papa-accent/60"
      }`}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-papa-muted">
        {label}
        {info && (
          <span
            title={info}
            aria-label={info}
            className="inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full border border-papa-border text-[9px] leading-none"
          >
            i
          </span>
        )}
      </span>

      <span className="mt-2 block font-mono text-2xl font-semibold tracking-tight">
        {value}
        {unit && <span className="text-base text-papa-muted">{unit}</span>}
        {delta && (
          <span
            className={`ml-1.5 text-xs font-semibold ${
              deltaDirection === "down" ? "text-papa-warn" : "text-papa-accent"
            }`}
          >
            {delta}
          </span>
        )}
      </span>

      {hint && <span className="mt-1 block text-xs text-papa-muted">{hint}</span>}

      <span className="mt-2 block text-papa-accent">
        <Sparkline points={spark} label={`${label} — évolution sur la période`} />
      </span>

      {/* Réservé même inactif : sans cela, activer un KPI ferait sauter la hauteur de toute la
          rangée, et la page bougerait sous le curseur au moment du clic. */}
      <span
        className={`mt-1.5 block text-xs font-semibold ${active ? "text-papa-accent" : "text-transparent"}`}
        aria-hidden={!active}
      >
        {focusHint}
      </span>
    </button>
  );
}
