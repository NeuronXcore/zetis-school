import { subjectIconFor } from "../lib/subjectIcons";
import { cn } from "../lib/cn";

// Pastille ronde portant le pictogramme d'une matière — extraite de `SubjectFilterChips`, dont
// elle était la partie privée, pour que la matrice de Couverture affiche EXACTEMENT le même
// visuel que les pastilles de filtre situées juste au-dessus d'elle sur la page. Deux rendus
// différents du même pictogramme, à quelques pixels l'un de l'autre, se liraient comme deux
// objets distincts.
//
// Repli sur l'initiale si l'asset manque (`subjectIconFor` renvoie `undefined`) — jamais d'emoji
// ni de chemin d'asset codé en dur, cf. design-system.md §Pictogrammes de matière.
//
// Toujours DÉCORATIF (`alt=""`) : partout où il sert, le nom de la matière est écrit juste à
// côté ; un `alt` le doublerait pour les lecteurs d'écran.

const SIZES = {
  sm: "h-6 w-6 text-[11px]",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-lg",
} as const;

export interface SubjectPictogramProps {
  slug: string;
  /** Sert uniquement au repli : son initiale s'affiche si l'asset manque. */
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}

export function SubjectPictogram({ slug, name, size = "sm", className }: SubjectPictogramProps) {
  const icon = subjectIconFor(slug);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted",
        SIZES[size],
        className,
      )}
    >
      {icon ? (
        <img src={icon} alt="" aria-hidden className="h-full w-full object-cover" />
      ) : (
        <span className="font-semibold uppercase">{name.slice(0, 1)}</span>
      )}
    </span>
  );
}
