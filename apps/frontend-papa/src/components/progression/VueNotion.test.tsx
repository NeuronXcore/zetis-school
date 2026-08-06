import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { SkillIndex, SkillIndexRow } from "@zetis/types";
import { VueNotion } from "./VueNotion";

// Tri des six colonnes (amendement du §4 bis, 2026-08-06 — le cadrage n'en prévoyait que trois).
//
// 🔴 L'invariant qui compte n'est PAS « ça trie » : c'est que **le départage survit au sens**.
// Un tri qui inverserait aussi sa queue rendrait l'ordre des ex æquo dépendant du sens, donc
// imprévisible — et sur cette vue les ex æquo sont la règle, pas l'exception : 15 des 19 notions
// engagées partagent la même valeur « hors trace ».

function notion(over: Partial<SkillIndexRow> & { skill_id: number }): SkillIndexRow {
  return {
    skill_name: `Notion ${over.skill_id}`,
    subject_id: 1,
    subject_name: "Mathématiques",
    subject_slug: "maths",
    palier: "a_renforcer",
    mastery_score: 40,
    has_open_gap: false,
    has_active_mission: false,
    since: { unknown: "before_history" },
    ...over,
  };
}

function index(notions: SkillIndexRow[]): SkillIndex {
  return {
    notions,
    subjects: [
      { subject_id: 1, name: "Mathématiques", slug: "maths" },
      { subject_id: 2, name: "Français", slug: "francais" },
    ],
    history_since: "2026-07-31",
    reviews_since: "2026-07-04",
    facts: [],
    facts_since: "2025-08-06",
  };
}

function rendre(idx: SkillIndex) {
  return render(
    <VueNotion
      index={idx}
      subjectSlug={null}
      timelines={{}}
      timelineLoading={null}
      onOpenTimeline={vi.fn()}
      onVoirPeriode={vi.fn()}
    />,
  );
}

/** Les noms de notion affichés, dans l'ordre du tableau. */
function ordreAffiche(): string[] {
  const lignes = screen.getAllByRole("row").slice(1); // la 1re ligne est l'en-tête
  return lignes
    .map((l) => within(l).queryAllByRole("button")[0]?.textContent?.replace(/^▶\s*/, "").trim())
    .filter((x): x is string => Boolean(x));
}

/** Clique un en-tête de colonne.
 *
 *  ⚠️ `fireEvent`, jamais `element.click()` : un clic DOM nu n'est pas enveloppé dans `act()`, la
 *  mise à jour d'état n'est pas vidée, et l'assertion lit l'ordre d'AVANT. Un test écrit ainsi
 *  passe quand l'ordre attendu est déjà l'ordre par défaut — il ne prouve alors rien.
 *
 *  ⚠️ Portée limitée aux `columnheader` : « Lacune » est aussi le libellé d'une pastille de
 *  filtre, et `getByRole("button", …)` en trouverait deux. */
function trierPar(nom: string) {
  const colonne = screen
    .getAllByRole("columnheader")
    .find((c) => c.textContent?.trim().toLowerCase().startsWith(nom.toLowerCase()));
  if (!colonne) throw new Error(`colonne « ${nom} » introuvable`);
  fireEvent.click(within(colonne).getByRole("button"));
}

describe("VueNotion — tri des colonnes", () => {
  it("trie par matière dans l'ORDRE DE L'ANNÉE, jamais alphabétique", async () => {
    // Français (rang 1) après Mathématiques (rang 0) alors que « Français » précède
    // alphabétiquement : c'est l'ordre servi par le serveur qui fait foi (§4 bis).
    // ⚠️ Le jeu est choisi pour que l'ordre attendu DIFFÈRE de l'ordre par défaut (notion, A→Z) :
    // sinon le test passerait même si le clic ne faisait rien.
    rendre(
      index([
        notion({ skill_id: 1, skill_name: "Alpha", subject_id: 2, subject_name: "Français" }),
        notion({ skill_id: 2, skill_name: "Zeta", subject_id: 1, subject_name: "Mathématiques" }),
      ]),
    );
    expect(ordreAffiche()).toEqual(["Alpha", "Zeta"]); // défaut : par nom
    trierPar("Matière");

    // Mathématiques (rang 0) avant Français (rang 1), alors que « Alpha » précède « Zeta ».
    expect(ordreAffiche()).toEqual(["Zeta", "Alpha"]);
  });

  it("un second clic sur le même en-tête inverse le sens", () => {
    rendre(
      index([
        notion({ skill_id: 1, skill_name: "Alpha" }),
        notion({ skill_id: 2, skill_name: "Beta" }),
      ]),
    );
    expect(ordreAffiche()).toEqual(["Alpha", "Beta"]);

    trierPar("Notion");
    expect(ordreAffiche()).toEqual(["Beta", "Alpha"]);
  });

  it("🔴 le SENS n'inverse pas le départage — les ex æquo gardent leur ordre", () => {
    // Trois notions au MÊME palier : la clé principale ne les départage pas. Quel que soit le
    // sens, elles doivent rester dans l'ordre (nom, skill_id). Si le tri inversait aussi sa queue,
    // l'ordre des ex æquo basculerait — et sur cette vue les ex æquo sont la règle.
    rendre(
      index([
        notion({ skill_id: 3, skill_name: "Cerise", palier: "a_renforcer" }),
        notion({ skill_id: 1, skill_name: "Abricot", palier: "a_renforcer" }),
        notion({ skill_id: 2, skill_name: "Banane", palier: "a_renforcer" }),
      ]),
    );

    trierPar("Palier");
    const asc = ordreAffiche();
    trierPar("Palier");
    const desc = ordreAffiche();

    expect(asc).toEqual(["Abricot", "Banane", "Cerise"]);
    expect(desc).toEqual(asc);
  });

  it("trie sur « Lacune » et « Mission » en remontant ce qui en porte", () => {
    rendre(
      index([
        notion({ skill_id: 1, skill_name: "Sans", has_open_gap: false }),
        notion({ skill_id: 2, skill_name: "Avec", has_open_gap: true }),
      ]),
    );
    trierPar("Lacune");

    // Ce qu'on cherche en triant sur cette colonne, c'est ce qui PORTE une lacune.
    expect(ordreAffiche()[0]).toBe("Avec");
  });

  it("porte `aria-sort` sur la colonne active, et sur elle seule", () => {
    rendre(index([notion({ skill_id: 1 })]));
    trierPar("Palier");

    const colonnes = screen.getAllByRole("columnheader");
    const actives = colonnes.filter((c) => c.getAttribute("aria-sort") !== "none");
    expect(actives).toHaveLength(1);
    expect(actives[0]).toHaveAttribute("aria-sort", "ascending");
  });
});
