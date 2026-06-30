// Police auto-hébergée (local-first, pas d'appel Google Fonts au runtime).
import "@fontsource/syncopate/700.css";
import "@fontsource/michroma/400.css";
import "./brand.css";

export type LogoZetisSize = "sm" | "md" | "lg";

export interface LogoZetisProps {
  /** Taille du wordmark. */
  size?: LogoZetisSize;
  /** Halo néon (pulsation respectant `prefers-reduced-motion`). */
  glow?: boolean;
  /** Remplissage en dégradé bleu → violet (sinon couleur pleine). */
  gradient?: boolean;
  className?: string;
}

// Tailles → fontSize (le tracking 0.35em vit dans brand.css).
const SIZE_CLASS: Record<LogoZetisSize, string> = {
  sm: "text-2xl",
  md: "text-4xl",
  lg: "text-6xl md:text-7xl",
};

/**
 * Wordmark ZETIS néon (présentationnel pur).
 * Lettres capitales monoline (Syncopate), tracking large, dégradé bleu → violet, glow.
 */
export function LogoZetis({
  size = "md",
  glow = true,
  gradient = true,
  className,
}: LogoZetisProps) {
  const classes = [
    "logo-zetis",
    SIZE_CLASS[size],
    gradient ? "logo-zetis--gradient" : "logo-zetis--solid",
    glow ? "logo-zetis--glow" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  // role="img" + aria-label : annoncé « ZETIS » d'un bloc (le tracking ne le fait pas
  // épeler lettre par lettre), tout en restant sémantique (non purement décoratif).
  return (
    <span role="img" aria-label="ZETIS" className={classes}>
      ZETIS
    </span>
  );
}
