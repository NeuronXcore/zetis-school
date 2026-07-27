import { Badge, type BadgeProps } from "@zetis/ui";
import {
  type ChapterRepartition,
  type ChapterSource,
  type ChapterValidationStatus,
  type LessonCreatedBy,
  type LessonStatus,
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

// Badges leçons (Lot 2 Slice B) — mapping asymétrique assumé avec les chapitres
// (spec page-programme.md) : `archived` n'a pas de badge, la leçon n'est jamais affichée.

const LESSON_SOURCE: Record<LessonCreatedBy, { label: string; variant: BadgeProps["variant"] }> = {
  ai: { label: "IA", variant: "violet" },
  parent: { label: "Manuel", variant: "success" },
  imported: { label: "Importé", variant: "info" },
};

const LESSON_STATUS: Record<
  Exclude<LessonStatus, "archived">,
  { label: string; variant: BadgeProps["variant"] }
> = {
  draft: { label: "À valider", variant: "warning" },
  validated: { label: "Validé", variant: "success" },
};

export function LessonSourceBadge({ createdBy }: { createdBy: LessonCreatedBy }) {
  const { label, variant } = LESSON_SOURCE[createdBy];
  return <Badge variant={variant}>{label}</Badge>;
}

export function LessonStatusBadge({ status }: { status: LessonStatus }) {
  if (status === "archived") return null; // hors du flux : jamais rendue (règle pure `lessonActions`)
  const { label, variant } = LESSON_STATUS[status];
  return <Badge variant={variant}>{label}</Badge>;
}
