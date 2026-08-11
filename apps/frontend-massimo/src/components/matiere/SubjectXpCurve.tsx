import type { XpHistoryDay } from "../../lib/gamification";
import { GlassPanel } from "../glass";

export interface SubjectXpCurveProps {
  days: XpHistoryDay[];
  subjectName: string;
}

const W = 520;
const H = 120;
const PAD = 6;

/** Ce que Massimo a accumulé dans cette matière, jour après jour — **en CUMUL**.
 *
 *  🔴 **Le cumul n'est pas un choix esthétique, c'est le garde-fou.** Le contrat de
 *  `/api/gamification/history` est une **série creuse** : les jours sans gain sont OMIS, jamais
 *  renvoyés à zéro (addendum ADR-0024 « Accueil vivant » §A — la donnée d'absence n'existe pas,
 *  pour qu'aucun client ne puisse en dessiner une).
 *
 *  Tracée en gains journaliers, cette courbe redescendrait à chaque jour sans travail, et chaque
 *  creux se lirait comme un manque — le cadrage de perte que tout ce contrat existe pour empêcher.
 *  En cumul, elle **ne peut que monter ou rester plate**. Un jour sans travail ne retire rien.
 *
 *  ⚠️ **Ne jamais densifier la série** pour « lisser » la courbe : ce serait réintroduire les
 *  zéros par la porte de derrière. Les points sont posés à intervalles réguliers, sans axe de
 *  temps — comme « Mon ciel », et pour la même raison : sans axe, il n'y a aucun intervalle vide
 *  à lire. */
export function SubjectXpCurve({ days, subjectName }: SubjectXpCurveProps) {
  // Un seul point ne fait pas une courbe — et deux traits qui se croisent sur un unique gain
  // raconteraient une progression qui n'a pas eu lieu.
  if (days.length < 2) return null;

  let running = 0;
  const cumulative = days.map((day) => (running += day.xp));
  const top = cumulative[cumulative.length - 1];

  const points = cumulative.map((value, index) => {
    const x = PAD + (index / (cumulative.length - 1)) * (W - 2 * PAD);
    const y = H - PAD - (value / top) * (H - 2 * PAD);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <GlassPanel className="p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-zetis-muted">
          Tes XP en {subjectName}
        </h2>
        <span className="text-xs text-zetis-muted">
          {days.length} jour{days.length > 1 ? "s" : ""} de travail
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-28 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Tes XP en ${subjectName} montent jusqu'à ${top}, sur ${days.length} jours de travail`}
      >
        <defs>
          <linearGradient id="zetis-xp-curve" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-zetis-accent-2)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-zetis-accent-2)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          points={`${PAD},${H - PAD} ${points.join(" ")} ${W - PAD},${H - PAD}`}
          fill="url(#zetis-xp-curve)"
        />
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke="var(--color-zetis-accent-2)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </GlassPanel>
  );
}
