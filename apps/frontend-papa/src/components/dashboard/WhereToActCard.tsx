import { Link } from "react-router-dom";
import { SubjectPictogram, subjectColorFor } from "@zetis/ui";
import type { DashboardFocus, DashboardPeriod, DashboardSubject } from "@zetis/types";
import { DashboardCard } from "./DashboardCard";

// « Où agir » — nuage temps actif × taux de consolidation, aire ∝ nombre de notions.
//
// Division du travail avec le Conseil de classe (ADR-0028 §7) : ce nuage **repère** l'anomalie
// (mesure, coup d'œil quotidien), le Conseil l'**explique** (interprétation écrite, trimestrielle).
//
// Deux sorties de niveaux différents :
//   · clic sur une bulle → filtre local instantané, on reste dans le cockpit ;
//   · CTA               → `/conseil?subject=&period=`, on change de surface.
//
// Le deep-link PORTE la période, sinon le Conseil raconterait un trimestre quand Papa regardait
// sept jours.

const W = 400;
const H = 250;
const PAD = { l: 44, r: 18, t: 14, b: 36 };

interface WhereToActCardProps {
  subjects: DashboardSubject[];
  period: DashboardPeriod;
  focus: DashboardFocus | null;
  selected: DashboardSubject | null;
  onSelect: (slug: string) => void;
}

export function WhereToActCard({ subjects, period, focus, selected, onSelect }: WhereToActCardProps) {
  const plotted = subjects.filter((s) => s.notions.total > 0);
  const maxMinutes = Math.max(1, ...plotted.map((s) => s.minutes[period] ?? 0)) * 1.15;

  const x = (minutes: number) => PAD.l + (minutes / maxMinutes) * (W - PAD.l - PAD.r);
  const y = (percent: number) => H - PAD.b - (percent / 100) * (H - PAD.t - PAD.b);

  return (
    <DashboardCard
      card="ou-agir"
      title="Où agir"
      tagline="temps investi × consolidation"
      focus={focus}
      className="xl:col-span-5"
      note="Chaque bulle est une matière ; sa taille est le nombre de notions au programme. En bas à droite : beaucoup de temps, peu de consolidation — c'est là qu'une mission change quelque chose."
    >
      {plotted.length === 0 ? (
        <p className="py-6 text-sm italic text-papa-muted">
          Aucune matière n'a encore de notions au programme.
        </p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Temps actif par matière croisé avec le taux de notions consolidées">
          <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="stroke-papa-border" />
          <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} className="stroke-papa-border" />

          {/* Quadrants : les médianes découpent la zone d'alerte, annotée en toutes lettres —
              une position dans un nuage ne se lit pas d'elle-même. */}
          <line x1={x(maxMinutes * 0.42)} x2={x(maxMinutes * 0.42)} y1={PAD.t} y2={H - PAD.b} className="stroke-papa-border/60" strokeDasharray="3 4" />
          <line x1={PAD.l} x2={W - PAD.r} y1={y(35)} y2={y(35)} className="stroke-papa-border/60" strokeDasharray="3 4" />
          <text x={W - PAD.r - 4} y={H - PAD.b - 8} textAnchor="end" className="fill-papa-warn/80 text-[10px]">
            beaucoup de temps, peu d'ancrage
          </text>

          {[0, 25, 50, 75, 100].map((percent) => (
            <text key={percent} x={PAD.l - 8} y={y(percent) + 3} textAnchor="end" className="fill-papa-muted font-mono text-[9.5px]">
              {percent}%
            </text>
          ))}
          <text x={(PAD.l + W - PAD.r) / 2} y={H - 8} textAnchor="middle" className="fill-papa-muted font-mono text-[9.5px]">
            temps actif sur la période →
          </text>

          {plotted.map((subject) => {
            const percent = Math.round((subject.notions.consolidated / subject.notions.total) * 100);
            const radius = 6 + Math.sqrt(subject.notions.total) * 2.2;
            const dimmed = selected !== null && selected.slug !== subject.slug;
            const color = subjectColorFor(subject.slug, subject.color);
            return (
              <g key={subject.slug} className="cursor-pointer" onClick={() => onSelect(subject.slug)}>
                <circle
                  cx={x(subject.minutes[period] ?? 0)}
                  cy={y(percent)}
                  r={radius}
                  fill={color}
                  stroke={color}
                  strokeWidth={1.5}
                  opacity={dimmed ? 0.2 : 0.55}
                >
                  <title>{`${subject.name} — ${subject.minutes[period]} min · ${percent} % consolidé · ${subject.notions.total} notions`}</title>
                </circle>
                <text
                  x={x(subject.minutes[period] ?? 0)}
                  y={y(percent) - radius - 5}
                  textAnchor="middle"
                  opacity={dimmed ? 0.3 : 0.9}
                  className="fill-papa-muted font-mono text-[9.5px]"
                >
                  {subject.name.slice(0, 12)}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {/* CTA à DEUX ÉTATS, toujours présent : le faire apparaître décalerait la mise en page au
          moment même où Papa vise une bulle. Le pictogramme qui se colore signale que le lien
          s'est PRÉCISÉ (ADR-0028 §8). */}
      <Link
        to={selected ? `/conseil?subject=${selected.slug}&period=${period}` : "/conseil"}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
          selected
            ? "bg-papa-accent text-[#042f1f]"
            : "border border-papa-border bg-papa-surface-2 text-papa-muted hover:border-papa-accent/50 hover:text-papa-text"
        }`}
      >
        {selected ? (
          <>
            {/* Pictogramme via `subjectIcons` — jamais d'emoji codé en dur. */}
            <SubjectPictogram slug={selected.slug} name={selected.name} size="sm" />
            Analyser {selected.name} dans le conseil de classe
          </>
        ) : (
          <>
            <span className="opacity-50 grayscale">✦</span>
            Conseil de classe — toutes matières
          </>
        )}
        <span className="opacity-70">→</span>
      </Link>
    </DashboardCard>
  );
}
