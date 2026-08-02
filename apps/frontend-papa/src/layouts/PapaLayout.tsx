import { useState } from "react";
import { Outlet } from "react-router-dom";
import { PapaSidebar } from "../components/PapaSidebar";
import { useAuth } from "@zetis/auth";
import { useActiveProductionRun } from "../hooks/useActiveProductionRun";
import { ActiveProductionModal } from "../components/ActiveProductionModal";

// Layout commun de l'interface Papa : sidebar + header + zone analytique
// (cf. docs/frontend-papa/README.md § Layout).
export function PapaLayout() {
  const { user, logout } = useAuth();
  // « ZETIS travaille » : le lot tourne dans un worker séparé, Papa peut fermer la modale et
  // naviguer. Sans cet indicateur, plus rien ne le lui disait.
  const activeRun = useActiveProductionRun();
  const [showRun, setShowRun] = useState(false);
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
            {activeRun && (
              // Un PROCESSUS, jamais un stock : « ça travaille », pas « vous êtes en retard ».
              // Le % vient du serveur — il compte des notions, pas des secondes.
              <button
                type="button"
                onClick={() => setShowRun(true)}
                title="Production en cours — voir le détail"
                className="inline-flex items-center gap-1.5 rounded-full border border-papa-accent/40 bg-papa-accent/10 px-2.5 py-1 text-xs font-semibold text-papa-accent transition-colors hover:bg-papa-accent/20"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-papa-accent" aria-hidden />
                ZETIS produit un chapitre · {activeRun.progress_pct}%
              </button>
            )}
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
        {activeRun && showRun && (
          <ActiveProductionModal run={activeRun} onClose={() => setShowRun(false)} />
        )}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
