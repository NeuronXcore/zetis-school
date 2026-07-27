import { type SchoolYearSubjectRef } from "@zetis/types";

// Chips des matières de l'année active (`SchoolYearSubject`) — LECTURE SEULE en V1
// (spec page-annees-scolaires.md : la gestion ajout/retrait est un lot ultérieur).
export function YearSubjectChips({ subjects }: { subjects: SchoolYearSubjectRef[] }) {
  if (subjects.length === 0) return null;
  return (
    <ul aria-label="Matières de l'année" className="flex flex-wrap gap-1.5">
      {subjects.map((s) => (
        <li
          key={s.id}
          className="rounded-full border border-papa-border bg-papa-surface-2 px-2.5 py-0.5 text-xs text-papa-text"
        >
          {s.subject_icon ? (
            <span aria-hidden="true">{s.subject_icon} </span>
          ) : null}
          {s.subject_name}
        </li>
      ))}
    </ul>
  );
}
