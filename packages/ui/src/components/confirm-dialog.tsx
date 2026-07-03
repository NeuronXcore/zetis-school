import { type ReactNode, useEffect } from "react";
import { Button } from "./button";

// Modal de confirmation partagé (tokens sémantiques — s'adapte au thème Massimo/Papa).
// Pas de lib externe : overlay fixe + carte, Échap ou clic overlay = annuler.
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Corps libre : texte, décomptes, choix de portée… */
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Désactive les boutons pendant l'action (ex. appel API en cours). */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Annuler",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        {children && <div className="mt-3 text-sm text-muted-foreground">{children}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? "En cours…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
