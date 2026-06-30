import { cn } from "../lib/cn";

interface SpinnerProps {
  className?: string;
  size?: number;
}

// Indicateur de chargement minimal (anneau qui tourne).
export function Spinner({ className, size = 20 }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Chargement"
      style={{ width: size, height: size }}
      className={cn(
        "inline-block animate-spin rounded-full border-2 border-muted border-t-primary",
        className,
      )}
    />
  );
}
