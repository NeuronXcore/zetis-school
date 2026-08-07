import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { type ActivityItem, type ProductionActivity } from "@zetis/types";

import { ProductionStrip } from "./ProductionStrip";

// La bande de production (addendum 2 ADR-0041). Ces verrous portent sur ce qu'aucun test ne
// prouvera jamais complètement — le MOUVEMENT — en visant la seule chose observable en jsdom : la
// présence ou l'absence des attributs qui PORTENT les animations.
//
// 🔴 `data-tourne` et `data-balaie` ne sont pas des marqueurs de test posés à côté du code : le CSS
// s'y accroche (`[data-balaie] { animation: … }`). Les observer, c'est observer le mouvement
// lui-même — et non un `className` qu'un refactor Tailwind renomme sans que rien ne rougisse.
// C'est la cinquième fois que ce dépôt paie un verrou qui visait le voisinage plutôt que la règle.

function item(over: Partial<ActivityItem> = {}): ActivityItem {
  return {
    kind: "run",
    id: 1,
    label: "Équipement · Les fractions",
    status: "running",
    lane: "llm",
    pct: 37,
    pct_is_measured: true,
    pieces_done: 7,
    pieces_total: 19,
    pieces_produced: 7,
    current_piece: "fiche",
    started_at: new Date().toISOString(),
    trigger: "manual",
    error: null,
    estimated_ms: 60_000,
    ...over,
  };
}

function activite(over: Partial<ProductionActivity> = {}): ProductionActivity {
  return {
    current: null,
    queued_count: 0,
    queued: [],
    failed: [],
    refused: [],
    worker_alive: null,
    media_alive: null,
    ...over,
  };
}

function montre(a: ProductionActivity) {
  const { container } = render(
    <ProductionStrip activity={a} onOpen={vi.fn()} onOpenStock={vi.fn()} />,
  );
  return container;
}

describe("ProductionStrip — les états de la bande", () => {
  it("🔒 AU REPOS, rien ne bouge et rien ne compte", () => {
    // §19 — la bande se replie au lieu de disparaître, et ne garde QUE la boîte. Ce que le §7
    // interdisait — un compteur permanent qui vous regarde — reste interdit : le repos ne porte
    // aucun chiffre, aucun libellé, et un seul objet cliquable.
    const c = montre(activite());
    expect(c.querySelector("[data-tourne]")).toBeNull();
    expect(c.querySelector("[data-balaie]")).toBeNull();
    expect(c.textContent).not.toMatch(/\d+\s?%/);
    expect(c.querySelectorAll("button")).toHaveLength(1);
  });

  it("🔒 EN COURS et mesuré : la fraction en PIÈCES, et le tapis défile", () => {
    // La fraction est la preuve : « 37 % » seul ne se distingue pas d'une estimation bien tournée.
    const c = montre(activite({ current: item(), worker_alive: true }));
    expect(c.textContent).toContain("37 %");
    expect(c.textContent).toContain("7 / 19 pièces");
    expect(c.querySelector("[data-tourne]")).not.toBeNull();
    // La texture EST le mouvement entre deux paliers — sans elle, la barre est immobile 69 s.
    expect(c.querySelector(".zetis-tapis-texture")).not.toBeNull();
  });

  it("🔒 EN COURS et NON mesuré : aucun chiffre, et AUCUNE CASE", () => {
    // « Sans granularité, aucun chiffre — et aucune case. » Un « — » à cet endroit se lirait
    // encore comme une valeur.
    const c = montre(
      activite({
        current: item({ pct: null, pct_is_measured: false, pieces_done: null, pieces_total: null }),
        worker_alive: true,
      }),
    );
    expect(c.textContent).not.toMatch(/\d+\s?%/);
    expect(c.textContent).not.toContain("pièces");
    expect(c.querySelector("[data-balaie]")).not.toBeNull();
  });

  it("🔒 EN FILE : aucun pourcentage, et le tapis BALAIE puisque la file est servie", () => {
    const c = montre(activite({ current: item({ status: "queued" }), worker_alive: true }));
    expect(c.textContent).toContain("en file d'attente");
    expect(c.textContent).not.toMatch(/\d+\s?%/);
    expect(c.querySelector("[data-balaie]")).not.toBeNull();
    // Rien n'a démarré : les rouages ne tournent pas.
    expect(c.querySelector("[data-tourne]")).toBeNull();
  });

  it("🔒 ARRÊTÉ : le mot de l'arrêt, et PLUS RIEN ne bouge", () => {
    // 🔴 Une file sans consommateur n'est pas une attente, c'est un arrêt. Et une animation sur
    // une file arrêtée ment avant qu'on ait lu la phrase — c'est elle qu'on regarde en premier.
    const c = montre(activite({ current: item({ status: "queued" }), worker_alive: false }));
    expect(c.textContent).toContain("aucun moteur de production actif");
    expect(c.textContent).toContain("ne produit pas");
    expect(c.textContent).not.toContain("en file d'attente");
    expect(c.querySelector("[data-balaie]")).toBeNull();
    expect(c.querySelector("[data-tourne]")).toBeNull();
  });

  it("🔒 le couloir MÉDIA lit SON worker, pas celui de la production", () => {
    // Trouvé à l'écran le 2026-08-07 sur un rendu vidéo réellement bloqué : `worker_alive` ne
    // parle que des files de production. Un rendu média derrière un worker vidéo mort affichait
    // « ZETIS va produire » — la file paraissait servie alors que personne ne l'écoutait.
    const c = montre(
      activite({
        current: item({ status: "queued", lane: "media", label: "Rendu vidéo · L'Antécédent" }),
        // ⚠️ Le piège exact : le worker de PRODUCTION est vivant, celui du MÉDIA est mort.
        worker_alive: true,
        media_alive: false,
      }),
    );
    // ⚠️ **Le mot nomme LE BON moteur.** Le premier jet disait « aucun moteur de production
    // actif » sur un rendu vidéo : Papa serait allé vérifier le worker de production, qui tournait
    // très bien. Un diagnostic qui envoie au mauvais endroit est pire que pas de diagnostic.
    expect(c.textContent).toContain("aucun moteur de rendu vidéo actif");
    expect(c.textContent).not.toContain("moteur de production");
    expect(c.querySelector("[data-balaie]")).toBeNull();
  });

  it("⚠️ `null` n'est PAS `false` — sans réponse, on n'annonce pas une panne", () => {
    // La question n'a pas été posée : la file est ordinaire tant qu'on ne sait pas.
    const c = montre(activite({ current: item({ status: "queued" }), worker_alive: null }));
    expect(c.textContent).not.toContain("aucun moteur");
    expect(c.querySelector("[data-balaie]")).not.toBeNull();
  });

  it("🔒 ÉCHEC : le motif est rendu TEL QUEL, sans traduction", () => {
    // Décision du commanditaire, 2026-08-06 : un motif sert à savoir quoi réparer, pas à
    // rassurer. Une table « technique → phrase douce » a été explicitement écartée.
    const c = montre(
      activite({
        failed: [item({ status: "failed", error: 'Aucun exécutant pour "capsule_render_v2".' })],
      }),
    );
    expect(c.textContent).toContain('Aucun exécutant pour "capsule_render_v2".');
    expect(c.querySelector("[data-tourne]")).toBeNull();
  });

  it("🔒 REFUS : ce n'est pas une panne, et ça n'affiche aucun pourcentage", () => {
    const c = montre(
      activite({
        refused: [
          {
            id: 3,
            regulator: "pending_backlog",
            detail: "34 contenus attendent déjà votre relecture (plafond : 30).",
            trigger: "agenda",
            created_at: "2026-08-07T02:00:00Z",
          },
        ],
      }),
    );
    expect(c.textContent).toContain("Rien lancé");
    expect(c.textContent).toContain("34 contenus attendent déjà votre relecture");
    expect(c.textContent).not.toMatch(/\d+\s?%/);
    expect(c.querySelector("[data-tourne]")).toBeNull();
  });

  it("🔒 un REFUS ne masque jamais une production EN COURS", () => {
    // 🔴 Trouvé à l'écran le 2026-08-07 : la bande annonçait « Rien lancé » pendant que ses
    // rouages tournaient et que son tapis défilait — elle se contredisait dans le même coup d'œil.
    // Un refus explique pourquoi rien n'a démarré : il n'a de sens que quand rien ne tourne.
    const c = montre(
      activite({
        current: item({ status: "running" }),
        worker_alive: true,
        refused: [
          {
            id: 9,
            regulator: "duplicate",
            detail: "Une production identique attend son tour déjà.",
            trigger: "agenda",
            created_at: "2026-08-07T02:00:00Z",
          },
        ],
      }),
    );
    expect(c.textContent).toContain("ZETIS produit");
    expect(c.textContent).not.toContain("Rien lancé");
    // …et les rouages tournent, ce qui est le fait que le libellé contredisait.
    expect(c.querySelector("[data-tourne]")).not.toBeNull();
  });

  it("🔒 une ANOMALIE garde son mot à TOUTE largeur", () => {
    // 🔴 Trouvé à l'écran le 2026-08-07 : à 700 px de header, l'arrêt se réduisait à un tapis
    // ambre — indistinguable d'une production qui va bien. Un état d'AVANCEMENT peut se taire
    // quand la place manque ; un état d'ANOMALIE, jamais.
    //
    // ⚠️ Ce test ne mesure PAS la largeur (jsdom n'a pas de ResizeObserver utile) : il vérifie que
    // le mot est rendu par la BRANCHE d'anomalie, pas par le seuil. C'est la seule part que le
    // rendu peut prouver — le repli lui-même se voit à l'écran, et il y a été vu.
    for (const [nom, etat] of [
      ["arrêt", activite({ current: item({ status: "queued" }), worker_alive: false })],
      [
        "échec",
        activite({ failed: [item({ status: "failed", error: "moteur injoignable" })] }),
      ],
    ] as const) {
      const c = montre(etat);
      expect(c.textContent, `${nom} : le mot doit rester`).toMatch(/ne produit pas|Échec/);
    }
  });

  it("🔒 la file se COMPTE, elle ne se dessine pas", () => {
    // Fondre plusieurs travaux dans une barre unique la ferait RECULER à chaque ajout. Une barre
    // = un travail ; la file est un chiffre à côté.
    const c = montre(activite({ current: item(), queued_count: 3, worker_alive: true }));
    expect(c.textContent).toContain("3 en attente");
    // Et le pourcentage reste celui du travail COURANT, pas une moyenne.
    expect(c.textContent).toContain("37 %");
  });
});

// ── Les engrenages et le dossier ──────────────────────────────────────────────────────────────
//
// 🔴 **CE BLOC EXISTE PARCE QUE LES 651 TESTS SONT RESTÉS VERTS PENDANT L'ÉCHANGE.** Aucun
// n'assertait sur l'intérieur des deux objets : on pouvait remplacer les rouages par n'importe
// quoi — ou par rien — sans qu'une seule ligne rougisse. Un test qui survit à la disparition de ce
// qu'il est censé protéger ne protège rien ; c'est la sixième fois que ce dépôt le constate.

describe("ProductionStrip — les engrenages et le dossier", () => {
  it("🔒 les engrenages sont DANS `[data-tourne]`, pas à côté", () => {
    // C'est LE verrou du chantier. Les six tests qui interrogent `[data-tourne]` prouvent que
    // l'attribut est posé au bon moment — aucun ne prouve que la chose animée est dessous. Or le
    // CSS d'origine du composant animait `.zx-gears__a` en permanence : branché tel quel, il aurait
    // tourné sur une bande arrêtée pendant que tous les verrous restaient au vert.
    const c = montre(activite({ current: item(), worker_alive: true }));
    expect(c.querySelector("[data-tourne] .zx-gears")).not.toBeNull();
  });

  it("🔒 rien ne tourne ⇒ les engrenages sont là, mais HORS de `[data-tourne]`", () => {
    // Immobiles et pas éteints : l'immobilité EST le signal, et c'est celui qu'on lit avant le
    // texte. Les retirer effacerait le signal au lieu de le figer (§942).
    const c = montre(activite({ current: item({ status: "stale" }), worker_alive: false }));
    expect(c.querySelector(".zx-gears")).not.toBeNull();
    expect(c.querySelector("[data-tourne] .zx-gears")).toBeNull();
  });

  it("🔒 le dossier compte les pièces PRODUITES, jamais les pièces RÉSOLUES", () => {
    // 🔴 La doctrine que portait `useBoiteRecoit`, désormais tenue par le composant. Une pièce
    // `skipped` a traversé le tapis mais était déjà en stock : `pieces_done` la compte, le dossier
    // ne doit pas. Ici 30 résolues pour 7 fabriquées — le dossier dit 7.
    const c = montre(
      activite({
        current: item({ pieces_done: 30, pieces_total: 45, pieces_produced: 7, pct: 67 }),
        worker_alive: true,
      }),
    );
    const pastille = c.querySelector(".zx-folder__n");
    expect(pastille?.textContent).toBe("7");
    // …et le nom accessible dit la même chose que la pastille.
    expect(c.querySelector(".zx-folder")?.getAttribute("aria-label")).toBe(
      "7 pièces déposées sur 45",
    );
  });

  it("🔒 AU REPOS le dossier reste, et il est le seul objet", () => {
    // §19 : c'est ce qui a justifié de replier la bande plutôt que de la faire disparaître. Le
    // repos ne porte QU'UN objet cliquable, et c'est lui.
    const c = montre(activite());
    expect(c.querySelector(".zx-folder")).not.toBeNull();
    expect(c.querySelector(".zx-gears")).toBeNull();
    expect(c.querySelectorAll("button")).toHaveLength(1);
    // Aucun chiffre : `count = 0` ⇒ pas de pastille. Un « 0 » permanent serait le compteur qui
    // vous regarde, que le §7 interdit.
    expect(c.querySelector(".zx-folder__n")).toBeNull();
  });
});
