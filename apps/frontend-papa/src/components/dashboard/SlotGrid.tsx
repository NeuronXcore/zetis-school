import { HEAT_CLASSES, heatLevel } from "../../lib/heatmap";

// Semaine type : 8 créneaux de 2 h (8 h → 24 h) × 7 jours, en CSS Grid pur.
//
// MÊME échelle de couleur que la vue calendrier (`heatLevel` / `HEAT_CLASSES`, déjà testés) :
// deux échelles sur une seule carte obligeraient à réapprendre la lecture en changeant d'onglet.
//
// 8 h → 24 h et non 8 h → 22 h : la maquette porte huit étiquettes dont la dernière est 22 h,
// donc la plage va jusqu'à minuit (adr-0028 §6). Les minutes de 0 h à 8 h ne sont pas dans cette
// grille — elles sont annoncées en note plutôt que repliées dans un créneau qui les daterait
// faussement.

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const SLOT_LABELS = ["8 h", "10 h", "12 h", "14 h", "16 h", "18 h", "20 h", "22 h"];

interface SlotGridProps {
  /** Matrice 8 × 7 de minutes moyennes. */
  matrix: number[][];
}

export function SlotGrid({ matrix }: SlotGridProps) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-max gap-1" style={{ gridTemplateColumns: "38px repeat(7, 1fr)" }}>
        <span />
        {DAYS.map((day) => (
          <span key={day} className="pb-0.5 text-center font-mono text-[11px] text-papa-muted">
            {day}
          </span>
        ))}

        {matrix.map((row, slot) => (
          <Row key={slot} label={SLOT_LABELS[slot]} values={row} />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-end gap-1.5 text-xs text-papa-muted">
        <span>moins</span>
        {([0, 1, 2, 3, 4] as const).map((level) => (
          <span key={level} className={`h-[13px] w-4 rounded-[3px] ${HEAT_CLASSES[level]}`} />
        ))}
        <span>plus · minutes actives moyennes</span>
      </div>
    </div>
  );
}

function Row({ label, values }: { label: string; values: number[] }) {
  return (
    <>
      <span className="flex items-center justify-end pr-1.5 font-mono text-[11px] text-papa-muted">
        {label}
      </span>
      {values.map((minutes, day) => {
        // Le `title` porte la valeur : l'information ne doit jamais tenir à la seule couleur.
        const text = `${DAYS[day]} ${label} — ${
          minutes > 0 ? `${minutes} min en moyenne` : "aucune séance"
        }`;
        return (
          <span
            key={day}
            title={text}
            aria-label={text}
            className={`h-6 rounded-[5px] ${HEAT_CLASSES[heatLevel(minutes)]}`}
          />
        );
      })}
    </>
  );
}
