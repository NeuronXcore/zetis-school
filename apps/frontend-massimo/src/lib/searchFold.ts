// Recherche locale de la page matière : plier les accents ET savoir surligner.
//
// `normalizeSearch` (@zetis/ui/galaxy) plie déjà minuscules + accents, et la recherche de la
// galaxie s'en contente : elle ALLUME des étoiles, elle n'a rien à surligner. Ici il faut
// montrer QUELLE partie du nom correspond — et c'est là que le pli devient piégeux.
//
// ⚠️ LE PIÈGE : `normalize("NFD")` décompose « è » en « e » + accent combinant, que la regex
// supprime ensuite. La chaîne pliée n'a donc PAS la même longueur que l'originale, et un index
// trouvé dans la pliée ne désigne pas le bon caractère dans l'originale. Surligner d'après ces
// index décalerait le `<mark>` d'un cran par accent — d'autant plus faux que le mot est accentué,
// c'est-à-dire précisément sur les mots que Massimo tape sans accent.
//
// La parade : plier POINT DE CODE PAR POINT DE CODE en tenant une carte d'offsets.
import { normalizeSearch } from "@zetis/ui/galaxy";

const DIACRITIC = /\p{Diacritic}/gu;

/** Le pli d'UN point de code — peut rendre 0, 1 ou plusieurs caractères. */
function foldChar(ch: string): string {
  return ch.normalize("NFD").replace(DIACRITIC, "").toLowerCase();
}

export interface Folded {
  folded: string;
  /** `map[i]` = index, dans le texte ORIGINAL, du caractère qui a produit le plié n° `i`.
   *  Longueur = `folded.length + 1` : la sentinelle finale permet de lire une fin de plage. */
  map: number[];
}

/** Plie comme `normalizeSearch`, mais SANS `trim()` (qui décalerait toute la carte) et en
 *  conservant la correspondance vers le texte d'origine. */
export function fold(text: string): Folded {
  let folded = "";
  const map: number[] = [];
  let original = 0;
  // Itération par POINT DE CODE (`for…of` sur une string), pas par unité UTF-16 : un emoji ou
  // un caractère hors BMP compte pour 2 unités et couperait le pli en deux.
  for (const ch of text) {
    const piece = foldChar(ch);
    for (let i = 0; i < piece.length; i += 1) map.push(original);
    folded += piece;
    original += ch.length;
  }
  map.push(original);
  return { folded, map };
}

/** Une correspondance, en index du texte ORIGINAL (donc directement tranchable). */
export interface MatchRange {
  start: number;
  end: number;
}

/** Toutes les occurrences de `query` dans `text`, accents et casse pliés. */
export function matchRanges(text: string, query: string): MatchRange[] {
  // Le BESOIN, lui, se trim : « photo » et « photo   » cherchent la même chose.
  const needle = normalizeSearch(query);
  // Sans ce garde, `"".includes("")` vaut `true` et une requête d'espaces surlignerait TOUT.
  if (!needle) return [];

  const { folded, map } = fold(text);
  const out: MatchRange[] = [];
  for (
    let at = folded.indexOf(needle);
    at >= 0;
    at = folded.indexOf(needle, at + needle.length)
  ) {
    out.push({ start: map[at], end: map[at + needle.length] });
  }
  return out;
}

/** Le prédicat de filtrage de la recherche.
 *
 *  ⚠️ Il passe par le MÊME `fold` que le surlignage, délibérément — et non par
 *  `normalizeSearch(text).includes(...)`, qui serait plus court. Le pli global et le pli par
 *  caractère peuvent diverger sur des cas rares (réordonnancement canonique de marques
 *  multiples, sigma final grec). Si le filtre utilisait l'un et le surlignage l'autre, une
 *  notion pourrait apparaître dans les résultats SANS être surlignée, ou être comptée
 *  « trouvée » sans l'être. Une seule source ⇒ divergence impossible. */
export function matchesQuery(text: string, query: string): boolean {
  const needle = normalizeSearch(query);
  return needle ? fold(text).folded.includes(needle) : false;
}
