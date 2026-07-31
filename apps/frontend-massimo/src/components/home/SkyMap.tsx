import type { XpHistoryDay } from "../../lib/gamification";

// « Mon ciel » — la heatmap RETOURNÉE (addendum ADR-0024 « Accueil vivant » §B).
//
// Une étoile par jour où Massimo a gagné du XP. RIEN D'AUTRE N'EST DESSINÉ.
//
// ⚠️ Ce composant n'a NI grille NI axe de temps, et c'est le cœur de sa raison d'être — pas une
// préférence graphique. Dans une grille type GitHub, les cases vides SONT le décompte des jours
// manqués, et `CLAUDE.md` l'interdit « sous quelque forme que ce soit ». Sans axe, il n'y a
// aucun intervalle vide à lire : la carte ne PEUT PAS devenir punitive, même mal utilisée.
//
// Trois choses à ne jamais ajouter ici, elles ramèneraient l'interdit par la porte de derrière :
// une date sous une étoile, un « depuis N jours », ou un fond quadrillé.
//
// La série arrive CREUSE du serveur (jours sans gain absents). Ne la complétez pas.

/** Bornes du cadre de placement, en pourcentage. Voir `spreadFor` pour le choix de la largeur. */
const MAX_SPREAD_X = 88;
const MARGIN_Y = 12;
const SPREAD_Y = 76;

/**
 * Largeur occupée par le ciel, selon le nombre d'étoiles — et centrée sur ce qu'elle occupe.
 *
 * ⚠️ Corrigé après vérification sur données réelles : à largeur fixe, six jours s'étiraient d'un
 * bord à l'autre d'un grand cadre sombre, et la carte se lisait comme « il ne s'est presque rien
 * passé ». C'est exactement le contresens que ce bloc doit éviter — un début n'est pas un vide.
 *
 * En faisant croître l'étendue AVEC le nombre de jours, la densité reste à peu près constante :
 * peu de jours donnent un petit amas serré, beaucoup donnent une vraie galaxie.
 */
function spreadFor(count: number): { margin: number; spread: number } {
  const spread = Math.min(MAX_SPREAD_X, 14 + count * 6);
  return { margin: (100 - spread) / 2, spread };
}

/** Hauteur du cadre : elle suit la même logique que l'étendue, pour la même raison. */
function heightClass(count: number): string {
  if (count <= 6) return "h-16";
  if (count <= 14) return "h-24";
  return "h-32";
}

/**
 * Hachage stable d'une chaîne → [0, 1[ (FNV-1a).
 *
 * Le placement doit être DÉTERMINISTE : un ciel qui se réarrange à chaque visite ne serait pas
 * celui de Massimo. C'est aussi ce qui rend le composant testable — `Math.random()` est banni
 * ici, comme dans les scripts de maquette.
 */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** Rampe de l'ADR-0024 §5 : indigo → cyan → blanc. Jamais de rouge, jamais de vert d'échec. */
function starColor(intensity: number): string {
  if (intensity > 0.75) return "#ffffff";
  if (intensity > 0.4) return "#22d3ee";
  return "#8b7bff";
}

export interface SkyMapProps {
  /** Jours de gain, du plus ancien au plus récent. Série creuse — jamais complétée. */
  days: XpHistoryDay[];
  className?: string;
}

export function SkyMap({ days, className = "" }: SkyMapProps) {
  // Un ciel vide n'est pas un état d'erreur, mais il n'a rien à montrer : la carte ne se rend
  // pas plutôt que d'afficher un cadre noir vide (la page décide, cf. `AccueilMassimoPage`).
  if (days.length === 0) return null;

  const maxXp = Math.max(...days.map((day) => day.xp));
  const { margin, spread } = spreadFor(days.length);

  return (
    <section
      className={`relative overflow-hidden rounded-2xl border border-zetis-border bg-zetis-surface p-5 ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">Mon ciel</p>

      {/* La légende porte l'information : un COMPTE qui ne peut que monter. Les étoiles sont
          décoratives (`aria-hidden`) — sans elle, un lecteur d'écran n'aurait rien à lire. */}
      <p className="mt-2 text-sm">
        <span className="text-2xl font-bold tabular-nums">{days.length}</span>{" "}
        jour{days.length > 1 ? "s" : ""} d'apprentissage
      </p>
      <p className="mt-0.5 text-xs text-zetis-muted">
        Chaque jour où tu travailles allume une étoile de plus. Elles restent.
      </p>

      <div aria-hidden className={`relative mt-3 ${heightClass(days.length)}`}>
        {days.map((day, index) => {
          const intensity = maxXp > 0 ? day.xp / maxXp : 0;
          // Taille relevée après vérification réelle : à 3 px, les étoiles d'un petit ciel
          // étaient à la limite du visible.
          const size = 4 + intensity * 7;
          // L'ancienneté pousse vers la gauche — assez pour que le ciel ait un sens de lecture,
          // pas assez pour redevenir un axe : la dérive du hachage brouille tout intervalle.
          const drift = days.length > 1 ? index / (days.length - 1) : 0.5;
          const left = margin + drift * spread + (hash(day.date) - 0.5) * 9;
          const top = MARGIN_Y + hash(`${day.date}y`) * SPREAD_Y;
          const color = starColor(intensity);

          return (
            <span
              key={day.date}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full motion-safe:animate-pulse"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                width: `${size}px`,
                height: `${size}px`,
                background: color,
                boxShadow: `0 0 ${Math.round(4 + intensity * 12)}px ${color}99`,
                animationDelay: `${(hash(`${day.date}d`) * 5).toFixed(2)}s`,
              }}
            />
          );
        })}
      </div>
    </section>
  );
}
