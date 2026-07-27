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
}

export function KpiCard({ label, value, hint, delta, deltaDirection }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-papa-border bg-papa-surface p-4">
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
    </div>
  );
}
