import type { DashboardCardFocus, PageFocus } from "@zetis/types";
import { DashboardCard } from "./DashboardCard";
import { REVIEW_LOAD_WARN } from "../../lib/dashboardDerive";

// « Charge de révision » — cartes SRS dues sur les 14 jours à venir.
//
// La ligne pointillée marque le seuil au-delà duquel une séance devient longue pour un soir de
// semaine. Elle n'est PAS une alerte : un pic se lisse en avançant une révision, pas en la
// supprimant — et c'est ce que dit la note, parce qu'un seuil sans conduite à tenir n'est
// qu'une source d'inquiétude.

const W = 380;
const H = 190;
const PAD = { l: 26, r: 10, t: 12, b: 28 };

interface ReviewLoadCardProps {
  load: number[];
  focus: PageFocus | null;
  onToggleFocus: (next: DashboardCardFocus) => void;
}

export function ReviewLoadCard({ load, focus, onToggleFocus }: ReviewLoadCardProps) {
  const max = Math.max(REVIEW_LOAD_WARN + 4, ...load) + 2;
  const barWidth = (W - PAD.l - PAD.r) / load.length;
  const y = (value: number) => H - PAD.b - (value / max) * (H - PAD.t - PAD.b);
  const total = load.reduce((sum, n) => sum + n, 0);

  return (
    <DashboardCard
      card="charge"
      title="Charge de révision"
      tagline="14 jours à venir"
      focus={focus}
      focusKey="charge"
      onToggleFocus={onToggleFocus}
      className="xl:col-span-4"
      note={`La ligne pointillée marque ${REVIEW_LOAD_WARN} cartes — au-delà, la séance devient longue pour un soir de semaine. Un pic se lisse en avançant une révision, pas en la supprimant.`}
    >
      {total === 0 ? (
        <p className="py-6 text-sm italic text-papa-muted">
          Aucune carte de révision programmée sur les deux prochaines semaines.
        </p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${total} cartes à revoir sur 14 jours`}>
          {[0, Math.round(max / 2), max].map((value) => (
            <g key={value}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(value)} y2={y(value)} className="stroke-papa-border" />
              <text x={PAD.l - 6} y={y(value) + 3} textAnchor="end" className="fill-papa-muted font-mono text-[9.5px]">
                {value}
              </text>
            </g>
          ))}

          <line x1={PAD.l} x2={W - PAD.r} y1={y(REVIEW_LOAD_WARN)} y2={y(REVIEW_LOAD_WARN)} className="stroke-papa-warn/60" strokeDasharray="4 4" />

          {load.map((value, index) => {
            const height = Math.max(H - PAD.b - y(value), value > 0 ? 2 : 0);
            return (
              <rect
                key={index}
                x={PAD.l + index * barWidth + 2}
                y={y(value)}
                width={barWidth - 4}
                height={height}
                rx={3}
                className={value > REVIEW_LOAD_WARN ? "fill-papa-warn/75" : "fill-papa-accent/60"}
              >
                <title>{`J+${index} — ${value} carte${value > 1 ? "s" : ""} à revoir`}</title>
              </rect>
            );
          })}

          {["auj.", "J+7", "J+13"].map((label, k) => {
            const index = [0, 7, 13][k];
            return (
              <text key={label} x={PAD.l + index * barWidth + barWidth / 2} y={H - 9} textAnchor="middle" className="fill-papa-muted font-mono text-[9.5px]">
                {label}
              </text>
            );
          })}
        </svg>
      )}
    </DashboardCard>
  );
}
