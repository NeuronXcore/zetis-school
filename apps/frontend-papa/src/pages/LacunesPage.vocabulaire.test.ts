import { describe, expect, it } from "vitest";
// ⚠️ Import `?raw` de Vite plutôt que `node:fs` : le tsconfig du front déclare `"types": []`, donc
// `readFileSync`/`process` ne compilent pas ici — `tsc -b` rougit alors que vitest passe. Les deux
// doivent être verts.
import lacunesSource from "./LacunesPage.tsx?raw";
import progressionSource from "./ProgressionPage.tsx?raw";

// 🔴 Test-verrou de VOCABULAIRE (adr-0040 §5).
//
// Trois surfaces employaient « à renforcer » pour trois populations différentes :
//
//   KPI dashboard        `SkillMastery ∈ {weak, learning}`        13 en base réelle
//   titre de /lacunes    lignes `Gap` ouvertes                     1 en base réelle
//   `SEVERITY.medium`    un sous-ensemble de ce sous-ensemble      —
//
// Conséquence VISIBLE avant correctif : `/lacunes` affichait « Rien à renforcer pour le moment »
// pendant que le dashboard annonçait 13 notions à renforcer.
//
// Ce verrou est LEXICAL et porte sur le fichier source, pas sur un rendu : un mot peut réapparaître
// dans une branche jamais rendue par les tests (état vide, sévérité rare, tooltip), et c'est
// précisément là qu'il se réintroduit. Le dépôt a déjà prouvé DEUX fois qu'un mot partagé finit par
// fondre deux mesures.

const SOURCES: Record<string, string> = {
  "LacunesPage.tsx": lacunesSource,
  "ProgressionPage.tsx": progressionSource,
};
const lire = (nom: string) => SOURCES[nom];

/** Ne garde que ce qui atteint l'écran : on ignore les commentaires, où le mot est légitime
 *  (expliquer POURQUOI il est banni suppose de l'écrire). */
function sansCommentaires(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

describe("vocabulaire — « à renforcer » et « lacune » ne se recouvrent pas", () => {
  it("aucun « à renforcer » n'atteint l'écran depuis la page des LACUNES (contexte Gap)", () => {
    const rendu = sansCommentaires(lire("LacunesPage.tsx"));

    expect(rendu).not.toMatch(/à renforcer/i);
    // Et le libellé du GLOSSARY est bien celui qui s'affiche.
    expect(rendu).toContain("Lacunes ouvertes");
    expect(rendu).toContain("Aucune lacune ouverte");
  });

  it("`SEVERITY.medium` ne dit plus « à renforcer »", () => {
    expect(lire("LacunesPage.tsx")).toMatch(/medium:\s*\{\s*label:\s*"à traiter"/);
  });

  it("l'état vide renvoie vers Progression, parce que les deux populations sont DISJOINTES", () => {
    // Sans ce renvoi, « aucune lacune ouverte » se lirait « rien à faire » alors que 13 notions
    // sont fragiles. C'est le mensonge que le §5 corrige, pas le libellé seul.
    const src = lire("LacunesPage.tsx");
    expect(src).toMatch(/progression\?view=notion/);
    expect(src).toMatch(/disjointes/i);
  });

  it("aucun « lacune » n'atteint l'écran depuis la vue des PALIERS (contexte SkillMastery)", () => {
    // Symétrique du premier : sur Progression, le mot « lacune » ne doit qualifier que la colonne
    // qui compte VRAIMENT des `Gap`. Le vocabulaire des paliers est « acquise / à renforcer /
    // en cours / non abordée ».
    const rendu = sansCommentaires(lire("ProgressionPage.tsx"));
    const interdits = rendu.match(/lacune/gi) ?? [];
    // La colonne « Lacune » de la vue notion est le SEUL emploi légitime : elle compte des `Gap`.
    expect(interdits.length).toBeLessThanOrEqual(3);
  });
});
