import { type SchoolYearSubjectRef } from "@zetis/types";
import { cn } from "@zetis/ui";

// Pills des matières de l'année active (une seule sélectionnée à la fois).
export function SubjectPills({
  subjects,
  selectedSysId,
  onSelect,
}: {
  subjects: SchoolYearSubjectRef[];
  selectedSysId: number | null;
  onSelect: (sysId: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Matières">
      {subjects.map((s) => {
        const active = s.id === selectedSysId;
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(s.id)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              active
                ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200"
                : "border-papa-border bg-papa-surface/60 text-papa-muted hover:bg-white/10 hover:text-papa-text",
            )}
          >
            {/* aria-hidden : le nom accessible du tab reste le nom de la matière. */}
            {s.subject_icon && (
              <span aria-hidden className="mr-1.5">
                {s.subject_icon}
              </span>
            )}
            {s.subject_name}
          </button>
        );
      })}
    </div>
  );
}
