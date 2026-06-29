import { Outlet } from "react-router-dom";
import { PapaSidebar } from "../components/PapaSidebar";
import { useAuth } from "@zetis/auth";

// Layout commun de l'interface Papa : sidebar + header + zone analytique
// (cf. docs/frontend-papa/README.md § Layout).
export function PapaLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="flex h-full">
      <PapaSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-papa-border bg-papa-surface/60 px-6 py-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-md bg-papa-surface-2 px-2.5 py-1 font-medium text-papa-text">
              Enfant : Massimo
            </span>
            <span className="text-papa-muted">Période : 2026 — 4ᵉ</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-papa-border px-3 py-1.5 text-sm font-medium text-papa-muted hover:text-papa-text"
            >
              Exporter
            </button>
            {user && (
              <button
                type="button"
                onClick={logout}
                className="rounded-lg px-2 py-1 text-xs text-papa-muted hover:text-papa-text"
              >
                Déconnexion
              </button>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
