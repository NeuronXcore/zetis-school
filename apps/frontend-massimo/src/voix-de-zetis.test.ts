// VERROU DE DÉPÔT — Papa n'existe pas dans l'espace de Massimo (addendum ADR-0025 §16).
//
// Ce test ne vise aucun composant : il balaie **tout le code de l'app**. C'est voulu, et c'est la
// seule forme qui tienne. La règle est transverse — elle vaut pour l'agenda, le chat, ELI5, le
// diagnostic, les capsules et toute surface à venir — et un test par écran laisserait passer le
// dixième, écrit dans six mois par quelqu'un qui n'aura pas lu l'ADR.
//
// Il généralise la décision du 2026-08-02 sur les missions : « une mission arrive dans la voix de
// ZETIS, quel que soit qui l'a créée — la voix du monde de Massimo doit tenir dans le temps. »
//
// ⚠️ Ce qu'il NE dit pas : que Papa n'existe pas. Il pilote, il valide, il saisit l'agenda. Le
// verrou porte sur ce que MASSIMO lit, pas sur ce que le produit fait.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// `process.cwd()` = la racine du paquet sous vitest. `import.meta.url` rendait un chemin
// tronqué dans cet environnement — vérifié, pas supposé.
const RACINE = join(process.cwd(), "src") + "/";

function fichiersSource(dossier: string): string[] {
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) return fichiersSource(chemin);
    return /\.tsx?$/.test(entree) && !/\.test\.tsx?$/.test(entree) ? [chemin] : [];
  });
}

/** Retire les commentaires — la doctrine s'ÉCRIT, et elle nomme Papa pour expliquer pourquoi il
 *  ne doit pas s'afficher. Seules les chaînes rendues sont contraintes. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("VERROU §16 — la voix du monde de Massimo ne nomme que ZETIS", () => {
  it("aucune chaîne rendue ne contient « papa »", () => {
    const coupables: string[] = [];

    for (const fichier of fichiersSource(RACINE)) {
      const code = sansCommentaires(readFileSync(fichier, "utf8"));
      code.split("\n").forEach((ligne, i) => {
        // `PapaLayout`, `isPapa`… n'existent pas ici, mais un identifiant ne se lit pas à
        // l'écran : on ne retient que le mot ISOLÉ, celui qui apparaît dans une phrase.
        if (/\bpapa\b/i.test(ligne)) {
          coupables.push(`${fichier.replace(RACINE, "")}:${i + 1} — ${ligne.trim()}`);
        }
      });
    }

    expect(coupables, `Papa a reparu dans l'espace de Massimo :\n${coupables.join("\n")}`).toEqual(
      [],
    );
  });
});
