// Retour visuel d'une demande à Papa (addendum ADR-0027). Même patron que `SearchEmptyToast`.
//
// Le texte est figé et il compte : « C'est noté pour Papa », JAMAIS « je te le prépare ».
// ZETIS transmet une demande, il ne fabrique rien — et il n'annonce ni statut, ni délai, ni
// rappel. Massimo ne lit pas la file de Papa ; lui promettre une échéance ferait de cette
// page un écran d'attente.
export interface RequestToastProps {
  message: string;
}

export function RequestToast({ message }: RequestToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4 motion-safe:animate-[eli5-toast-in_0.3s_ease-out]"
    >
      <div className="flex max-w-md items-center gap-2.5 rounded-full border border-white/10 bg-zetis-surface/90 px-5 py-3 shadow-2xl backdrop-blur-xl">
        <span aria-hidden className="text-lg">
          ✉️
        </span>
        <span className="text-sm text-zetis-text">{message}</span>
      </div>
    </div>
  );
}
