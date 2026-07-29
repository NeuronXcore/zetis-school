import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { type AgendaItemStudent } from "@zetis/types";
import { fetchAgendaItems } from "../../lib/agenda";
import { addDays, bannerItems, isoDay, splitSections } from "../../lib/agendaSections";
import { subjectIconFor } from "../../lib/subjectIcons";

// Résumé « Aujourd'hui / Demain » sur l'Accueil (ADR-0025).
//
// L'agenda a DEUX accès (décision du commanditaire, 2026-07-29) : l'entrée de sidebar pour y
// aller quand on le décide, ce résumé pour le voir sans y aller. Les deux ne font pas double
// emploi — la sidebar est un chemin, ceci est une information.
//
// **Aucune date affichée** : l'Accueil porte l'horizon « maintenant ». 3 items au maximum.
//
// S'il n'y a rien : une ligne calme — JAMAIS « ajoute tes devoirs ». En phase 0 Massimo ne le
// peut pas, et l'y inviter serait une impasse.
//
// Rendu inconditionnel (jamais masqué quand c'est vide) : un résumé qui disparaît quand il n'a
// rien à dire apprend à ne plus le regarder.

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
