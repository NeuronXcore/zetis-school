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
  /** État actif : carte dépliée (mode `expand`) ou filtre appliqué (mode `filter`). */
  expanded?: boolean;
  /** Nature du clic — change à la fois la sémantique ARIA et l'affordance affichée.
   *  `expand` (défaut) : la carte déplie un détail SOUS elle → `aria-expanded`.
   *  `filter` : la carte bascule un filtre AILLEURS dans la page (la matrice de Couverture) →
   *  `aria-pressed`. Rien n'est déplié dans ce cas : annoncer `aria-expanded` mentirait au
   *  lecteur d'écran, qui chercherait une zone révélée qui n'existe pas. */
  mode?: "expand" | "filter";
  /** Affordance affichée sous la valeur en mode `filter` (ex. « Voir · 51 → »). */
  actionLabel?: string;
}

export function KpiCard({
  label,
  value,
  hint,
  delta,
  deltaDirection,
  onClick,
  expanded = false,
  mode = "expand",
  actionLabel,
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

  const affordance =
    mode === "filter"
      ? expanded
        ? "Filtre actif · tout afficher"
        : actionLabel
      : expanded
        ? "Masquer le détail"
        : "Voir le détail →";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={mode === "expand" ? expanded : undefined}
      aria-pressed={mode === "filter" ? expanded : undefined}
      className={`${base} w-full text-left transition-colors ${
        expanded
          ? "border-papa-accent ring-1 ring-papa-accent"
          : "border-papa-border hover:border-papa-accent/60"
      }`}
    >
      {content}
      {affordance && (
        <span
          className={`mt-1 block text-xs ${expanded ? "text-papa-accent" : "text-papa-muted"}`}
        >
          {affordance}
        </span>
      )}
    </button>
  );
}
