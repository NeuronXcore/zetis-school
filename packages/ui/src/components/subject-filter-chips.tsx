import { subjectIconFor } from "../lib/subjectIcons";
import { cn } from "../lib/cn";

// Rangée de pastilles « Toutes + matières » filtrant une vue par matière. Partagée par le bloc
// Régularité du dashboard et la vue Sessions du cahier de bord : une seule façon de choisir une
// matière côté Papa.
//
// Composant CONTRÔLÉ (`value`/`onChange`) : il ne détient aucun état, ne connaît pas ce qu'il
// filtre, et ne déclenche aucun fetch. L'appelant décide ce que « matière sélectionnée » veut
// dire pour lui.
//
// Pictogrammes via `subjectIconFor` (repli sur l'initiale si l'asset manque) — jamais d'emoji
// ni de chemin d'asset codé en dur, cf. design-system.md §Pictogrammes de matière.

export interface SubjectFilterOption {
  id: number;
  slug: string;
  name: string;
}

export interface SubjectFilterChipsProps {
  subjects: SubjectFilterOption[];
  /** `null` = « Toutes ». */
  value: number | null;
  onChange: (subjectId: number | null) => void;
  /** Libellé de la pastille « tout afficher ». */
  allLabel?: string;
  className?: string;
}

function Pictogram({ slug, name }: { slug: string; name: string }) {
  const icon = subjectIconFor(slug);
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
      {icon ? (
        // Décoratif : le nom de la matière est déjà lisible juste à côté, un alt le doublerait
        // pour les lecteurs d'écran.
        <img src={icon} alt="" aria-hidden className="h-full w-full object-cover" />
      ) : (
        <span className="text-[11px] font-semibold uppercase">{name.slice(0, 1)}</span>
      )}
    </span>
  );
}

export function SubjectFilterChips({
  subjects,
  value,
  onChange,
  allLabel = "Toutes",
  className,
}: SubjectFilterChipsProps) {
  const chip = (active: boolean) =>
    cn(
      "inline-flex items-center gap-2 rounded-full border py-1 pl-1.5 pr-3 text-sm transition-colors",
      // `aria-pressed` porte l'état pour les lecteurs d'écran ; la couleur ne le porte jamais seule.
      active
        ? "border-primary bg-primary/10 font-semibold text-primary"
        : "border-border text-muted-foreground hover:border-primary/60",
    );

  return (
    // Un groupe de boutons-bascule : chaque pastille garde la tabulation native (pas de
    // gestion clavier maison à maintenir), `aria-pressed` dit laquelle est active.
    <div role="group" aria-label="Filtrer par matière" className={cn("flex flex-wrap gap-2", className)}>
      <button
        type="button"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
        className={cn(chip(value === null), "px-3.5")}
      >
        {allLabel}
      </button>
      {subjects.map((subject) => (
        <button
          key={subject.id}
          type="button"
          aria-pressed={value === subject.id}
          onClick={() => onChange(subject.id)}
          className={chip(value === subject.id)}
          title={subject.name}
        >
          <Pictogram slug={subject.slug} name={subject.name} />
          {subject.name}
        </button>
      ))}
    </div>
  );
}
