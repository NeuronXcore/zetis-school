import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ActivityItem, ProductionActivity } from "@zetis/types";

vi.mock("@zetis/auth", async (orig) => ({
  ...(await orig<typeof import("@zetis/auth")>()),
  useAuth: () => ({ user: { username: "papa" }, logout: () => undefined }),
}));

// Le layout monte les deux hooks réseau de l'application. On les neutralise : la plupart de ces
// tests portent sur l'identité de l'interface, pas sur la production ni sur l'autonomie.
// ⚠️ **La source de la barre a changé (ADR-0041)** : l'en-tête ne lit plus « le lot actif » mais
// TOUTE l'activité — lots ET travaux unitaires. Les verrous ci-dessous portent sur la même
// doctrine, exercée sur la nouvelle source : jamais de pourcentage sur ce qui n'a pas démarré,
// « en file » ≠ « arrêté », et le point qui cesse de battre quand rien ne bouge.
const etat = vi.hoisted(() => ({
  run: null as Record<string, unknown> | null,
  activity: null as ProductionActivity | null,
}));
vi.mock("../hooks/useActiveProductionRun", () => ({
  useActiveProductionRun: () => ({ run: etat.run, finished: null, acknowledge: () => undefined }),
}));
vi.mock("../hooks/useProductionActivity", () => ({
  useProductionActivity: () => ({
    activity: etat.activity ?? {
      current: null,
      queued_count: 0,
      queued: [],
      failed: [],
      refused: [],
      worker_alive: null,
      media_alive: null,
    },
    acknowledge: () => undefined,
  }),
}));
vi.mock("../hooks/useAutonomyState", async (orig) => ({
  ...(await orig<typeof import("../hooks/useAutonomyState")>()),
  useAutonomyState: () => ({ status: "loading" as const }),
}));

import { PapaLayout } from "./PapaLayout";

function show() {
  return render(
    <MemoryRouter>
      <PapaLayout />
    </MemoryRouter>,
  );
}

/** Une activité minimale — la forme que le serveur rend vraiment.
 *
 *  🔴 **TYPÉS depuis le 2026-08-07, et ce n'est pas de la cosmétique.** Ces deux fabriques étaient
 *  en `Record<string, unknown>` : quand `ProductionActivity` a gagné `refused`, `tsc` n'a rien vu
 *  et le layout est tombé à l'exécution sur `activity.refused[0]`. Un fixture non typé ne décrit
 *  plus le contrat, il décrit ce dont le test a envie. */
function activite(
  current: ActivityItem | null,
  over: Partial<ProductionActivity> = {},
): ProductionActivity {
  return {
    current,
    queued_count: 0,
    queued: [],
    failed: [],
    refused: [],
    worker_alive: null,
    media_alive: null,
    ...over,
  };
}

function travail(over: Partial<ActivityItem> = {}): ActivityItem {
  return {
    kind: "run",
    id: 42,
    label: "Cours · Accord du COD",
    status: "queued",
    lane: "llm",
    // ⚠️ `null`, JAMAIS 0 — le serveur ne dit plus « 0 % » sur ce qui n'a pas démarré.
    pct: null,
    pct_is_measured: false,
    pieces_done: null,
    pieces_total: null,
    pieces_produced: 0,
    current_piece: null,
    started_at: null,
    trigger: "manual",
    error: null,
    estimated_ms: 30_000,
    ...over,
  };
}

afterEach(() => {
  etat.run = null;
  etat.activity = null;
});

describe("PapaLayout", () => {
  it("🔒 signe l'interface — les deux frontends ne doivent pas se confondre", () => {
    // `docs/frontend-papa/README.md` : « l'interface ne doit pas être mélangée avec celle de
    // Massimo ». Le bloc d'état de ZETIS est IDENTIQUE des deux côtés du miroir ; sans ce mot,
    // une capture d'écran de Papa ne se distingue plus d'une capture de Massimo.
    const { container } = show();
    const header = container.querySelector("header");

    expect(header).not.toBeNull();
    expect(header!.textContent).toContain("ZETIS Papa");
  });

  it("🔒 la signature vit dans le HEADER, jamais dans la sidebar (addendum §7.2bis)", () => {
    // La sidebar est la colonne rare — 22 entrées à faire tenir. Le header, fixe depuis le
    // 2026-08-04, ne coûte rien. Ce test empêche la ré-ajouter « pour réparer un oubli ».
    const { container } = show();

    expect(container.querySelector("aside")!.textContent).not.toContain("ZETIS Papa");
  });

  it("🔒 un lot EN FILE n'affiche AUCUN pourcentage", () => {
    // Le défaut du 2026-08-04 : l'estimation démarrait avec le lot, pas avec sa production. Un lot
    // `queued` que personne ne consommait (worker éteint) montait donc à 95 % et y restait —
    // l'indicateur annonçait un travail qui n'avait jamais commencé.
    etat.activity = activite(travail({ status: "queued" }), { worker_alive: true });
    const { container } = show();
    const header = container.querySelector("header")!;

    expect(header.textContent).toContain("en file d'attente");
    expect(header.textContent).not.toMatch(/\d+\s?%/);
    // Le verbe aussi : « ZETIS produit … en file d'attente » se contredit tout seul.
    expect(header.textContent).toContain("ZETIS va produire");
  });

  it("🔒 un lot en file SANS WORKER dit l'arrêt, et son point cesse de battre", () => {
    // Addendum ADR-0036 « une file que personne n'écoute » §1. Les règles de cette section vivaient
    // dans le code et dans un document, **sans aucun verrou** — constaté en écrivant l'addendum.
    //
    // ⚠️ Le cœur du test est la DERNIÈRE assertion. Le texte se relit ; l'animation, non — et c'est
    // elle qu'on regarde en premier. Un point qui pulse sur une file arrêtée ment avant qu'on ait
    // lu la phrase, et un `className` conditionnel se « simplifie » sans que rien ne rougisse.
    etat.activity = activite(travail({ status: "queued" }), { worker_alive: false });
    const { container } = show();
    const header = container.querySelector("header")!;

    expect(header.textContent).toContain("aucun moteur de production actif");
    // Le VERBE suit l'état : ZETIS ne va pas produire, il ne produit pas.
    expect(header.textContent).toContain("ZETIS ne produit pas");
    expect(header.textContent).not.toContain("ZETIS va produire");
    expect(header.textContent).not.toMatch(/\d+\s?%/);
    // ⚠️ **Le crochet a changé le 2026-08-07, l'invariant PAS D'UN POUCE.** L'ancienne pilule
    // portait un point qui battait (`.animate-pulse`) ; la bande porte un tapis qui balaie. Dans
    // les deux cas la question est la même : *est-ce que quelque chose bouge alors que personne
    // n'écoute la file ?* — et la réponse doit rester non.
    //
    // `[data-balaie]` plutôt qu'une classe : l'attribut PORTE l'animation dans `index.css`, donc
    // l'observer c'est observer le mouvement lui-même. Un `className` conditionnel est exactement
    // ce qu'un refactor Tailwind renomme sans que rien ne rougisse — la crainte que ce test
    // écrivait déjà.
    expect(header.querySelector("[data-balaie]")).toBeNull();
    // Et les rouages ne tournent pas non plus : rien n'a démarré.
    expect(header.querySelector("[data-tourne]")).toBeNull();
  });

  it("🔒 un worker PRÉSENT laisse l'attente ordinaire — et son point bat", () => {
    // La contre-épreuve : sans elle, un indicateur qui dirait « arrêté » en permanence passerait
    // le test précédent au vert. ⚠️ `worker_alive` ABSENT ne vaut pas `false` — seule la route
    // `/runs/active` pose la question ; ailleurs on ne présume pas d'une panne.
    etat.activity = activite(travail({ status: "queued" }), { worker_alive: true });
    const { container } = show();
    const header = container.querySelector("header")!;

    expect(header.textContent).toContain("en file d'attente");
    expect(header.textContent).not.toContain("aucun moteur");
    // La contre-épreuve : une file SERVIE balaie. Sans elle, un tapis figé en permanence
    // passerait le test précédent au vert.
    expect(header.querySelector("[data-balaie]")).not.toBeNull();
  });

  it("un lot DÉMARRÉ, lui, affiche bien son avancement", () => {
    // La contre-épreuve du test précédent : si l'indicateur se taisait dans les deux cas, le
    // verrou serait vert pour la mauvaise raison.
    etat.activity = activite(
      travail({ status: "running", pct: 50, pct_is_measured: true, started_at: "2026-08-06T10:00:00Z" }),
    );
    const { container } = show();

    // `50 %` avec une espace : typographie française, et c'est ce que rend la maquette.
    expect(container.querySelector("header")!.textContent).toMatch(/50\s?%/);
  });

  it("🔒 le header et la sidebar ne défilent pas avec le contenu", () => {
    // Le défaut réparé le 2026-08-04 : sans clipping, la sidebar (~1100 px) faisait grandir le
    // DOCUMENT, et c'est le body qui scrollait — emportant les deux hors de l'écran.
    const { container } = show();
    const wrapper = container.firstElementChild as HTMLElement;

    expect(wrapper.className).toContain("overflow-hidden");
    expect(container.querySelector("main")!.className).toContain("overflow-auto");
  });
});
