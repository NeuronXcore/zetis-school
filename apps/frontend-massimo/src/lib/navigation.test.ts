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
    // Le compte n'est plus dans le nom : il a bougé quatre fois (six avec `mindmaps`, sept avec
    // `diagnostic`, dix avec `matieres`/`eli5`/`quiz` le 2026-08-15) et un nom qui compte se périme
    // sans rougir.
    //
    // Les trois derniers sont nommés par leurs addenda — `adr-0030-temoins-nouveaute-navigation` (Amendement 2)
    // (qui porte aussi les bornes transverses B1–B4), `-eli5` et `-quiz` — et **aucun** n'a demandé
    // de dérogation : ils meurent tous d'un REGARD. C'est ce qui les sépare de `diagnostic`.
    const withBadge = Object.fromEntries(
      MASSIMO_NAV.filter((item) => item.newsKey).map((item) => [item.to, item.newsKey]),
    );
    expect(withBadge).toEqual({
      "/agenda": "agenda",
      "/matieres": "matieres",
      "/eli5": "eli5",
      "/quiz": "quiz",
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
    // (`docs/decisions/adr-0030-temoins-nouveaute-navigation.md` (Amendement 1)).
    //
    // Sans cette assertion, la prochaine session lirait sept témoins d'apparence homogène et en
    // conclurait qu'un compteur de non-faits est recevable. Le verrou backend
    // (`test_news_doctrine.py`, dict `DEROGATIONS`) tient la même ligne côté serveur.
    //
    // ⚠️ Le 2026-08-15, trois entrées ont gagné un témoin. `MEURENT_DU_TRAVAIL` **n'a pas bougé** :
    // les trois se rangent du côté LÉGAL, adossées à une trace de vue (`lesson_views`,
    // `eli5_views`, `quiz_views`). C'est la borne B1, et c'est la preuve que cet élargissement
    // n'est pas une porte ouverte — si l'un d'eux avait eu besoin d'une dérogation, il aurait
    // fallu une décision du commanditaire, pas une symétrie.
    const MEURENT_DU_TRAVAIL = ["/diagnostic"];
    const MEURENT_D_UN_REGARD = [
      "/agenda",
      "/matieres",
      "/eli5",
      "/quiz",
      "/fiches",
      "/capsules",
      "/revision",
      "/missions",
      "/mindmaps",
    ];
    const avecTemoin = MASSIMO_NAV.filter((item) => item.newsKey).map((item) => item.to);

    expect(MEURENT_DU_TRAVAIL).toEqual(["/diagnostic"]);
    for (const route of avecTemoin) {
      if (MEURENT_DU_TRAVAIL.includes(route)) continue;
      // Les autres restent adossés à une trace de vue : c'est ce qui les fait mourir d'un regard.
      expect(MEURENT_D_UN_REGARD).toContain(route);
    }
  });

  it("n'attribue jamais deux fois la même clé", () => {
    const keys = MASSIMO_NAV.map((item) => item.newsKey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("donne à ELI5 un témoin ADOSSÉ À UNE VUE (adr-0030-temoins-nouveaute-navigation (Amendement 3))", () => {
    // ~~« laisse ELI5 SANS témoin, et ce n'est pas un oubli »~~ — INVERSÉ le 2026-08-15.
    //
    // L'ancienne raison est gardée, et elle reste VRAIE : « ELI5 a bien un `new_count`, mais c'est
    // un critère de RÉCENCE (leçon porteuse créée dans les 7 jours), pas de vue ; il décroîtrait
    // tout seul et allumerait une entrée fraîchement visitée » (ADR-0030 §2).
    //
    // Ce qui a changé n'est pas la règle, c'est sa CONSÉQUENCE : on n'a pas réutilisé ce
    // compteur-là, on a créé la trace qui manquait (`eli5_views`). Le §2 sort renforcé — « la
    // récence ne suffit pas » devient « alors on paie la table ».
    //
    // La preuve que la récence n'est pas revenue par la fenêtre est côté serveur, où elle est
    // vérifiable : `test_news_doctrine.py::test_le_temoin_eli5_n_est_pas_le_compteur_de_RECENCE`.
    expect(MASSIMO_NAV.find((item) => item.to === "/eli5")?.newsKey).toBe("eli5");
  });

  it("donne à Quiz un témoin qui naît d'une PRODUCTION (adr-0030-temoins-nouveaute-navigation (Amendement 4))", () => {
    // ~~« laisse Quiz SANS témoin : il n'y a aucun moment ça arrive »~~ — INVERSÉ le 2026-08-15,
    // au troisième cran d'une chaîne de motifs qu'il faut lire en entier :
    //
    //   1. ~~« la table `quizzes` n'a pas de `validation_status` »~~ (ADR-0030 §3) — FAUX depuis
    //      la migration `a9b0c1d2e3f4` ;
    //   2. ~~« SEUL le diagnostic est gaté, un quiz de mission vaut `validated` dès sa génération,
    //      donc aucun moment ça arrive »~~ (ADR-0044 §7) — REBASAGE du précédent, et **toujours
    //      vrai aujourd'hui** ;
    //   3. la décision ne contredit pas (2), elle passe par-dessus : l'ADR-0030 §1 dit « naît d'un
    //      geste de Papa OU DU SYSTÈME (un contenu arrive) », et un quiz produit par le worker est
    //      un contenu qui arrive.
    //
    // 🔴 Conséquence à ne pas perdre : ce témoin naît d'une PRODUCTION, pas d'une validation —
    // donc **Papa n'en est pas le robinet**, seul du dispositif dans ce cas. Si le volume dérape,
    // la réponse est de gater la production, jamais d'atténuer le badge (addendum, borne 4).
    expect(MASSIMO_NAV.find((item) => item.to === "/quiz")?.newsKey).toBe("quiz");
  });

  it("partitionne la navigation : chaque entrée a un camp, et un seul", () => {
    // 🔴 REMPLACE la boucle « laisse sans témoin toute entrée sans contenu qui arrive », dont le
    // commentaire disait « CETTE BOUCLE NE SE RÉTRÉCIT PAS » — et à qui le chantier du 2026-08-15
    // retirait trois de ses cinq entrées. La rétrécir aurait été affaiblir le verrou en croyant
    // l'ajuster ; un verrou qui perd une entrée à chaque chantier finit vide.
    //
    // La partition est STRICTEMENT PLUS FORTE que la boucle : elle ne se contente pas de vérifier
    // que trois routes n'ont pas de témoin, elle exige que **toute** entrée de `MASSIMO_NAV` soit
    // rangée dans exactement un des deux camps. Conséquences (borne B4) :
    //   - aucune entrée ne peut changer de camp en silence ;
    //   - une 14ᵉ entrée FORCE à trancher son camp, elle ne peut pas rester dans l'entre-deux.
    const SANS_TEMOIN = ["/", "/galaxy", "/chat"];
    const avecTemoin = MASSIMO_NAV.filter((item) => item.newsKey).map((item) => item.to);

    for (const route of SANS_TEMOIN) {
      expect(MASSIMO_NAV.find((item) => item.to === route)?.newsKey).toBeUndefined();
    }
    expect(avecTemoin.length + SANS_TEMOIN.length).toBe(MASSIMO_NAV.length);
    expect(new Set([...avecTemoin, ...SANS_TEMOIN]).size).toBe(MASSIMO_NAV.length);
  });
});
