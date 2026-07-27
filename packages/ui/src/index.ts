// @zetis/ui — design system partagé Massimo + Papa (étape 17).
// Les couleurs sont pilotées par des tokens sémantiques (primary, card, border…)
// que chaque app mappe sur sa palette dans son index.css.
export { cn } from "./lib/cn";
export { Button, buttonVariants, type ButtonProps } from "./components/button";
export { Card, CardHeader, CardTitle, CardContent } from "./components/card";
export { Badge, badgeVariants, type BadgeProps } from "./components/badge";
export { Input, type InputProps } from "./components/input";
export { Select, type SelectProps } from "./components/select";
export { ConfirmDialog, type ConfirmDialogProps } from "./components/confirm-dialog";
// Briques de pilotage Papa partagées (fiches, mindmaps ; capsules réutilisent GenerationProgress).
export {
  GenerationProgress,
  useEstimatedProgress,
  type GenerationProgressProps,
} from "./components/generation-progress";
export {
  ContentLifecycleActions,
  ContentStatusBadge,
  type ContentLifecycleActionsProps,
  type ContentStatus,
} from "./components/content-lifecycle-actions";
export { Spinner } from "./components/spinner";
export { EmptyState } from "./components/empty-state";
// Célébration « mini-victoire » (capsule créée / nouvelle) + réglage son partagé.
export {
  CelebrationProvider,
  useCelebrate,
  type CelebrateOptions,
} from "./components/celebration";
export { SoundToggle } from "./components/sound-toggle";
export {
  isSoundEnabled,
  setSoundEnabled,
  onSoundChange,
  playCelebrationChime,
} from "./lib/sound";
