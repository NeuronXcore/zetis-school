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
    expect(c.textContent).toContain("aucun moteur de production actif");
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

  it("🔒 la file se COMPTE, elle ne se dessine pas", () => {
    // Fondre plusieurs travaux dans une barre unique la ferait RECULER à chaque ajout. Une barre
    // = un travail ; la file est un chiffre à côté.
    const c = montre(activite({ current: item(), queued_count: 3, worker_alive: true }));
    expect(c.textContent).toContain("3 en attente");
    // Et le pourcentage reste celui du travail COURANT, pas une moyenne.
    expect(c.textContent).toContain("37 %");
  });
});
