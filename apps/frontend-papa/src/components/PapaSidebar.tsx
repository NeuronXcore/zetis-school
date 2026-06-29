import { NavLink } from "react-router-dom";
import { PAPA_NAV } from "../lib/navigation";

// Sidebar temporaire de l'interface Papa (Étape 3) — cockpit de pilotage.
export function PapaSidebar() {
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
          <NavLink
            key={item.to}
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
            <span className="text-base">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
