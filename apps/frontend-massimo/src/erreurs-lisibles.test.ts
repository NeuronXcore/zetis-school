// VERROU DE DÉPÔT — ce que Massimo lit quand ça casse n'est jamais ce que la machine a compris.
//
// La règle vient du `CLAUDE.md` : *« Massimo ne doit pas voir : […] les informations techniques. »*
// Elle existait déjà, elle n'était simplement appliquée nulle part.
//
// ╭─ LE MOTIF, ET POURQUOI IL A TENU SI LONGTEMPS ────────────────────────────╮
// │   setError(e instanceof Error ? e.message : "Chargement impossible")      │
// │                                                                           │
// │ Il a l'air prudent. Il ne l'est pas : chaque `asJson` du dossier `lib/`   │
// │ lève un VRAI `Error`, donc `e.message` gagne TOUJOURS. La phrase gentille │
// │ écrite à côté est la branche MORTE — jamais lue par personne, en trois    │
// │ ans de dépôt. Ce que Massimo lisait, lui, c'est `Erreur 500`, ou le       │
// │ `Failed to fetch` du navigateur quand le backend est éteint.              │
// ╰───────────────────────────────────────────────────────────────────────────╯
//
// Mesure du 2026-08-17 : **35 sites**, dans 20 fichiers — hooks, pages, modales. Un test par
// écran n'aurait rien valu : la règle est transverse, et c'est le 36ᵉ site, écrit dans six mois,
// qui la reperdrait. Même forme que `voix-de-zetis.test.ts`, pour la même raison.
//
// ⚠️ **CE QU'IL NE VOIT PAS, et c'est écrit exprès.** Il attrape le motif MESURÉ, pas toute façon
// imaginable de rendre une erreur réseau : `String(e)`, `${e}` ou un `catch` qui renvoie l'objet
// lui passeraient sous le nez. Un verrou honnête dit sa portée plutôt que de la laisser croire
// totale. Il tient parce que le motif ci-dessus est celui que la main écrit spontanément.
//
// ⚠️ **Trois classes d'erreur ÉCHAPPENT à la règle, et c'est délibéré** — `MissionRefus` (409),
// `AtelierIncomplet` (422), `Eli5SttUnavailable` (503). Là, c'est le SERVEUR qui a écrit pour
// Massimo (*« Réexplique d'abord la notion à ZETIS »*), et le docstring du backend le dit
// noir sur blanc. Elles ne matchent pas `instanceof Error` : le type EST la frontière.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RACINE = join(process.cwd(), "src") + "/";

function fichiersSource(dossier: string): string[] {
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) return fichiersSource(chemin);
    return /\.tsx?$/.test(entree) && !/\.test\.tsx?$/.test(entree) ? [chemin] : [];
  });
}

/** Retire les commentaires — la doctrine s'ÉCRIT, et elle cite le motif pour expliquer pourquoi
 *  il est proscrit (`DiagnosticPage.tsx` le fait, et c'est elle qui l'a nommé la première).
 *  Seul le code exécuté est contraint. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("VERROU — aucune phrase venue de la machine n'atteint l'écran de Massimo", () => {
  it("le motif `e instanceof Error` n'existe plus dans le code exécuté", () => {
    const coupables: string[] = [];

    for (const fichier of fichiersSource(RACINE)) {
      const code = sansCommentaires(readFileSync(fichier, "utf8"));
      code.split("\n").forEach((ligne, i) => {
        if (/instanceof\s+Error\b/.test(ligne)) {
          coupables.push(`${fichier.replace(RACINE, "")}:${i + 1} — ${ligne.trim()}`);
        }
      });
    }

    expect(
      coupables,
      "La branche morte est revenue. La phrase gentille n'y est JAMAIS lue — c'est `e.message`\n" +
        "qui s'affiche, donc `Erreur 500`. Écrire à la place :\n" +
        '  console.warn("[zone] ce qu\'on tentait", e); // trace devtools (diagnostic)\n' +
        '  setError("<une phrase pour lui>");\n\n' +
        `${coupables.join("\n")}`,
    ).toEqual([]);
  });
});
