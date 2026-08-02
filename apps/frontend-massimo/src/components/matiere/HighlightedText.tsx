import type { ReactNode } from "react";
import { matchRanges } from "../../lib/searchFold";

export interface HighlightedTextProps {
  text: string;
  query: string;
}

/** Surligne les correspondances dans le texte ORIGINAL — accents compris.
 *
 *  Les plages viennent de `matchRanges`, qui tient une carte d'offsets : sans elle, un index
 *  trouvé dans la forme pliée désignerait le mauvais caractère, et le `<mark>` glisserait d'un
 *  cran par accent — précisément sur les mots que Massimo tape sans accent. */
export function HighlightedText({ text, query }: HighlightedTextProps) {
  const ranges = matchRanges(text, query);
  if (ranges.length === 0) return <>{text}</>;

  const out: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, i) => {
    if (range.start > cursor) out.push(text.slice(cursor, range.start));
    out.push(
      // Pas d'or `#ffcf47` (réservé à « ZETIS parle ») et aucune animation : le surlignage
      // reste lisible sans mouvement, il n'y a donc rien à neutraliser en reduced-motion.
      <mark
        key={i}
        className="rounded bg-zetis-accent/30 px-0.5 text-zetis-text"
      >
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}
