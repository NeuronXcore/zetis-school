import { type ReactNode, useEffect } from "react";
import { cn } from "../lib/cn";
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
  /** `danger` = action destructive (suppression) : cadre, halo et bouton de
   *  confirmation dans les rouges. */
  tone?: "default" | "danger";
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
  tone = "default",
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
        className={cn(
          "w-full max-w-md rounded-2xl border bg-card p-5",
          tone === "danger"
            ? "border-rose-500/50 shadow-[0_0_35px_-8px_rgba(244,63,94,0.45)]"
            : "border-border shadow-2xl",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className={cn(
            "text-lg font-bold",
            tone === "danger" ? "text-rose-300" : "text-foreground",
          )}
        >
          {title}
        </h2>
        {children && <div className="mt-3 text-sm text-muted-foreground">{children}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={busy}
            autoFocus
            className={cn(
              tone === "danger" && "bg-rose-600 text-rose-50 hover:bg-rose-500",
            )}
          >
            {busy ? "En cours…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
