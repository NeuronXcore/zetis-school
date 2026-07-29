import { type AgendaItemPilot } from "@zetis/types";
import { type AgendaColumn, loadPercent } from "../../lib/agendaModel";

// Charge de la semaine — registre ANALYTIQUE (tableau, sept colonnes).
//
// Ce n'est PAS la bande de Massimo : les deux interfaces ne se mélangent jamais (ADR-0002), et
// l'objet lu n'est pas le même — ici on lit une charge et un écart, là-bas on s'oriente.
//
// L'écart déclaré / fait **se lit ici**. Il ne produit aucune alerte, aucun badge rouge, aucun
// compteur d'arriéré : l'ADR-0025 §3 interdit d'émettre un événement d'échec, l'UI ne doit pas
// le réintroduire par la couleur.

interface Props {
  columns: AgendaColumn[];
  selectedId: number | null;
  onSelect: (item: AgendaItemPilot) => void;
}

export function AgendaWeekBoard({ columns, selectedId, onSelect }: Props) {
  const maxCount = Math.max(1, ...columns.map((column) => column.items.length));

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {columns.map((column) => (
        <div
          key={column.date}
          className={`rounded-xl border p-2 ${
            column.isToday
              ? "border-papa-accent bg-papa-accent/5"
              : "border-papa-border bg-papa-surface"
          }`}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-papa-muted">
            {column.weekdayLabel}
          </p>
          <p className={`text-lg font-bold ${column.isToday ? "text-papa-accent" : ""}`}>
            {column.dayNumber}
          </p>

          {/* Trait de CHARGE : nombre d'échéances, jamais une performance. */}
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-papa-surface-2">
            <div
              className="h-full rounded-full bg-papa-accent/60"
              style={{ width: `${loadPercent(column.items.length, maxCount)}%` }}
            />
          </div>

          <div className="mt-2 flex flex-col gap-1.5">
            {column.items.map((item) => (
              <AgendaBoardItem
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                onSelect={() => onSelect(item)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AgendaBoardItem({
  item,
  selected,
  onSelect,
}: {
  item: AgendaItemPilot;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{ borderLeftColor: item.subject?.color ?? undefined }}
      className={`w-full rounded-md border-l-2 bg-papa-surface-2 px-2 py-1.5 text-left transition-colors hover:bg-papa-surface-2/70 ${
        selected ? "ring-1 ring-papa-accent" : ""
      } ${
        // Masqué par Massimo : atténué, JAMAIS disparu. Le parent voit tout, l'enfant voit ce
        // qui le concerne (asymétrie assumée, ADR-0025 §2c).
        item.dismissed_at ? "opacity-50" : ""
      } ${item.subject?.color ? "" : "border-l-papa-border"}`}
    >
      <p className="text-xs font-medium leading-snug">{item.label}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        <AgendaTags item={item} />
      </div>
    </button>
  );
}

/** Étiquettes d'un item. Le vocabulaire est volontairement neutre : « à faire » et non
 *  « en retard », « ✓ fait » et non un score. */
export function AgendaTags({ item }: { item: AgendaItemPilot }) {
  return (
    <>
      {item.kind === "controle" && <Tag className="bg-fuchsia-500/15 text-fuchsia-300">contrôle</Tag>}
      {item.kind === "rendu" && <Tag className="bg-sky-500/15 text-sky-300">rendu</Tag>}
      <Tag
        className={
          item.created_by === "parent"
            ? "bg-papa-accent/15 text-papa-accent"
            : "bg-papa-surface text-papa-muted"
        }
      >
        {item.created_by === "parent" ? "par vous" : "par Massimo"}
      </Tag>
      {item.edited_by_parent_at && (
        <Tag className="bg-amber-500/15 text-amber-300">corrigé</Tag>
      )}
      {item.dismissed_at && <Tag className="bg-papa-surface text-papa-muted">masqué</Tag>}
      <Tag
        className={
          item.done_at
            ? "bg-emerald-500/15 text-emerald-300"
            : // Pas de rouge, pas d'ambre : « à faire » est un état neutre, pas un manquement.
              "bg-papa-surface text-papa-muted"
        }
      >
        {item.done_at ? "✓ fait" : "à faire"}
      </Tag>
    </>
  );
}

function Tag({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${className}`}>
      {children}
    </span>
  );
}
