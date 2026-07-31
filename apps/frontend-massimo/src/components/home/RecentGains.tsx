import { REASON_LABEL, type Badge, type XpEvent } from "../../lib/gamification";

// « Tes derniers gains » (addendum ADR-0024 « Accueil vivant » §C).
//
// Coût nul : `recent` et `badges` sont servis par `GET /api/gamification/summary`, que le bandeau
// XP appelle DÉJÀ sur cette page — ils n'étaient rendus nulle part dans l'app. Aucune requête
// ajoutée, aucun backend.
//
// Positif par construction : un `XPEvent` est toujours un GAIN. Il n'existe pas d'événement de
// perte à afficher ici, et il ne faut pas en fabriquer un (« tu n'as rien gagné hier »).

/** Repli quand une `reason` n'est pas dans la table : jamais l'identifiant brut à l'écran. */
const FALLBACK_LABEL = "Tu as travaillé";

export interface RecentGainsProps {
  recent: XpEvent[];
  badges: Badge[];
  className?: string;
}

export function RecentGains({ recent, badges, className = "" }: RecentGainsProps) {
  const lastBadge = badges.at(-1) ?? null;
  // Rien à montrer : la carte ne se rend pas plutôt que d'afficher une liste vide. Le premier
  // jour d'un trimestre, ce n'est pas un manque — il ne s'est simplement encore rien passé.
  if (recent.length === 0 && !lastBadge) return null;

  return (
    <section
      className={`rounded-2xl border border-zetis-border bg-zetis-surface p-5 ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
        Tes derniers gains
      </p>

      {recent.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {recent.map((event, index) => (
            <li
              key={`${event.created_at ?? "sans-date"}-${index}`}
              className="flex items-center justify-between gap-3 border-b border-white/5 pb-1.5 text-sm last:border-b-0 last:pb-0"
            >
              {/* La DATE n'est jamais affichée : « il y a 5 jours » réintroduirait le décompte
                  d'absence que « Mon ciel » vient d'éviter, juste au-dessus. */}
              <span className="truncate">{REASON_LABEL[event.reason] ?? FALLBACK_LABEL}</span>
              <span className="shrink-0 font-bold text-zetis-accent-2">+{event.amount} XP</span>
            </li>
          ))}
        </ul>
      )}

      {lastBadge && (
        <p className="mt-3 flex items-center gap-2 border-t border-white/7 pt-3 text-sm">
          <span aria-hidden className="text-lg">
            {lastBadge.icon}
          </span>
          <span className="text-zetis-muted">
            Dernier badge : <span className="font-semibold text-zetis-text">{lastBadge.label}</span>
          </span>
        </p>
      )}
    </section>
  );
}
