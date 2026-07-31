import { Link } from "react-router-dom";
import type { DashboardFocus, DashboardSubject } from "@zetis/types";
import { DashboardCard } from "./DashboardCard";
import { notAddressed } from "../../lib/dashboardDerive";

// « État des notions » — barres empilées par matière.
//
// Le client EMPILE des compteurs déjà décidés par le serveur (ADR-0028 §3 bis) : il ne rejoue
// aucun seuil de maîtrise. Seul « non abordées » est calculé ici, et c'est une soustraction, pas
// un statut.
//
// ⚠️ Le déclencheur de la barre vide est `notions.total === 0`, PAS `has_referentiel` : une
// matière peut avoir ses chapitres sans qu'aucune notion y soit rattachée (cas observé en base).
// Le trou est nommé et mène au Programme — jamais masqué.

const SEGMENTS = [
  { key: "consolidated", label: "consolidées", className: "fill-papa-accent" },
  { key: "fragile", label: "à renforcer", className: "fill-papa-warn" },
  { key: "in_progress", label: "en cours", className: "fill-papa-accent-2/60" },
  { key: "rest", label: "non abordées", className: "fill-papa-border" },
] as const;

interface NotionsStackCardProps {
  subjects: DashboardSubject[];
  focus: DashboardFocus | null;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
}

export function NotionsStackCard({ subjects, focus, selectedSlug, onSelect }: NotionsStackCardProps) {
  const maxTotal = Math.max(1, ...subjects.map((s) => s.notions.total));

  return (
    <DashboardCard
      card="notions"
      title="État des notions"
      tagline="par matière"
      focus={focus}
      className="xl:col-span-5"
    >
      <ul className="flex flex-col gap-2.5">
        {subjects.map((subject) => {
          const { notions } = subject;
          const dimmed = selectedSlug !== null && selectedSlug !== subject.slug;

          if (notions.total === 0) {
            return (
              <li key={subject.slug} className={dimmed ? "opacity-40" : ""}>
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-24 shrink-0 truncate text-papa-muted">{subject.name}</span>
                  <span className="flex-1 rounded-md border border-dashed border-papa-border px-2 py-1.5 text-papa-muted">
                    référentiel non généré ·{" "}
                    <Link to="/programme" className="text-papa-accent hover:underline">
                      ouvrir le programme →
                    </Link>
                  </span>
                </div>
              </li>
            );
          }

          const values: Record<string, number> = {
            consolidated: notions.consolidated,
            fragile: notions.fragile,
            in_progress: notions.in_progress,
            rest: notAddressed(notions),
          };
          let x = 0;
          const width = 100 / maxTotal;

          return (
            <li key={subject.slug} className={dimmed ? "opacity-40" : ""}>
              <button
                type="button"
                aria-pressed={selectedSlug === subject.slug}
                onClick={() => onSelect(subject.slug)}
                className="flex w-full items-center gap-2 text-left text-xs"
              >
                <span className="w-24 shrink-0 truncate text-papa-muted">{subject.name}</span>
                <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-5 flex-1" role="img" aria-label={`${subject.name} : ${notions.consolidated} consolidées, ${notions.fragile} à renforcer, ${notions.in_progress} en cours, ${values.rest} non abordées sur ${notions.total}`}>
                  {SEGMENTS.map((segment) => {
                    const value = values[segment.key];
                    if (value <= 0) return null;
                    const w = value * width;
                    const rect = (
                      <rect key={segment.key} x={x} y={0} width={Math.max(w - 0.4, 0.6)} height={10} rx={1.5} className={segment.className} />
                    );
                    x += w;
                    return rect;
                  })}
                </svg>
                <span className="w-12 shrink-0 text-right font-mono text-papa-muted">
                  {notions.consolidated}/{notions.total}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-papa-muted">
        {SEGMENTS.map((segment) => (
          <li key={segment.key}>
            <svg viewBox="0 0 8 8" className="mr-1.5 inline-block h-2 w-2 align-[-1px]">
              <rect width={8} height={8} rx={2} className={segment.className} />
            </svg>
            {segment.label}
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}
