import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { fetchCapsuleStats } from "../lib/capsules";
import { fetchReviewsSummary } from "../lib/reviews";
import { MASSIMO_NAV } from "../lib/navigation";
import { ZetisAvatar } from "./ZetisAvatar";

// Sidebar temporaire de l'interface Massimo (Étape 2).
export function MassimoSidebar() {
  // Pastille « nouvelles capsules » (non vues). Récupérée au montage ; la page Capsules
  // reste la source à jour après visionnage.
  const [newCapsules, setNewCapsules] = useState(0);
  // Pastille « nouvelles cartes » : cartes dues jamais révisées (fraîchement générées par
  // Papa). Se vide dès que Massimo les révise (1er passage → `last_reviewed_at` posé).
  const [newCards, setNewCards] = useState(0);
  useEffect(() => {
    fetchCapsuleStats()
      .then((s) => setNewCapsules(s.new_count))
      .catch(() => {});
    fetchReviewsSummary()
      .then((s) => setNewCards(s.new_count))
      .catch(() => {});
  }, []);

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-2 border-r border-zetis-border bg-zetis-surface p-4">
      <div className="mb-4 flex items-center gap-3">
        <ZetisAvatar size={44} />
        <div>
          <p className="text-lg font-bold leading-tight">ZETIS</p>
          <p className="text-xs text-zetis-muted">Espace de Massimo</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {MASSIMO_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-zetis-accent text-white shadow"
                  : "text-zetis-muted hover:bg-zetis-surface-2 hover:text-zetis-text",
              ].join(" ")
            }
          >
            {item.image ? (
              <img src={item.image} alt="" className="h-7 w-7 rounded object-cover" />
            ) : (
              <span className="text-2xl leading-none">{item.icon}</span>
            )}
            {item.label}
            {item.to === "/capsules" && newCapsules > 0 && (
              <span className="ml-auto rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-white">
                {newCapsules}
              </span>
            )}
            {item.to === "/revision" && newCards > 0 && (
              <span className="ml-auto rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-white">
                {newCards}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
