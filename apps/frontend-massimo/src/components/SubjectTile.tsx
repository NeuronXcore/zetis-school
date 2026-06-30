import { Link } from "react-router-dom";
import { type Subject } from "../data/mock";
import { subjectIconFor } from "../lib/subjectIcons";
import { NEON_BAR_FILL } from "./glass";

// Carte d'une matière, style verre (login). Lien vers la page matière dédiée.
export function SubjectTile({ subject }: { subject: Subject }) {
  const iconUrl = subjectIconFor(subject.slug);
  const missionLabel =
    subject.activeMissions > 0
      ? `${subject.activeMissions} mission${subject.activeMissions > 1 ? "s" : ""} en cours`
      : "À jour";

  return (
    <Link
      to={`/subjects/${subject.slug}`}
      className="group flex flex-col rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-xl transition-colors hover:border-cyan-400/40 hover:bg-white/[0.07]"
    >
      <div className="flex items-center justify-between">
        {/* Pastille : cadre verre teinté de la couleur de la matière + halo. */}
        <span
          className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border transition-transform duration-200 group-hover:scale-105"
          style={{
            borderColor: `${subject.color}59`,
            background: `radial-gradient(circle at 50% 22%, ${subject.color}2e, rgba(255,255,255,0.04) 72%)`,
            boxShadow: `0 0 14px ${subject.color}3d, inset 0 1px 0 rgba(255,255,255,0.18)`,
          }}
        >
          {iconUrl ? (
            <img
              src={iconUrl}
              alt=""
              aria-hidden
              className="h-12 w-12 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]"
            />
          ) : (
            <span className="text-4xl">{subject.icon}</span>
          )}
        </span>
        <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-200">
          Niveau {subject.level}
        </span>
      </div>

      <p className="mt-3 font-bold text-slate-100">{subject.name}</p>
      <p className="text-xs text-slate-400">{missionLabel}</p>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className={NEON_BAR_FILL} style={{ width: `${subject.progress}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">{subject.progress}% du chapitre</p>
    </Link>
  );
}
