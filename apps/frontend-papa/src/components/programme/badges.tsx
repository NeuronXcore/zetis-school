import { Badge, type BadgeProps } from "@zetis/ui";
import {
  type ChapterRepartition,
  type ChapterSource,
  type ChapterValidationStatus,
} from "@zetis/types";

// Badges du référentiel (spec page-programme.md : deux badges par ligne, jamais plus).
// IA = violet / Manuel = émeraude ; Validé = émeraude / À valider = ambre / Rejeté = rouge.

const SOURCE: Record<ChapterSource, { label: string; variant: BadgeProps["variant"] }> = {
  generated: { label: "IA", variant: "violet" },
  manual: { label: "Manuel", variant: "success" },
};

const VALIDATION: Record<
  ChapterValidationStatus,
  { label: string; variant: BadgeProps["variant"] }
> = {
  validated: { label: "Validé", variant: "success" },
  pending: { label: "À valider", variant: "warning" },
  rejected: { label: "Rejeté", variant: "danger" },
};

export function SourceBadge({ source }: { source: ChapterSource }) {
  const { label, variant } = SOURCE[source];
  return <Badge variant={variant}>{label}</Badge>;
}

export function ValidationBadge({ status }: { status: ChapterValidationStatus }) {
  const { label, variant } = VALIDATION[status];
  return <Badge variant={variant}>{label}</Badge>;
}

/** Répartition annuelle : `officielle` = repères annuels du BO, sinon indicative. */
export function RepartitionBadge({ repartition }: { repartition: ChapterRepartition }) {
  return repartition === "officielle" ? (
    <Badge variant="info">Répartition officielle</Badge>
  ) : (
    <Badge variant="muted">Répartition indicative</Badge>
  );
}
