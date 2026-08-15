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
  it("le cours ouvre LA leçon, cadrée dans son chapitre", () => {
    // ⚠️ Attendait `/subjects/svt/cours` (la matière entière) jusqu'au 2026-08-15 : le
    // `lesson_id` était reçu puis jeté, ici comme côté serveur (ADR-0059 §A2). `?lesson=`
    // **cadre et déplie**, il n'ouvre pas le volet de lecture — comportement partagé avec
    // l'agenda, et c'est pourquoi on ne le change pas.
    expect(notionRouteFor({ kind: "cours", available: true, lesson_id: 3 }, CTX)).toEqual({
      mode: "navigate",
      to: "/subjects/svt/cours?lesson=3",
    });
  });

  it("sans `lesson_id`, le cours retombe sur la matière — jamais sur `?lesson=undefined`", () => {
    expect(notionRouteFor({ kind: "cours", available: true }, CTX)).toEqual({
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

  it("la fiche ouvre LA fiche, et transporte le NOM de la matière", () => {
    // ⚠️ Attendait `/fiches/svt` — les douze fiches de la matière — jusqu'au 2026-08-15, alors
    // que l'adresse `?fiche=` existait depuis l'ADR-0054 §1 et n'était consommée par AUCUNE des
    // deux tables de routes du dépôt. Le `state` reste : il porte le nom de la MATIÈRE pour le
    // bandeau, ce que l'URL (un slug) ne sait pas faire.
    expect(notionRouteFor({ kind: "fiche", available: true, fiche_id: 5 }, CTX)).toEqual({
      mode: "navigate",
      to: "/fiches/svt?fiche=5",
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
    // `quiz` a rejoint la liste le 2026-08-01 : `/quiz` gardait la matière en état interne,
    // donc la pastille de la bande ne menait nulle part — signalé comme une panne. Un lien
    // profond `?subject=` lui a été ajouté (patron de `/revision` et `/eli5`).
    ["quiz", "/quiz?subject=svt&from=svt"],
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

  it.each(["capsule", "eli5"] as const)(
    "« %s » n'a AUCUNE surface matière — et ce n'est pas un oubli",
    (kind) => {
      // `/capsules` est une liste globale (aucun `/capsules/:slug`) et ELI5 n'est adressable
      // que par notion. Renvoyer `null` oblige l'appelant à ne pas les rendre cliquables —
      // ET à les rendre visiblement inertes, sinon ils se lisent comme une panne.
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

// ─────────────────────────────────────────────────────────────────────────────
// Parité front ↔ contrat de grammaire (ADR-0059 §A4)
//
// Le pendant exact de `test_chat_routes_contract.py`. Le contrat est un ORACLE écrit à la main,
// extérieur aux deux implémentations : ni le serveur ni ce fichier ne le génèrent. C'est ce qui
// lui permet d'attraper une divergence — dérivé de l'un des deux, il certifierait le bug.
//
// 🔴 **La décoration est écrite EN CLAIR ici**, jamais normalisée en douce. Le front ajoute un
// rétrolien `&from=<slug>` que le chat ne doit pas émettre : c'est une différence assumée, pas un
// écart. La masquer par une comparaison « à la décoration près » rendrait le verrou aveugle à une
// vraie régression sur le rétrolien.
import CONTRAT from "../../../../packages/types/src/notionRouteContract.json";

const RETROLIEN = `&${SUBJECT_BACK_PARAM}=svt`;

/** Décoration ajoutée par le front, activité par activité. Vide = aucune. */
const DECORATION: Partial<Record<GalaxyAction["kind"], string>> = {
  eli5: RETROLIEN,
  revision: RETROLIEN,
};

const AVEC_ID: Record<string, Partial<GalaxyAction>> = {
  cours: { lesson_id: CONTRAT.fixture.lessonId },
  fiche: { fiche_id: CONTRAT.fixture.ficheId },
  mindmap: { mindmap_id: CONTRAT.fixture.mindmapId },
  quiz: { quiz_id: CONTRAT.fixture.quizId },
  capsule: { capsule_id: CONTRAT.fixture.capsuleId },
  eli5: {},
  revision: {},
};

describe("parité avec le contrat de grammaire", () => {
  it.each(TOUTES.filter((k) => !CONTRAT.frontAsync.includes(k)))(
    "« %s » ouvre la ressource exacte du contrat",
    (kind) => {
      const action = { kind, available: true, ...AVEC_ID[kind] } as GalaxyAction;
      const route = notionRouteFor(action, CTX);
      expect(route.mode).toBe("navigate");
      const attendu =
        CONTRAT.byId[kind as keyof typeof CONTRAT.byId] + (DECORATION[kind] ?? "");
      expect(route.mode === "navigate" && route.to).toBe(attendu);
    },
  );

  it("le quiz est l'EXCEPTION nommée : chargement asynchrone, pas une URL", () => {
    // Il a pourtant une adresse (`/quiz?quiz=`, que le chat utilise). Ici on garde le mode
    // asynchrone parce que `returnTo` doit ramener à /galaxy depuis la constellation, et que
    // `?from=` ne transporte qu'un slug de matière. Exception NOMMÉE dans le contrat plutôt que
    // trou silencieux dans le verrou.
    expect(CONTRAT.frontAsync).toEqual(["quiz"]);
    const route = notionRouteFor(
      { kind: "quiz", available: true, quiz_id: CONTRAT.fixture.quizId } as GalaxyAction,
      CTX,
    );
    expect(route.mode).toBe("quiz");
  });

  it.each(TOUTES)("« %s » : la route de MATIÈRE est celle du contrat", (kind) => {
    const attendu = CONTRAT.bySubject[kind as keyof typeof CONTRAT.bySubject];
    const obtenu = subjectRouteFor(kind, "svt");
    // `subjectRouteFor` décore aussi (revision, quiz) : on compose, on ne normalise pas.
    const attenduDecore =
      attendu === null ? null : attendu + (kind === "revision" || kind === "quiz" ? RETROLIEN : "");
    expect(obtenu).toBe(attenduDecore);
  });

  it("le type demandé à Papa est celui du contrat (seconde table jumelle)", () => {
    // Le chat a été le SEUL menteur du dépôt jusqu'au 2026-08-15 : son repli enregistrait
    // « cours » pour toute demande de quiz. `REQUESTABLE_KIND` était déjà juste.
    expect(REQUESTABLE_KIND).toEqual(CONTRAT.requestKind);
  });

  it("le contrat couvre EXACTEMENT la panoplie — une 8ᵉ activité casserait ici", () => {
    expect(Object.keys(CONTRAT.byId).sort()).toEqual([...TOUTES].sort());
    expect(Object.keys(CONTRAT.bySubject).sort()).toEqual([...TOUTES].sort());
  });
});
