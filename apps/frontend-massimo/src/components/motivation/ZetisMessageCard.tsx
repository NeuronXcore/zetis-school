import { Link } from "react-router-dom";
import type { MotivationMessage } from "@zetis/types";
import { ZetisAvatar } from "../ZetisAvatar";
import { ctaRoute, visualForCode } from "../../lib/motivationVisuals";

// Ce que ZETIS dit — accueil comme fin de séance.
//
// **Ce composant ne compose RIEN.** Il affiche `title` et `subtitle` verbatim : pas
// d'interpolation, pas de pluriel calculé, pas de troncature, pas de conditionnel sur le texte.
// Il ne lit JAMAIS `context.*` — celui-ci sert aux autres blocs de la page, jamais à fabriquer
// une phrase ici. C'est la garantie qu'un « ça fait 5 jours ! » ne peut pas apparaître.
//
// Sa seule liberté est l'illustration, choisie à partir du `code`.

interface ZetisMessageCardProps {
  message: MotivationMessage;
  compact?: boolean;
}

export function ZetisMessageCard({ message, compact = false }: ZetisMessageCardProps) {
  const visual = visualForCode(message.code);
  const route = ctaRoute(message.cta?.target);

  return (
    <section
      className={`flex items-start gap-3 rounded-2xl border border-zetis-border bg-zetis-surface-2 ${
        compact ? "p-3" : "p-4"
      }`}
    >
      {visual.avatar ? (
        <ZetisAvatar size={compact ? 32 : 40} />
      ) : (
        <span className="text-2xl leading-none" aria-hidden>
          {visual.emoji}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {message.title}
          {visual.avatar && visual.emoji && (
            <span aria-hidden className="ml-1.5">
              {visual.emoji}
            </span>
          )}
        </p>
        {message.subtitle && (
          <p className="mt-0.5 text-sm text-zetis-muted">{message.subtitle}</p>
        )}

        {/* Cible inconnue → aucun bouton, mais le texte serveur reste affiché. Jamais de bouton
            mort ni de navigation devinée. */}
        {message.cta && route && (
          <Link
            to={route}
            className="mt-2 inline-block rounded-xl bg-zetis-accent px-4 py-1.5 text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
          >
            {message.cta.label} →
          </Link>
        )}
      </div>
    </section>
  );
}
