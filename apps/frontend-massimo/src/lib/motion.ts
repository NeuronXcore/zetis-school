// Détection `prefers-reduced-motion`, sûre hors navigateur (jsdom des tests n'implémente
// pas `matchMedia`). Sans support → on considère l'animation active (défaut visuel Massimo).
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
