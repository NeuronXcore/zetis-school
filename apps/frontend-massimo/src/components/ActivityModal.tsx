import { type ReactNode, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@zetis/ui";

// Hôte de modale « activité » pour la page Missions : ouvre une activité (ELI5 / quiz / mindmap)
// EN PLACE, sans quitter /missions. Grand panneau verre, contenu scrollable À L'INTÉRIEUR,
// verrouillage du scroll de fond, fermeture par Échap / clic backdrop / ✕ — avec confirmation si
// l'activité est en cours (`dirty`) pour ne pas perdre le travail de Massimo. La validation de
// l'étape se fait dans le composant enfant (wrapper mission), pas ici.
//
// Distinct de `ConfirmDialog` (@zetis/ui) : celui-ci est un dialogue de confirmation à 2 boutons ;
// on le RÉUTILISE tel quel pour le « confirm-on-close » (rendu au-dessus, z-50).

export interface ActivityCloseConfirm {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
}

export interface ActivityModalProps {
  open: boolean;
  onRequestClose: () => void;
  title?: string;
  subtitle?: string;
  /** `activity` = ELI5/quiz (max-w-2xl) ; `wide` = mindmap/React Flow (max-w-5xl). */
  size?: "activity" | "wide";
  /** Activité en cours → demande confirmation avant de fermer. */
  dirty?: boolean;
  confirmClose?: ActivityCloseConfirm;
  children: ReactNode;
}

export function ActivityModal({
  open,
  onRequestClose,
  title,
  subtitle,
  size = "activity",
  dirty = false,
  confirmClose,
  children,
}: ActivityModalProps) {
  const [confirming, setConfirming] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<Element | null>(null);

  // Toute fermeture passe par ici : si l'activité est en cours et qu'un message est fourni,
  // on demande confirmation ; sinon on ferme directement.
  function requestClose() {
    if (dirty && confirmClose) {
      setConfirming(true);
      return;
    }
    onRequestClose();
  }

  // Échap → fermeture (via requestClose). Actif seulement quand la modale est ouverte et qu'aucune
  // confirmation n'est affichée (ConfirmDialog gère sa propre touche Échap).
  useEffect(() => {
    if (!open || confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // deps volontairement larges : requestClose lit dirty/confirmClose à jour

  // Verrou du scroll de fond tant que la modale est ouverte (restaure la valeur précédente).
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Focus initial sur le panneau + restauration du focus précédent à la fermeture.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement;
    panelRef.current?.focus();
    return () => {
      if (restoreFocusRef.current instanceof HTMLElement) restoreFocusRef.current.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      // Pas de `backdrop-blur` NON PLUS sur l'overlay : lui aussi créerait un bloc conteneur pour
      // les descendants `position: fixed` (fantôme de drag). `bg-black/60` assombrit sans flou. Ainsi
      // AUCUN ancêtre entre le fantôme et le viewport n'intercepte son positionnement fixed.
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
      onClick={requestClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Activité"}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        // Pas de `backdrop-blur`/`transform` sur le panneau : ils créeraient un BLOC CONTENEUR pour
        // les descendants `position: fixed` (fantôme de drag du mindmap, toast XP d'ELI5), qui se
        // retrouveraient positionnés par rapport au panneau au lieu du viewport (« loin de la
        // souris »). Le fond `zetis-surface` est opaque → le flou était de toute façon invisible.
        className={`my-8 flex max-h-[calc(100vh-4rem)] w-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-zetis-surface shadow-2xl outline-none motion-safe:animate-[activity-in_0.18s_ease-out] ${
          size === "wide" ? "max-w-5xl" : "max-w-2xl"
        }`}
      >
        <style>{ACTIVITY_MODAL_CSS}</style>
        {/* Barre : titre optionnel + fermeture (toujours présente). */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="truncate text-base font-bold text-zetis-text">{title}</h2>}
            {subtitle && <p className="truncate text-sm text-zetis-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Fermer"
            className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-zetis-muted transition-colors hover:bg-white/10 hover:text-zetis-text"
          >
            ✕
          </button>
        </div>

        {/* Contenu : scrolle À L'INTÉRIEUR du panneau. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>

      {confirmClose && (
        <ConfirmDialog
          open={confirming}
          title={confirmClose.title}
          confirmLabel={confirmClose.confirmLabel}
          cancelLabel={confirmClose.cancelLabel ?? "Continuer"}
          onConfirm={() => {
            setConfirming(false);
            onRequestClose();
          }}
          onCancel={() => setConfirming(false)}
        >
          {confirmClose.body}
        </ConfirmDialog>
      )}
    </div>
  );
}

// `motion-safe:` ne pose l'animation QUE si l'utilisateur n'a pas demandé « moins d'animations ».
// Entrée en OPACITÉ SEULE (pas de `transform`) : un transform, même transitoire, créerait un bloc
// conteneur pour les descendants `position: fixed` (cf. le fond du panneau).
const ACTIVITY_MODAL_CSS = `
@keyframes activity-in { from { opacity: 0; } to { opacity: 1; } }
`;
