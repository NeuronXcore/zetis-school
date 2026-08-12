import { describe, expect, it } from "vitest";
import type { GalaxyAction } from "@zetis/types";
import { ACTION_UI } from "./notionActionUi";
import { MASSIMO_NAV } from "./navigation";

const TOUTES: GalaxyAction["kind"][] = [
  "cours",
  "eli5",
  "fiche",
  "capsule",
  "mindmap",
  "revision",
  "quiz",
];

/** Les activités dont le libellé porte le radical « carte » (carte, cartes, Cartes…).
 *
 *  Le radical, et pas la chaîne exacte : c'est le MOT qui collisionne, quelle que soit sa forme.
 *  `\b` en tête pour ne pas ferrer « écarter » ou « carter » ; pas de `\b` en queue, pour attraper
 *  le pluriel. */
function activitesQuiDisentCarte(): GalaxyAction["kind"][] {
  return TOUTES.filter((kind) => /\bcartes?\b/i.test(ACTION_UI[kind].label));
}

describe("ACTION_UI — un mot, une destination", () => {
  it("🔴 VERROU — « carte » ne nomme JAMAIS deux activités différentes", () => {
    // Né d'un signalement du commanditaire. `mindmap` a dit « Reconstruire la carte » jusqu'au
    // 2026-08-12, deux lignes au-dessus de « Réviser mes cartes » — deux surfaces sans rapport,
    // dans le MÊME panneau de notion. Un cran plus haut, le même défaut a fait lire un onglet
    // « Cartes » comme les cartes de révision, et conclure que **le lien vers les mindmaps
    // manquait** (addendum ADR-0024 §3 bis).
    //
    // Ce verrou est posé sur la TABLE, et c'est la raison d'être de ce fichier : celui de
    // `MatiereDetailPage.test.tsx` ne regarde que la bande de catalogue, et n'aurait jamais vu
    // la collision revenir par le panneau, la Galaxy ou le chat — les trois autres surfaces que
    // cette table habille.
    expect(activitesQuiDisentCarte()).toHaveLength(1);
  });

  it("et c'est la RÉVISION qui le garde — corriger de l'autre côté serait la même faute", () => {
    // Le sens SRS est le sens déjà tenu partout ailleurs : « 8 cartes à revoir » sur la page
    // matière, « 5 cartes » sur une échéance d'agenda, « Refaire un tour (3 cartes) » en fin de
    // session. Il vient du modèle lui-même (`Card`, module `memory`). Lever la collision en
    // rebaptisant la révision déplacerait le problème au lieu de le résoudre — et casserait un
    // vocabulaire que Massimo a déjà appris.
    expect(activitesQuiDisentCarte()).toEqual(["revision"]);
    expect(ACTION_UI.revision.label).toMatch(/\bcartes\b/i);
  });

  it("la mindmap porte le nom que la barre latérale montre à Massimo tous les jours", () => {
    // Coupler au NOM RÉEL de la surface, pas à une chaîne recopiée ici : si la barre latérale se
    // renomme un jour, ce test doit rougir plutôt que laisser la table diverger en silence.
    const entree = MASSIMO_NAV.find((item) => item.to === "/mindmaps");
    expect(entree).toBeDefined();
    // « Mindmaps » (barre latérale) → « mindmap » (une seule, ici, celle de la notion).
    const mot = entree!.label.toLowerCase().replace(/s$/, "");
    expect(ACTION_UI.mindmap.label.toLowerCase()).toContain(mot);
  });

  it("les sept activités restent habillées, et par des libellés tous DISTINCTS", () => {
    // Filet de sécurité du renommage : une table d'habillage à laquelle il manque une entrée
    // rend `undefined.icon` à l'écran, et deux entrées au même libellé recréent exactement le
    // défaut que ce fichier existe pour interdire.
    const libelles = TOUTES.map((kind) => ACTION_UI[kind].label);
    expect(libelles.every((label) => label.trim().length > 0)).toBe(true);
    expect(new Set(libelles).size).toBe(TOUTES.length);
  });
});
