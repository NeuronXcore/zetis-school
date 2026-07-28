import { Fragment, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { PAPA_NAV } from "../lib/navigation";
import { MISSIONS_PENDING_EVENT, fetchPilotSummary } from "../lib/missionsPilotage";

// Sidebar temporaire de l'interface Papa (Étape 3) — cockpit de pilotage.
export function PapaSidebar() {
  // Compteur ambré « à valider » sur l'entrée Missions (même motif que les autres files de
  // validation) : chargé au montage, rafraîchi quand la page émet après validate/reject.
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const refresh = () =>
      fetchPilotSummary()
        .then((s) => setPending(s.pending))
        .catch(() => undefined);
    void refresh();
    window.addEventListener(MISSIONS_PENDING_EVENT, refresh);
    return () => window.removeEventListener(MISSIONS_PENDING_EVENT, refresh);
  }, []);

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-2 border-r border-papa-border bg-papa-surface p-4">
      <div className="mb-4 px-1">
        <p className="text-lg font-bold leading-tight">
          ZETIS <span className="text-papa-accent">Papa</span>
        </p>
        <p className="text-xs text-papa-muted">Cockpit de pilotage</p>
      </div>

      <nav className="flex flex-col gap-1">
        {PAPA_NAV.map((item) => (
          <Fragment key={item.to}>
            {item.startsGroup && <div className="my-2 h-px bg-papa-border" role="presentation" />}
            <NavLink
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-papa-accent/15 text-papa-accent"
                  : "text-papa-muted hover:bg-papa-surface-2 hover:text-papa-text",
              ].join(" ")
            }
          >
            {item.iconUrl ? (
              // Décoratif : le libellé de l'entrée est juste à côté.
              <img
                src={item.iconUrl}
                alt=""
                aria-hidden
                className="h-5 w-5 shrink-0 rounded-[22%] object-contain"
              />
            ) : (
              <span className="text-base">{item.icon}</span>
            )}
            <span className="flex-1">{item.label}</span>
            {item.to === "/missions" && pending > 0 && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-300">
                {pending}
              </span>
            )}
            </NavLink>
          </Fragment>
        ))}
      </nav>
    </aside>
  );
}
