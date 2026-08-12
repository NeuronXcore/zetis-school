// Sortie du plein écran — galaxie (ADR-0024), rejeu de galaxie, et mindmap (ADR-0052).
//
// Elle vivait sous `frontend-massimo/components/galaxy/`. Déplacée ici le 2026-08-12 parce que
// `MindmapWorkspace` (packages/ui) en a besoin et qu'un paquet ne peut pas importer depuis une
// app : la recopier aurait fait diverger deux boutons de sortie au premier ajustement.
//
// Une vraie cible tactile de 44px, un tracé SVG plutôt qu'un « × » typographique — le
// caractère se centre mal et change de forme selon la police. Le halo léger le détache du
// canvas 3D, qui peut être clair ou sombre selon l'endroit où Massimo a tourné la caméra.
export interface CloseFullscreenButtonProps {
  onClick: () => void;
}

export function CloseFullscreenButton({ onClick }: CloseFullscreenButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Quitter le plein écran"
      className="group absolute right-4 top-4 z-20 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/45 text-zetis-text backdrop-blur-md transition hover:border-zetis-accent-2 hover:bg-black/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zetis-accent-2"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 transition-transform group-hover:rotate-90"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}
