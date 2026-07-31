import { ActivityEventIcon } from "@zetis/ui";
import type { ActivityEntry } from "@zetis/types";
import { routeLabel } from "../../lib/routeLabels";

// Une ligne du journal d'activité : heure · icône · libellé · matière/notion · XP.
// Rendue à l'identique par le panneau détail-jour du dashboard et par la timeline d'une session
// du cahier de bord — un même acte se lit pareil aux deux endroits.

interface ActivityEntryRowProps {
  entry: ActivityEntry;
  /** slug → nom affichable. Le serveur sert le slug (identifiant stable), Papa lit le nom. */
  subjectNames: Map<string, string>;
}

export function ActivityEntryRow({ entry, subjectNames }: ActivityEntryRowProps) {
  // Sur une navigation, `detail` est la ROUTE BRUTE servie par le serveur : on la traduit ici,
  // au seul endroit qui l'affiche. Deux routes peuvent désigner la même page (`/progression` et
  // `/galaxy` depuis le 2026-07-31) — cf. `lib/routeLabels.ts`.
  const detail =
    entry.event_type === "page_viewed" && entry.detail ? routeLabel(entry.detail) : entry.detail;

  const context = [
    entry.subject_slug ? (subjectNames.get(entry.subject_slug) ?? entry.subject_slug) : null,
    entry.skill_name,
    detail,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-2.5 border-b border-papa-surface-2 py-1.5 text-sm last:border-b-0">
      <span className="min-w-[44px] tabular-nums text-papa-muted">{entry.time}</span>
      <ActivityEventIcon eventType={entry.event_type} className="text-papa-muted" />
      <span className="flex-1">
        {entry.label}
        {context.length > 0 && <span className="text-papa-muted"> · {context.join(" · ")}</span>}
      </span>
      <span className="min-w-[56px] text-right font-semibold text-papa-accent">
        {entry.xp ? `+${entry.xp} XP` : ""}
      </span>
    </div>
  );
}
