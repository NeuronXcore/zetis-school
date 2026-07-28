import { type ReactElement } from "react";
import { cn } from "../lib/cn";

// Icône d'un événement du journal d'activité, par `event_type`. Module PARTAGÉ : le panneau
// détail-jour du dashboard (slice B) et la timeline des sessions du cahier de bord (slice C)
// affichent le même signe pour le même acte.
//
// POURQUOI DU SVG INLINE ET PAS LUCIDE. La spec de la slice demandait des icônes Lucide, mais
// `lucide-react` n'est présent NULLE PART dans le monorepo (aucun package.json, absent du
// lockfile) et la même spec impose « zéro dépendance nouvelle ». Les deux consignes ne pouvaient
// pas être tenues ensemble ; le SVG inline les respecte toutes les deux et évite l'emoji codé en
// dur, proscrit par le design system. Les tracés reprennent la géométrie Lucide (24×24, stroke
// `currentColor`, bouts arrondis) : si `lucide-react` est ajouté un jour, seul CE fichier change.

const paths: Record<string, ReactElement> = {
  // key — connexion
  login: (
    <>
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
      <path d="m21 2-9.6 9.6" />
      <circle cx="7.5" cy="15.5" r="5.5" />
    </>
  ),
  // mouse-pointer-click — navigation
  page_viewed: (
    <>
      <path d="M9 9l5 12 1.774-5.226L21 14 9 9z" />
      <path d="M16.071 16.071l4.243 4.243" />
    </>
  ),
  // book-open — cours lu
  lesson_viewed: (
    <>
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </>
  ),
  // file-text — fiche de révision
  fiche_viewed: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
      <path d="M8 13h8M8 17h8M8 9h2" />
    </>
  ),
  // circle-check-big — quiz
  quiz_attempted: (
    <>
      <path d="M21.801 10A10 10 0 1 1 17 3.335" />
      <path d="m9 11 3 3L22 4" />
    </>
  ),
  // message-circle — explication demandée
  eli5_requested: <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" />,
  // mic — verbalisation reverse
  reverse_eli5: (
    <>
      <path d="M12 19v3" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <rect x="9" y="2" width="6" height="13" rx="3" />
    </>
  ),
  // layers — révision SRS (une pile de cartes)
  review_attempted: (
    <>
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
      <path d="m6.08 12-3.5 1.6a1 1 0 0 0 0 1.81l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9a1 1 0 0 0 0-1.83L17.9 12" />
    </>
  ),
  // target — mission terminée
  mission_verdict: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  // footprints — étape de mission
  mission_step_view: (
    <>
      <path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z" />
      <path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z" />
    </>
  ),
};

// Repli : un point neutre. Le journal accueillera d'autres producteurs que ceux de ce chantier —
// un type inconnu doit rester visible, pas disparaître ni casser la ligne.
const fallback = <circle cx="12" cy="12" r="4" />;

export interface ActivityEventIconProps {
  eventType: string;
  className?: string;
}

export function ActivityEventIcon({ eventType, className }: ActivityEventIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("h-4 w-4 shrink-0", className)}
    >
      {paths[eventType] ?? fallback}
    </svg>
  );
}
