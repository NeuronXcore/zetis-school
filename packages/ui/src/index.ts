// @zetis/ui — design system partagé Massimo + Papa (étape 17).
// Les couleurs sont pilotées par des tokens sémantiques (primary, card, border…)
// que chaque app mappe sur sa palette dans son index.css.
export { cn } from "./lib/cn";
export { Button, buttonVariants, type ButtonProps } from "./components/button";
export { Card, CardHeader, CardTitle, CardContent } from "./components/card";
export { Badge, badgeVariants, type BadgeProps } from "./components/badge";
export { Spinner } from "./components/spinner";
export { EmptyState } from "./components/empty-state";
