import { Link } from "react-router-dom";
import { type Subject } from "../data/mock";

export function SubjectCard({ subject }: { subject: Subject }) {
  const missionLabel =
    subject.activeMissions > 0
      ? `${subject.activeMissions} mission${subject.activeMissions > 1 ? "s" : ""}`
      : "À jour";

  return (
    <Link
      to={`/subjects/${subject.slug}`}
      className="block rounded-2xl border border-zetis-border bg-zetis-surface p-4 transition-transform hover:scale-[1.02]"
    >
      <div className="flex items-center justify-between">
        <span className="text-2xl">{subject.icon}</span>
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: subject.color }} />
      </div>
      <p className="mt-2 font-bold">{subject.name}</p>
      <p className="text-xs text-zetis-muted">
        Niveau {subject.level} · {subject.xp} XP
      </p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zetis-surface-2">
        <div
          className="h-full rounded-full"
          style={{ width: `${subject.progress}%`, backgroundColor: subject.color }}
        />
      </div>
      <p className="mt-2 text-xs text-zetis-muted">
        {missionLabel} · révision {subject.nextReview}
      </p>
    </Link>
  );
}
