// Les matières en KPI cliquables, sous la galaxie (ADR-0024).
//
// Chaque puce porte le PICTOGRAMME DE MARQUE de la matière (`subjectIconFor`, le même que
// partout ailleurs — jamais un emoji, cf. design-system.md §Pictogrammes de matière) et son
// COMPTE d'étoiles allumées : un compte, jamais un pourcentage, jamais un classement.
//
// Elles servent d'entrée directe : toucher une matière ouvre sa constellation, sans avoir à
// viser une sphère dans le graphe — ce qui est difficile au doigt quand la galaxie est dense.
import type { GalaxySubject } from "@zetis/types";
import { subjectIconFor } from "../../lib/subjectIcons";

export interface SubjectKpiRowProps {
  subjects: GalaxySubject[];
  onOpen: (slug: string) => void;
}

export function SubjectKpiRow({ subjects, onOpen }: SubjectKpiRowProps) {
  // Une matière sans rien de validé n'a pas de constellation à ouvrir : on ne la propose pas
  // plutôt que de l'afficher morte.
  const openable = subjects.filter((s) => s.total > 0);
  if (openable.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2" aria-label="Tes matières">
      {openable.map((subject) => {
        const icon = subjectIconFor(subject.slug);
        return (
          <li key={subject.slug}>
            <button
              type="button"
              onClick={() => onOpen(subject.slug)}
              aria-label={`${subject.name} — ${subject.lit} étoiles allumées, ouvrir`}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-zetis-border bg-zetis-surface-2 py-1.5 pl-1.5 pr-3.5 text-xs font-bold transition hover:border-zetis-accent-2"
            >
              {icon ? (
                <img src={icon} alt="" aria-hidden className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <span
                  aria-hidden
                  className="grid h-6 w-6 place-items-center rounded-full bg-zetis-surface"
                >
                  {subject.name.charAt(0).toUpperCase()}
                </span>
              )}
              {subject.name}
              <span className="text-zetis-muted">· {subject.lit}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
