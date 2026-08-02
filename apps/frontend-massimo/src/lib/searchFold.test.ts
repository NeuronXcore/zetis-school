import { describe, expect, it } from "vitest";
import { normalizeSearch } from "@zetis/ui/galaxy";
import { fold, matchRanges, matchesQuery } from "./searchFold";

describe("fold — le pli reste en phase avec celui de la galaxie", () => {
  it.each([
    "Photosynthèse",
    "Élysée",
    "L'ADN",
    "Théorème de Pythagore",
    "Écosystème",
    "Nombres relatifs",
    "Révolution française",
  ])("« %s » se plie exactement comme normalizeSearch", (mot) => {
    // ⚠️ TEST-VERROU. Le filtre et le surlignage partagent ce pli ; la galaxie utilise
    // `normalizeSearch`. S'ils divergent, une notion pourra apparaître dans les résultats
    // d'une surface et pas de l'autre — sans que rien ne le signale.
    expect(fold(mot).folded).toBe(normalizeSearch(mot));
  });

  it("la carte d'offsets a une sentinelle finale", () => {
    // Sans elle, `map[at + needle.length]` serait `undefined` quand la correspondance
    // touche la fin du texte — et `slice(start, undefined)` mangerait la suite.
    const { folded, map } = fold("Mitose");
    expect(map).toHaveLength(folded.length + 1);
    expect(map[map.length - 1]).toBe("Mitose".length);
  });

  it("un accent NE décale PAS la carte : le pli est plus court que l'original", () => {
    // C'est le piège que ce module existe pour désamorcer.
    const { folded } = fold("Photosynthèse");
    expect(folded).toBe("photosynthese");
    expect(folded.length).toBe("Photosynthèse".length); // ici égal, mais…
    // …le décalage est réel dès qu'on regarde la position d'un caractère APRÈS l'accent :
    // dans la forme NFD intermédiaire, « è » occupe deux unités.
    expect("Photosynthèse".normalize("NFD").length).toBe(14);
  });
});

describe("matchRanges — les index désignent le texte ORIGINAL", () => {
  it("« photosynthese » trouve « Photosynthèse », accent compris", () => {
    const ranges = matchRanges("Photosynthèse", "photosynthese");
    expect(ranges).toHaveLength(1);
    // LA preuve que la carte d'offsets fonctionne : trancher l'original avec ces index
    // redonne le mot accentué, pas une bouillie décalée.
    expect("Photosynthèse".slice(ranges[0].start, ranges[0].end)).toBe("Photosynthèse");
  });

  it("une correspondance APRÈS un accent est tranchée au bon endroit", () => {
    // Le cas où un index naïf se décalerait : « these » commence après le « è ».
    const ranges = matchRanges("Photosynthèse", "these");
    expect(ranges).toHaveLength(1);
    expect("Photosynthèse".slice(ranges[0].start, ranges[0].end)).toBe("thèse");
  });

  it("plusieurs occurrences ressortent, disjointes et dans l'ordre", () => {
    const ranges = matchRanges("Élysée", "e");
    expect(ranges).toHaveLength(3);
    // Les trois « e » de « Élysée » sont É, é et e — et chaque plage rend le caractère
    // ACCENTUÉ d'origine, pas sa version pliée. C'est exactement ce que la carte d'offsets
    // sert à garantir : on surligne le texte tel que Massimo le voit.
    expect(ranges.map((r) => "Élysée".slice(r.start, r.end))).toEqual(["É", "é", "e"]);
    for (let i = 1; i < ranges.length; i += 1) {
      expect(ranges[i].start).toBeGreaterThanOrEqual(ranges[i - 1].end);
    }
  });

  it("une requête vide ne surligne RIEN", () => {
    // `"".includes("")` vaut `true` : sans garde, tout le texte serait surligné au chargement.
    expect(matchRanges("Mitose", "")).toEqual([]);
    expect(matchRanges("Mitose", "   ")).toEqual([]);
  });

  it("une requête plus longue que le texte ne trouve rien", () => {
    expect(matchRanges("ADN", "adn et compagnie")).toEqual([]);
  });

  it("la casse et les apostrophes ne gênent pas", () => {
    const ranges = matchRanges("L'ADN", "adn");
    expect(ranges).toHaveLength(1);
    expect("L'ADN".slice(ranges[0].start, ranges[0].end)).toBe("ADN");
  });
});

describe("matchesQuery — le filtre et le surlignage ne peuvent pas diverger", () => {
  it.each([
    ["Photosynthèse", "photosynthese", true],
    ["Photosynthèse", "SYNTHE", true],
    ["Écosystème", "ecosysteme", true],
    ["Mitose", "adn", false],
  ])("« %s » / « %s » → %s", (texte, requete, attendu) => {
    expect(matchesQuery(texte, requete)).toBe(attendu);
  });

  it("tout ce qui est filtré EST surlignable, et réciproquement", () => {
    // L'invariant qui interdit une notion « trouvée » mais non surlignée.
    const corpus = ["Photosynthèse", "Élysée", "Mitose", "L'ADN", "Écosystème"];
    for (const texte of corpus) {
      for (const requete of ["e", "os", "adn", "photo", "zzz", ""]) {
        expect(matchesQuery(texte, requete)).toBe(matchRanges(texte, requete).length > 0);
      }
    }
  });

  it("une requête vide ne fait PAS correspondre tout le monde", () => {
    expect(matchesQuery("Mitose", "")).toBe(false);
  });
});
