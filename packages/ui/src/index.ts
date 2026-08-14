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
// Sortie de plein écran — partagée depuis le 2026-08-12 (ADR-0052) : elle vivait sous
// `frontend-massimo/components/galaxy/` avec DEUX consommateurs (GalaxyPage, GalaxyReplayModal),
// et `MindmapWorkspace` (packages/ui) en a besoin sans pouvoir importer depuis une app.
export {
  CloseFullscreenButton,
  type CloseFullscreenButtonProps,
} from "./components/close-fullscreen-button";
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
// Sparkline générique (SVG inline, zéro dépendance) — chantier « Dashboard Papa v2 ».
export { Sparkline, type SparklineProps } from "./components/sparkline";

// Placement de jours sur une grille calendrier (fonctions pures). Partagé par la heatmap de Papa
// et « Mon ciel » de Massimo — deux `startOfWeek` dans un même dépôt finiraient par diverger.
// ⚠️ `buildSparseCalendar` ne fabrique JAMAIS de jour vide : cf. son docstring.
export {
  buildSparseCalendar,
  startOfWeek,
  toLocalIso,
  type CalendarSlot,
  type SparseCalendar,
} from "./lib/calendarGrid";
export { EmptyState } from "./components/empty-state";
// Pictogrammes de matière : résolveur + assets partagés (les `lib/subjectIcons.ts` des deux apps
// ré-exportent ceci). Chantier « Activité » : pastilles de filtre et icônes d'événements,
// communes au dashboard (slice B) et au cahier de bord (slice C).
export { subjectIconFor } from "./lib/subjectIcons";
// Couleur de matière : `Subject.color` fait autorité, ceci n'est qu'un repli déterministe.
export { subjectColorFor } from "./lib/subjectColors";
export {
  SubjectFilterChips,
  type SubjectFilterChipsProps,
  type SubjectFilterOption,
} from "./components/subject-filter-chips";
export { SubjectPictogram, type SubjectPictogramProps } from "./components/subject-pictogram";
export { ActivityEventIcon, type ActivityEventIconProps } from "./components/activity-icons";
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
// « Une seule façon de trouver » (ADR-0057) : le groupement matière → chapitre + la recherche,
// remontés ici depuis DEUX copies identiques (app Massimo et app Papa).
export { normalizeSearch } from "./lib/normalizeSearch";
export {
  groupBySubjectChapter,
  NO_CHAPTER_LABEL,
  type GroupableItem,
  type GroupOptions,
  type ChapterGroup,
  type SubjectGroup,
} from "./lib/groupBySubjectChapter";
