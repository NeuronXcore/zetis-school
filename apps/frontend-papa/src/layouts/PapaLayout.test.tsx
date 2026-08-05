import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@zetis/auth", async (orig) => ({
  ...(await orig<typeof import("@zetis/auth")>()),
  useAuth: () => ({ user: { username: "papa" }, logout: () => undefined }),
}));

// Le layout monte les deux hooks réseau de l'application. On les neutralise : la plupart de ces
// tests portent sur l'identité de l'interface, pas sur la production ni sur l'autonomie.
const etat = vi.hoisted(() => ({ run: null as Record<string, unknown> | null }));
vi.mock("../hooks/useActiveProductionRun", () => ({
  useActiveProductionRun: () => ({ run: etat.run, finished: null, acknowledge: () => undefined }),
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

function lot(over: Record<string, unknown>) {
  return {
    id: 42,
    status: "queued",
    trigger: "manual",
    authorized_by: "parent_direct",
    chapter_id: null,
    scope_skill_id: 50,
    scope_kind: "cours",
    scope_skill_name: "Accord du COD",
    total_notions: null,
    done_notions: null,
    progress_pct: 0,
    created_at: "2026-08-04T12:24:00Z",
    finished_at: null,
    ...over,
  };
}

afterEach(() => {
  etat.run = null;
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
    etat.run = lot({ status: "queued" });
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
    etat.run = lot({ status: "queued", worker_alive: false });
    const { container } = show();
    const header = container.querySelector("header")!;

    expect(header.textContent).toContain("aucun moteur de production actif");
    // Le VERBE suit l'état : ZETIS ne va pas produire, il ne produit pas.
    expect(header.textContent).toContain("ZETIS ne produit pas");
    expect(header.textContent).not.toContain("ZETIS va produire");
    expect(header.textContent).not.toMatch(/\d+\s?%/);
    expect(header.querySelector(".animate-pulse")).toBeNull();
  });

  it("🔒 un worker PRÉSENT laisse l'attente ordinaire — et son point bat", () => {
    // La contre-épreuve : sans elle, un indicateur qui dirait « arrêté » en permanence passerait
    // le test précédent au vert. ⚠️ `worker_alive` ABSENT ne vaut pas `false` — seule la route
    // `/runs/active` pose la question ; ailleurs on ne présume pas d'une panne.
    etat.run = lot({ status: "queued", worker_alive: true });
    const { container } = show();
    const header = container.querySelector("header")!;

    expect(header.textContent).toContain("en file d'attente");
    expect(header.textContent).not.toContain("aucun moteur");
    expect(header.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("un lot DÉMARRÉ, lui, affiche bien son avancement", () => {
    // La contre-épreuve du test précédent : si l'indicateur se taisait dans les deux cas, le
    // verrou serait vert pour la mauvaise raison.
    etat.run = lot({ status: "running", total_notions: 4, done_notions: 2, progress_pct: 50 });
    const { container } = show();

    expect(container.querySelector("header")!.textContent).toContain("50%");
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
