// Barre de progression Papa — désormais une fine façade sur la brique partagée
// `GenerationProgress` de @zetis/ui (étape « fiches » : extraction des briques Papa).
// Les tokens sémantiques (primary/border/background/foreground) sont mappés sur la palette
// papa dans index.css → rendu IDENTIQUE à l'ancienne barre (aucune régression capsules).
// L'API historique (`ProgressBar { pct, label }` + `useEstimatedProgress`) est conservée :
// les pages capsules l'importent inchangée, mais passent maintenant par la brique partagée.
import { GenerationProgress, useEstimatedProgress } from "@zetis/ui";

export { useEstimatedProgress };

export function ProgressBar({ pct, label }: { pct: number; label: string }) {
  return <GenerationProgress variant="bar" value={pct} label={label} />;
}
