import { describe, expect, it } from "vitest";
import type { GalaxyAction } from "@zetis/types";
import {
  REQUESTABLE_KIND,
  SUBJECT_BACK_PARAM,
  missingRequestKinds,
  notionRouteFor,
  subjectRouteFor,
} from "./notionRoutes";

const CTX = {
  skillId: 12,
  name: "Mitose",
  subjectSlug: "svt",
  subjectName: "SVT",
  returnTo: "/subjects/svt",
};

const TOUTES: GalaxyAction["kind"][] = [
  "cours",
  "eli5",
  "fiche",
  "capsule",
  "mindmap",
  "revision",
  "quiz",
];

describe("notionRouteFor — disponibilité", () => {
  it.each(TOUTES)("« %s » indisponible n'ouvre RIEN", (kind) => {
    // Le garde-fou vit dans la route, pas dans le `disabled` du bouton : une surface qui
    // oublierait de griser n'ouvrirait quand même pas une porte sur du vide.
    expect(notionRouteFor({ kind, available: false }, CTX)).toEqual({ mode: "none" });
  });

  it("une carte disponible SANS identifiant n'ouvre rien non plus", () => {
    // `mindmap` et `quiz` se routent par id. `available` sans id est un état incohérent du
    // serveur : on ne construit pas `/mindmaps/reconstruire/undefined`.
    expect(notionRouteFor({ kind: "mindmap", available: true }, CTX)).toEqual({ mode: "none" });
    expect(notionRouteFor({ kind: "quiz", available: true }, CTX)).toEqual({ mode: "none" });
  });
});

describe("notionRouteFor — destinations", () => {
  it("le cours ouvre la page de cours de la MATIÈRE", () => {
    expect(notionRouteFor({ kind: "cours", available: true, lesson_id: 3 }, CTX)).toEqual({
      mode: "navigate",
      to: "/subjects/svt/cours",
    });
  });

  it("ELI5 est la seule surface adressable PAR NOTION, et emporte le rétrolien", () => {
    const route = notionRouteFor({ kind: "eli5", available: true }, CTX);
    expect(route).toEqual({
      mode: "navigate",
      to: "/eli5?skill_id=12&name=Mitose&from=svt",
    });
  });

  it("la fiche transporte le NOM de la matière (l'URL n'a qu'un slug)", () => {
    expect(notionRouteFor({ kind: "fiche", available: true, fiche_id: 5 }, CTX)).toEqual({
      mode: "navigate",
      to: "/fiches/svt",
      state: { name: "SVT" },
    });
  });

  it("la mindmap s'ouvre par ID, en reconstruction", () => {
    expect(notionRouteFor({ kind: "mindmap", available: true, mindmap_id: 44 }, CTX)).toEqual({
      mode: "navigate",
      to: "/mindmaps/reconstruire/44",
    });
  });

  it("la révision LANCE la matière et porte le retour dans DEUX paramètres distincts", () => {
    const route = notionRouteFor({ kind: "revision", available: true }, CTX);
    expect(route).toEqual({ mode: "navigate", to: "/revision?subject=svt&from=svt" });
    // `subject` déclenche, `from` ramène. Un seul paramètre pour les deux rôles ferait d'un
    // retour un lancement de session.
    expect(route).not.toEqual(expect.objectContaining({ to: "/revision?subject=svt" }));
  });

  it("un slug exotique est encodé, jamais concaténé tel quel", () => {
    const route = notionRouteFor(
      { kind: "cours", available: true },
      { ...CTX, subjectSlug: "histoire géo" },
    );
    expect(route).toEqual({ mode: "navigate", to: "/subjects/histoire%20g%C3%A9o/cours" });
  });
});

describe("notionRouteFor — le quiz, seul cas asynchrone", () => {
  it("renvoie une INTENTION, pas une route : `/quiz/session` n'est pas adressable par id", () => {
    expect(notionRouteFor({ kind: "quiz", available: true, quiz_id: 9 }, CTX)).toEqual({
      mode: "quiz",
      quizId: 9,
      label: "SVT · Mitose",
      returnTo: "/subjects/svt",
      fallback: "/quiz",
    });
  });

  it("le `returnTo` vient du CONTEXTE — c'est la raison d'être de l'extraction", () => {
    // Avant, il était codé en dur à "/galaxy" dans la closure du panneau : la page matière
    // aurait renvoyé Massimo vers la galaxie après un quiz lancé depuis son index.
    const depuisGalaxie = notionRouteFor(
      { kind: "quiz", available: true, quiz_id: 9 },
      { ...CTX, returnTo: "/galaxy" },
    );
    expect(depuisGalaxie).toMatchObject({ returnTo: "/galaxy" });
  });
});

describe("missingRequestKinds", () => {
  it("traduit les 7 activités vers les 6 types demandables", () => {
    // Le vocabulaire de `content_requests` n'a que six entrées : `eli5` se demande comme
    // `cours` (il s'ancre dessus), `revision` comme `card`.
    expect(REQUESTABLE_KIND.eli5).toBe("cours");
    expect(REQUESTABLE_KIND.revision).toBe("card");
    expect(new Set(Object.values(REQUESTABLE_KIND)).size).toBe(6);
  });

  it("DÉDUPLIQUE : cours et eli5 manquants ne font qu'UNE demande de cours", () => {
    // ⚠️ Le cas qui compte. `cours` et `eli5` sont toujours indisponibles ENSEMBLE (les deux
    // suivent l'existence d'un cours validé). Sans dédup, « tout ce qui manque » annoncerait
    // 7 alors que le maximum est 6, et enverrait deux fois la même demande.
    const kinds = missingRequestKinds([
      { kind: "cours", available: false },
      { kind: "eli5", available: false },
      { kind: "fiche", available: false },
    ]);
    expect(kinds).toEqual(["cours", "fiche"]);
  });

  it("ne demande jamais ce qui existe déjà", () => {
    expect(
      missingRequestKinds([
        { kind: "cours", available: true },
        { kind: "eli5", available: true },
        { kind: "fiche", available: false },
      ]),
    ).toEqual(["fiche"]);
  });

  it("une panoplie complète ne demande RIEN (le bouton disparaît)", () => {
    expect(missingRequestKinds(TOUTES.map((kind) => ({ kind, available: true })))).toEqual([]);
  });

  it("une panoplie entièrement vide tient sous le plafond de 6", () => {
    const kinds = missingRequestKinds(TOUTES.map((kind) => ({ kind, available: false })));
    expect(kinds).toHaveLength(6);
    expect(new Set(kinds).size).toBe(6);
  });
});

describe("subjectRouteFor — la table SŒUR, au grain matière", () => {
  it.each([
    ["cours", "/subjects/svt/cours"],
    ["fiche", "/fiches/svt"],
    ["mindmap", "/mindmaps/svt"],
    ["revision", "/revision?subject=svt&from=svt"],
  ] as const)("« %s » a une surface matière", (kind, route) => {
    expect(subjectRouteFor(kind, "svt")).toBe(route);
  });

  it("la mindmap ouvre le DECK, pas une carte en reconstruction", () => {
    // Différence avec la route par notion (`/mindmaps/reconstruire/:id`) : depuis un compte
    // agrégé, on n'a aucune carte précise à ouvrir.
    expect(subjectRouteFor("mindmap", "svt")).toBe("/mindmaps/svt");
    expect(notionRouteFor({ kind: "mindmap", available: true, mindmap_id: 44 }, CTX)).toEqual({
      mode: "navigate",
      to: "/mindmaps/reconstruire/44",
    });
  });

  it.each(["capsule", "quiz", "eli5"] as const)(
    "« %s » n'a AUCUNE surface matière — et ce n'est pas un oubli",
    (kind) => {
      // `/capsules` est une liste globale (aucun `/capsules/:slug`), `/quiz` garde la matière
      // en état interne, et ELI5 n'est adressable que par notion. Renvoyer `null` oblige
      // l'appelant à ne pas les rendre cliquables, plutôt qu'à inventer une destination.
      expect(subjectRouteFor(kind, "svt")).toBeNull();
    },
  );

  it("encode le slug", () => {
    expect(subjectRouteFor("fiche", "histoire géo")).toBe("/fiches/histoire%20g%C3%A9o");
  });
});

describe("le paramètre de rétrolien", () => {
  it("n'est PAS `subject` — ce nom est déjà pris, et il déclenche une action", () => {
    // `?subject=` ouvre un deck sur /eli5 et lance une session sur /revision. Le réutiliser
    // pour un lien de retour transformerait une navigation en effet de bord.
    expect(SUBJECT_BACK_PARAM).toBe("from");
    expect(SUBJECT_BACK_PARAM).not.toBe("subject");
  });
});
