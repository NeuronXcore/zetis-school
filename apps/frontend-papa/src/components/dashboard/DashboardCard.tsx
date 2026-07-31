import type { ReactNode } from "react";
import type { DashboardFocus } from "@zetis/types";
import { matchesFocus } from "../../lib/dashboardDerive";

// Coquille commune des huit cartes du dashboard.
//
// Elle porte l'atténuation de focus (ADR-0028 §5) : quand un KPI est actif, les cartes qui ne
// répondent PAS à sa question s'effacent. C'est ce qui rend huit diagrammes praticables sur une
// page — sans ce dispositif, il faudrait en retirer.
//
// L'atténuation combine opacité ET désaturation, et la carte retenue reçoit une bordure : le
// contraste seul serait invisible pour une partie des lecteurs, et un `aria-hidden` sur les
// cartes atténuées mentirait (elles restent lisibles et navigables).

interface DashboardCardProps {
  /** Clé de `CARD_SCOPES` — c'est elle qui décide si la carte répond au focus courant. */
  card: string;
  title: string;
  tagline?: string;
  /** Contenu d'en-tête aligné à droite (sélecteur de vue, lien « → »). */
  action?: ReactNode;
  badge?: ReactNode;
  focus: DashboardFocus | null;
  className?: string;
  children: ReactNode;
  /** Note de bas de carte : explicite ce que le diagramme mesure. Un chiffre dont on ne dit pas
   *  comment il est fabriqué est un chiffre qui ment. */
  note?: ReactNode;
}

export function DashboardCard({
  card,
  title,
  tagline,
  action,
  badge,
  focus,
  className = "",
  children,
  note,
}: DashboardCardProps) {
  const matched = matchesFocus(card, focus);
  const dimmed = focus !== null && !matched;
  const highlighted = focus !== null && matched;

  return (
    <section
      data-card={card}
      className={`rounded-xl border bg-papa-surface transition-[opacity,filter] motion-reduce:transition-none ${
        highlighted ? "border-papa-accent/50" : "border-papa-border"
      } ${dimmed ? "opacity-40 saturate-50" : ""} ${className}`}
    >
      <header className="flex flex-wrap items-center gap-2.5 px-4 pb-2 pt-3.5">
        <h3 className="text-xs font-extrabold uppercase tracking-widest">{title}</h3>
        {tagline && <span className="text-xs font-normal text-papa-muted">{tagline}</span>}
        {badge}
        {action && <span className="ml-auto flex items-center gap-3">{action}</span>}
      </header>
      <div className="px-4 pb-4">
        {children}
        {note && (
          <p className="mt-2.5 border-t border-dashed border-papa-border/60 pt-2 text-[11px] leading-relaxed text-papa-muted">
            {note}
          </p>
        )}
      </div>
    </section>
  );
}
