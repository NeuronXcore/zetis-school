interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  /** Écart vs semaine précédente, déjà formaté et signé (« +18 min », « −2 »).
   *  `null`/absent = pas d'écart à montrer : un « +0 » n'informe de rien. */
  delta?: string | null;
  /** Sens de l'écart, pour la couleur. Le signe reste porté par le TEXTE : la couleur ne doit
   *  jamais être le seul véhicule de l'information. */
  deltaDirection?: "up" | "down";
  /** Rend la carte cliquable (dépliage du détail). Sans handler, la carte reste une simple
   *  vignette : une carte sans détail disponible ne doit pas faire semblant d'être interactive. */
  onClick?: () => void;
  expanded?: boolean;
}

export function KpiCard({
  label,
  value,
  hint,
  delta,
  deltaDirection,
  onClick,
  expanded = false,
}: KpiCardProps) {
  const content = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-papa-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold">
        {value}
        {delta && (
          <span
            className={`ml-1.5 text-xs font-semibold ${
              deltaDirection === "down" ? "text-papa-warn" : "text-papa-accent"
            }`}
          >
            {delta}
          </span>
        )}
      </p>
      {hint && <p className="mt-1 text-xs text-papa-muted">{hint}</p>}
    </>
  );

  const base = "rounded-xl border bg-papa-surface p-4";

  if (!onClick) {
    return <div className={`${base} border-papa-border`}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className={`${base} w-full text-left transition-colors ${
        expanded
          ? "border-papa-accent ring-1 ring-papa-accent"
          : "border-papa-border hover:border-papa-accent/60"
      }`}
    >
      {content}
      <span className="mt-1 block text-xs text-papa-muted">
        {expanded ? "Masquer le détail" : "Voir le détail →"}
      </span>
    </button>
  );
}
