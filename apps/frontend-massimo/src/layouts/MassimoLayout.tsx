import { Outlet } from "react-router-dom";
import { MassimoSidebar } from "../components/MassimoSidebar";
import { MassimoBannerHeader } from "../components/MassimoBannerHeader";
import { usePageviewTelemetry } from "../hooks/usePageviewTelemetry";

// Layout commun de l'interface Massimo : sidebar + header banner global + zone principale
// (cf. docs/frontend-massimo/README.md § Layout commun).
export function MassimoLayout() {
  // Journal d'activité (chantier « Activité ») : posé ICI, sous `RequireAuth`, donc seules les
  // pages de l'espace connecté sont tracées — la page de login n'a rien à y faire. Aucun rendu :
  // le tracking reste totalement invisible côté Massimo.
  usePageviewTelemetry();

  return (
    <div className="flex h-full">
      <MassimoSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MassimoBannerHeader />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
