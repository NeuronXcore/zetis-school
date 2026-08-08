import { describe, expect, it } from "vitest";
import { MASSIMO_NAV } from "./navigation";

// Non-régression du renommage `/progression` → `/galaxy` (addendum ADR-0024 §A).
//
// Ce que ces tests protègent, ce n'est pas le libellé pour lui-même : c'est l'interdit du §1 de
// l'ADR-0024 — la Galaxy ne doit pas devenir un onglet DE PLUS. Un renommage qui ajoute une
// entrée n'est plus un renommage.

describe("sidebar Massimo — entrée de la Galaxy", () => {
  it("expose « Ma Galaxie » sur /galaxy, et plus aucune entrée /progression", () => {
    const galaxy = MASSIMO_NAV.filter((item) => item.to === "/galaxy");
    expect(galaxy).toHaveLength(1);
    expect(galaxy[0].label).toBe("Ma Galaxie");
    expect(MASSIMO_NAV.some((item) => item.to === "/progression")).toBe(false);
  });

  it("garde la MÊME position : le renommage n'ajoute pas de 6ᵉ onglet (ADR-0024 §1)", () => {
    // Le nombre d'entrées est le vrai invariant — l'index en découle.
    expect(MASSIMO_NAV).toHaveLength(13);
    expect(MASSIMO_NAV.findIndex((item) => item.to === "/galaxy")).toBe(10);
  });

  it("n'a aucune route en double (une surface = une entrée)", () => {
    const routes = MASSIMO_NAV.map((item) => item.to);
    expect(new Set(routes).size).toBe(routes.length);
  });
});

// Témoins de nouveauté (ADR-0030). Ce qui est verrouillé ici, c'est la LISTE : une entrée n'est
// éligible que si elle a une trace de VUE côté serveur, et les absences sont des décisions.
describe("sidebar Massimo — témoins de nouveauté", () => {
  it("porte un témoin sur exactement ces entrées-là", () => {
    // Le compte n'est plus dans le nom : il a bougé deux fois (six avec `mindmaps`, sept avec
    // `diagnostic`) et un nom qui compte se périme sans rougir.
    const withBadge = Object.fromEntries(
      MASSIMO_NAV.filter((item) => item.newsKey).map((item) => [item.to, item.newsKey]),
    );
    expect(withBadge).toEqual({
      "/agenda": "agenda",
      "/fiches": "fiches",
      "/capsules": "capsules",
      "/revision": "revision",
      "/missions": "missions",
      "/mindmaps": "mindmaps",
      "/diagnostic": "diagnostic",
    });
  });

  it("Diagnostic est la SEULE entrée dont le témoin meurt du travail — exception nommée", () => {
    // 🔴 Ce test n'autorise pas, il ENREGISTRE. Les six premiers témoins meurent d'un REGARD ;
    // celui de Diagnostic meurt du TRAVAIL — il compte les diagnostics relus que Massimo n'a pas
    // passés, donc il grossit quand Massimo ne vient pas. C'est la colonne interdite de
    // l'ADR-0030 §1, ouverte par décision du commanditaire après objection et réaffirmation
    // (`docs/decisions/adr-0030-addendum-temoin-diagnostic.md`).
    //
    // Sans cette assertion, la prochaine session lirait sept témoins d'apparence homogène et en
    // conclurait qu'un compteur de non-faits est recevable. Le verrou backend
    // (`test_news_doctrine.py`, dict `DEROGATIONS`) tient la même ligne côté serveur.
    const MEURENT_DU_TRAVAIL = ["/diagnostic"];
    const avecTemoin = MASSIMO_NAV.filter((item) => item.newsKey).map((item) => item.to);

    expect(MEURENT_DU_TRAVAIL).toEqual(["/diagnostic"]);
    for (const route of avecTemoin) {
      if (MEURENT_DU_TRAVAIL.includes(route)) continue;
      // Les autres restent adossés à une trace de vue : c'est ce qui les fait mourir d'un regard.
      expect(["/agenda", "/fiches", "/capsules", "/revision", "/missions", "/mindmaps"]).toContain(
        route,
      );
    }
  });

  it("n'attribue jamais deux fois la même clé", () => {
    const keys = MASSIMO_NAV.map((item) => item.newsKey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("laisse ELI5 SANS témoin, et ce n'est pas un oubli", () => {
    // ELI5 a bien un `new_count`, mais c'est un critère de RÉCENCE (leçon porteuse créée dans les
    // 7 jours), pas de vue. Il décroîtrait tout seul et allumerait une entrée fraîchement
    // visitée — un badge qui ment sur ce qu'on a lu ne se répare pas (ADR-0030 §2).
    // Ce test existe pour qu'une prochaine session ne « complète » pas la liste par symétrie
    // avec les autres dérivés.
    expect(MASSIMO_NAV.find((item) => item.to === "/eli5")?.newsKey).toBeUndefined();
  });

  it("laisse Quiz SANS témoin : il n'y a aucun moment « ça arrive »", () => {
    // ⚠️ MOTIF REBASÉ (ADR-0044 §7) : la version d'avant disait « la table `quizzes` n'a pas de
    // `validation_status` ». C'est FAUX depuis la migration `a9b0c1d2e3f4`. Le vrai motif tient au
    // `quiz_type` : SEUL le diagnostic est gaté, un quiz de mission ou de fin de cours vaut
    // `validated` dès sa génération. Il n'y a donc toujours aucun moment « ça arrive » — mais
    // pour une autre raison que celle qui était écrite, et un motif faux ne verrouille plus rien.
    expect(MASSIMO_NAV.find((item) => item.to === "/quiz")?.newsKey).toBeUndefined();
  });

  it("laisse sans témoin toute entrée sans contenu qui « arrive »", () => {
    // 🔴 CETTE BOUCLE NE SE RÉTRÉCIT PAS. `/diagnostic` en est sorti parce qu'il a désormais un
    // témoin — pas parce qu'on l'a jugé encombrant. Les cinq autres y restent, et retirer l'une
    // d'elles pour faire passer un ajout serait affaiblir le verrou en croyant l'ajuster.
    for (const route of ["/", "/matieres", "/quiz", "/galaxy", "/chat"]) {
      expect(MASSIMO_NAV.find((item) => item.to === route)?.newsKey).toBeUndefined();
    }
  });
});
