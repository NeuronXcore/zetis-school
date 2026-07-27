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
  /** `danger` = action destructive (rouges) ; `important` = validation à enjeu :
   *  cadre doré animé (halo pulsé) + bouton doré. */
  tone?: "default" | "danger" | "important";
  onConfirm: () => void;
  onCancel: () => void;
}

// Halo doré pulsé pour `tone="important"` — keyframe injectée localement (aucune dépendance au
// CSS de l'app hôte ; sans effet sur les autres tons).
const GOLDEN_GLOW_KEYFRAMES = `
@keyframes zetis-golden-glow {
  0%, 100% { box-shadow: 0 0 0 1px rgba(251,191,36,0.55), 0 0 22px -6px rgba(251,191,36,0.45); }
  50% { box-shadow: 0 0 0 2px rgba(251,191,36,0.95), 0 0 48px -2px rgba(251,191,36,0.85); }
}`;

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

  const important = tone === "important";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => !busy && onCancel()}
    >
      {important && <style>{GOLDEN_GLOW_KEYFRAMES}</style>}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "w-full max-w-md rounded-2xl border bg-card p-5",
          tone === "danger" && "border-rose-500/50 shadow-[0_0_35px_-8px_rgba(244,63,94,0.45)]",
          important && "border-amber-400",
          tone === "default" && "border-border shadow-2xl",
        )}
        style={
          important
            ? { animation: "zetis-golden-glow 1.8s ease-in-out infinite" }
            : undefined
        }
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className={cn(
            "text-lg font-bold",
            tone === "danger" && "text-rose-300",
            important && "text-amber-300",
            tone === "default" && "text-foreground",
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
              important && "bg-amber-500 text-amber-950 hover:bg-amber-400",
            )}
          >
            {busy ? "En cours…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
