import { Outlet } from "react-router-dom";
import { MassimoSidebar } from "../components/MassimoSidebar";
import { ZetisAvatar } from "../components/ZetisAvatar";

// Layout commun de l'interface Massimo : sidebar + header + zone principale
// (cf. docs/frontend-massimo/README.md § Layout commun).
export function MassimoLayout() {
  return (
    <div className="flex h-full">
      <MassimoSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zetis-border bg-zetis-surface/60 px-6 py-3">
          <span className="text-sm text-zetis-muted">Aujourd'hui — prêt à apprendre ?</span>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-zetis-surface-2 px-3 py-1 text-xs font-semibold text-zetis-accent-2">
              ⭐ 0 XP
            </span>
            <ZetisAvatar size={32} />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
