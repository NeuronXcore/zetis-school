import { NavLink } from "react-router-dom";
import { type NewsSummary } from "@zetis/types";
import { MASSIMO_NAV } from "../lib/navigation";
import { capNewsBadge, EMPTY_NEWS } from "../lib/news";
import zetisAvatar from "../assets/brand/zetis-avatar_256.png";
import zetisWordmark from "../assets/brand/zetis-texte.png";

// Sidebar temporaire de l'interface Massimo (Étape 2).
//
// **Ce composant ne fait AUCUN appel réseau** (ADR-0030 §5). Il portait auparavant deux pastilles
// codées en dur, chacune avec son propre fetch au montage ; les compteurs arrivent désormais en
// prop depuis `MassimoLayout`, qui les récupère en un seul appel. Un test vérifie qu'aucun
// `fetch` ne repart d'ici — c'est ce qui empêche le double fetch de réapparaître entrée par
// entrée.
export function MassimoSidebar({ news = EMPTY_NEWS }: { news?: NewsSummary }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-zetis-border bg-[#000010]">
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
            {/* Témoin de nouveauté (ADR-0030 §6) : forme reprise du badge « ✨ new » des decks.
                ABSENT à zéro — pas de « 0 » affiché, aucun réceptacle vide. Aucune pulsation,
                aucune animation d'apparition, aucun rouge : ce badge informe, il n'alerte pas.
                Ni or (réservé à « ZETIS parle ») ni ambre (files de validation Papa). */}
            {item.newsKey && news[item.newsKey] > 0 && (
              <span
                className="ml-auto rounded-full border border-emerald-300/50 bg-emerald-400/20 px-2 py-0.5 text-[11px] font-bold text-emerald-100"
                aria-label={`${news[item.newsKey]} nouveau${news[item.newsKey] > 1 ? "x" : ""}`}
              >
                {capNewsBadge(news[item.newsKey])}
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
