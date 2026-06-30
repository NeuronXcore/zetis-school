import { Outlet } from "react-router-dom";
import { MassimoSidebar } from "../components/MassimoSidebar";
import { MassimoBannerHeader } from "../components/MassimoBannerHeader";

// Layout commun de l'interface Massimo : sidebar + header banner global + zone principale
// (cf. docs/frontend-massimo/README.md § Layout commun).
export function MassimoLayout() {
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
