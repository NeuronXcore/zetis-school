import { Outlet } from "react-router-dom";
import { MassimoSidebar } from "../components/MassimoSidebar";
import { MassimoBannerHeader } from "../components/MassimoBannerHeader";
import { usePageviewTelemetry } from "../hooks/usePageviewTelemetry";
import { useNewsSummary } from "../hooks/useNewsSummary";

// Layout commun de l'interface Massimo : sidebar + header banner global + zone principale
// (cf. docs/frontend-massimo/README.md § Layout commun).
export function MassimoLayout() {
  // Journal d'activité (chantier « Activité ») : posé ICI, sous `RequireAuth`, donc seules les
  // pages de l'espace connecté sont tracées — la page de login n'a rien à y faire. Aucun rendu :
  // le tracking reste totalement invisible côté Massimo.
  usePageviewTelemetry();

  // Témoins de nouveauté (ADR-0030 §5) : UN SEUL appel, monté ICI et nulle part ailleurs. La
  // sidebar récupérait auparavant deux compteurs pour son propre compte — ce hook remplace ce
  // double fetch, et la sidebar ne connaît plus le réseau du tout.
  const news = useNewsSummary();

  return (
    <div className="flex h-full">
      <MassimoSidebar news={news} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MassimoBannerHeader />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
