import { type SchoolYear } from "@zetis/types";
import { Badge, Button } from "@zetis/ui";
import { yearActions } from "../../lib/yearDisplay";

// Ligne compacte d'historique (spec) : libellé · niveau · badge de statut.
// Aucune action destructive en V1 ; « Activer » (non destructif, confirmé en amont
// par la page) est proposé sur les années non actives.
export function YearHistoryRow({
  year,
  onActivate,
}: {
  year: SchoolYear;
  onActivate: () => void;
}) {
  const { badge, canActivate } = yearActions(year.status);
  return (
    <li className="flex items-center justify-between rounded-xl border border-papa-border bg-papa-surface px-4 py-3">
      <span className="text-sm font-medium">
        {year.label} · {year.level}
      </span>
      <span className="flex items-center gap-2">
        <Badge variant={badge.variant}>{badge.label}</Badge>
        {canActivate && (
          <Button variant="outline" onClick={onActivate}>
            Activer
          </Button>
        )}
      </span>
    </li>
  );
}
