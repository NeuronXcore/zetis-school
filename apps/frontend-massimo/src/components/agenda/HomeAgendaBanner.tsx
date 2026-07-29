import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { type AgendaItemStudent } from "@zetis/types";
import { fetchAgendaItems } from "../../lib/agenda";
import { addDays, bannerItems, isoDay, splitSections } from "../../lib/agendaSections";
import { subjectIconFor } from "../../lib/subjectIcons";

// Bandeau « Aujourd'hui / Demain » de l'Accueil — **le seul accès à l'agenda en phase 0**
// (ADR-0025, spec Massimo §Accès) : l'agenda n'obtient ni entrée de sidebar ni bottom-nav tant
// que Massimo ne peut pas y écrire. L'entrée arrivera avec le pouvoir d'écrire, pas avant.
//
// **Aucune date affichée** : l'Accueil porte l'horizon « maintenant ». 3 items au maximum.
//
// S'il n'y a rien : une ligne calme — JAMAIS « ajoute tes devoirs ». En phase 0 il ne le peut
// pas, et l'y inviter serait une impasse.
//
// Rendu inconditionnel (jamais masqué quand c'est vide) : le bandeau est le chemin d'accès à la
// page, le faire disparaître rendrait l'agenda introuvable exactement quand il est vide.

export function HomeAgendaBanner() {
  const [items, setItems] = useState<AgendaItemStudent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const today = new Date();
    fetchAgendaItems(isoDay(today), isoDay(addDays(today, 1)))
      .then((rows) => setItems(bannerItems(splitSections(rows, today))))
      // Échec silencieux : aucun message technique à l'écran de l'enfant.
      .catch(() => setItems([]))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  return (
    <Link
      to="/agenda"
      className="mb-4 block rounded-2xl border border-zetis-border bg-zetis-surface p-4 transition-colors hover:border-white/20 motion-reduce:transition-none"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
          Mon agenda
        </p>
        <span className="text-xs text-zetis-muted">Voir →</span>
      </div>

      {items.length === 0 ? (
        <p className="mt-2 text-sm text-zetis-muted">Rien de noté pour aujourd'hui ni demain.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  item.done ? "bg-emerald-400/70" : "bg-white/30"
                }`}
              />
              {item.subject && (
                <img
                  src={subjectIconFor(item.subject.slug)}
                  alt=""
                  aria-hidden
                  className="h-4 w-4 shrink-0 rounded-[22%] object-contain"
                />
              )}
              <span className={`truncate ${item.done ? "text-zetis-muted line-through" : ""}`}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}
