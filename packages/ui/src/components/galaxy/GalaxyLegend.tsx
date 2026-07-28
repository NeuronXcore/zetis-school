/**
 * Les cinq états, en KPI CLIQUABLES.
 *
 * Chaque état porte son COMPTE d'étoiles — un compte, jamais un pourcentage : la page dit
 * « où j'en suis », elle ne note pas Massimo et ne classe pas ses matières (ADR-0024 §5).
 *
 * Cliquer un état met en évidence les étoiles concernées ; re-cliquer efface le filtre.
 * Sélection simple : un enfant lit mieux un filtre à la fois qu'une combinaison.
 *
 * Libellés ENFANT uniquement, aucun statut technique, aucun rouge.
 */
import type { GalaxyStatus } from "@zetis/types";
import { STAR_STYLES, STATUS_ORDER } from "./galaxyTheme";

export interface GalaxyLegendProps {
  /** Nombre d'étoiles par état. Absent → les compteurs ne s'affichent pas. */
  counts?: Record<GalaxyStatus, number>;
  /** État actuellement mis en évidence. */
  active?: GalaxyStatus | null;
  /** Bascule le filtre. Sans ce callback, la légende reste purement informative. */
  onToggle?: (status: GalaxyStatus) => void;
}

export function GalaxyLegend({ counts, active = null, onToggle }: GalaxyLegendProps) {
  return (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label="Ce que veulent dire les étoiles">
      {STATUS_ORDER.map((status) => {
        const style = STAR_STYLES[status];
        const count = counts?.[status];
        const isActive = active === status;
        // Un état sans aucune étoile n'est pas cliquable : le filtre ne montrerait rien.
        const clickable = Boolean(onToggle) && (count === undefined || count > 0);
        return (
          <li key={status}>
            <button
              type="button"
              disabled={!clickable}
              aria-pressed={clickable ? isActive : undefined}
              onClick={() => onToggle?.(status)}
              className={
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition " +
                (isActive
                  ? "border-zetis-accent-2 bg-zetis-surface-2 text-zetis-text"
                  : "border-zetis-border bg-zetis-surface ") +
                (clickable ? " cursor-pointer hover:border-zetis-accent-2" : " opacity-60")
              }
            >
              <span
                aria-hidden
                className="inline-block rounded-full"
                style={{
                  width: 10,
                  height: 10,
                  backgroundColor: style.color,
                  boxShadow: style.glow ? `0 0 ${6 + style.glow * 10}px ${style.color}` : "none",
                }}
              />
              {style.label}
              {count !== undefined && (
                <span className="text-zetis-muted">· {count}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
