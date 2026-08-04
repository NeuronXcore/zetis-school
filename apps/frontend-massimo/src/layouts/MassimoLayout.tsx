import { useCallback, useState } from "react";
import { Outlet } from "react-router-dom";
import { MassimoSidebar } from "../components/MassimoSidebar";
import zetisWordmark from "../assets/brand/zetis-texte.png";
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

  // Tiroir de navigation — **mobile uniquement** (2026-08-04). Il vit ICI et non dans la sidebar :
  // c'est le layout qui possède aussi le bouton d'ouverture, et deux composants qui se
  // partageraient l'état se désynchroniseraient au premier ajout.
  const [navOuverte, setNavOuverte] = useState(false);
  const fermerNav = useCallback(() => setNavOuverte(false), []);

  return (
    <div className="flex h-full">
      <MassimoSidebar news={news} open={navOuverte} onNavigate={fermerNav} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barre du tiroir : sous `md` seulement. Au-dessus, la sidebar est là et ce bouton
            n'aurait rien à ouvrir. */}
        <div className="flex shrink-0 items-center gap-3 border-b border-zetis-border px-4 py-2 md:hidden">
          <button
            type="button"
            onClick={() => setNavOuverte(true)}
            aria-label="Ouvrir le menu"
            aria-expanded={navOuverte}
            // Cible tactile large : c'est l'unique accès à la navigation sur téléphone.
            className="rounded-xl px-3 py-2 text-2xl leading-none text-zetis-text hover:bg-zetis-surface-2"
          >
            ☰
          </button>
          <img src={zetisWordmark} alt="ZETIS" className="h-6 w-auto object-contain" />
        </div>
        <MassimoBannerHeader />
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
