import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { fetchCapsuleStats } from "../lib/capsules";
import { fetchReviewsSummary } from "../lib/reviews";
import { MASSIMO_NAV } from "../lib/navigation";
import zetisAvatar from "../assets/brand/zetis-avatar.png";
import zetisWordmark from "../assets/brand/zetis-texte.png";

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
    <aside className="flex w-60 shrink-0 flex-col border-r border-zetis-border bg-zetis-surface">
      <style>{ZLOGO_CSS}</style>
      {/* Bande logo : même hauteur que le header principal → le logo s'aligne sur l'avatar
          de Massimo et la ligne horizontale du header se prolonge à travers la sidebar. */}
      <div className="flex h-24 shrink-0 items-center justify-center border-b border-zetis-border sm:h-28">
        <div className="zlogo relative h-16 w-16">
          <span className="zlogo-halo" aria-hidden />
          <img
            src={zetisAvatar}
            alt="ZETIS"
            className="zlogo-img h-16 w-16 rounded-full object-cover"
          />
        </div>
      </div>
      {/* Wordmark : juste sous la ligne du header. */}
      <div className="flex justify-center py-3">
        <img
          src={zetisWordmark}
          alt="ZETIS"
          className="h-9 w-auto max-w-full object-contain"
        />
      </div>

      <nav className="flex flex-col gap-1 px-4 pb-4">
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
              <img
                src={item.image}
                alt=""
                // Quiz (feature phare) mise en avant : icône plus grande que les autres.
                className={`${item.to === "/quiz" ? "h-9 w-9" : "h-7 w-7"} rounded object-cover`}
              />
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

const ZLOGO_CSS = `
.zlogo-halo{position:absolute;inset:-7px;border-radius:9999px;z-index:0;
  background:conic-gradient(from 0deg,#22d3ee,#6366f1,#a855f7,#e879f9,#22d3ee);
  filter:blur(9px);opacity:.75;animation:zlogo-spin 5.5s linear infinite}
.zlogo-img{position:relative;z-index:1}
@keyframes zlogo-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.zlogo-halo{animation:none}}
`;
