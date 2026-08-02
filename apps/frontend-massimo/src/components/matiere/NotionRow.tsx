import type { PanoplyNotion } from "@zetis/types";
import { starStyle } from "@zetis/ui/galaxy";
import { HighlightedText } from "./HighlightedText";
import { PanoplyDots } from "./PanoplyDots";

export interface NotionRowProps {
  notion: PanoplyNotion;
  query: string;
  selected: boolean;
  onSelect: () => void;
}

/** Une ligne de notion : état, nom (surligné en recherche), panoplie.
 *
 *  `starStyle` vient du thème partagé de la galaxie — les deux surfaces rendent le même
 *  modèle, elles doivent donc nommer les états de la même façon. Les cinq libellés sont des
 *  libellés d'ENFANT (« À découvrir », « En construction »…), jamais un statut technique ni un
 *  score : `mastery_score` n'est même pas sérialisé par la route. */
export function NotionRow({ notion, query, selected, onSelect }: NotionRowProps) {
  const style = starStyle(notion.status);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-expanded={selected}
      aria-label={`${notion.name} — ${style.label}`}
      className={
        "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors motion-reduce:transition-none " +
        (selected
          ? "bg-zetis-surface-2"
          : "hover:bg-zetis-surface-2 focus-visible:bg-zetis-surface-2")
      }
    >
      <span
        aria-hidden
        className="inline-block shrink-0 rounded-full"
        style={{
          width: 10,
          height: 10,
          backgroundColor: style.color,
          boxShadow: style.glow > 0 ? `0 0 ${6 * style.glow}px ${style.color}` : undefined,
        }}
      />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
        <HighlightedText text={notion.name} query={query} />
      </span>
      <span className="shrink-0 text-[11px] text-zetis-muted" aria-hidden>
        {style.label}
      </span>
      <PanoplyDots actions={notion.actions} />
    </button>
  );
}
