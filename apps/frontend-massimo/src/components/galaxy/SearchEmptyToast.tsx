// Message transitoire quand une recherche ne trouve rien (ZETIS Galaxy, ADR-0024).
//
// Même patron que le toast XP d'ELI5 : pilule en bas d'écran, `eli5-toast-in` en
// `motion-safe:`. Transitoire et non bloquant — il ne demande RIEN à Massimo, il informe et
// s'efface. Une modale à fermer transformerait une recherche infructueuse en incident.
//
// Formulation de croissance : la notion n'est pas « introuvable », elle est ailleurs.
export interface SearchEmptyToastProps {
  query: string;
}

export function SearchEmptyToast({ query }: SearchEmptyToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4 motion-safe:animate-[eli5-toast-in_0.3s_ease-out]"
    >
      <div className="flex max-w-md items-center gap-2.5 rounded-full border border-white/10 bg-zetis-surface/90 px-5 py-3 shadow-2xl backdrop-blur-xl">
        <span aria-hidden className="text-lg">
          🔭
        </span>
        <span className="text-sm text-zetis-text">
          Rien qui s'appelle «&nbsp;{query}&nbsp;» dans cette matière
        </span>
        <span className="text-sm text-zetis-muted">· regarde dans une autre</span>
      </div>
    </div>
  );
}
