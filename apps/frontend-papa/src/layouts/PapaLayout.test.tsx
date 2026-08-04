import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@zetis/auth", async (orig) => ({
  ...(await orig<typeof import("@zetis/auth")>()),
  useAuth: () => ({ user: { username: "papa" }, logout: () => undefined }),
}));

// Le layout monte les deux hooks réseau de l'application. On les neutralise : ce test porte sur
// l'identité de l'interface, pas sur la production ni sur l'autonomie.
vi.mock("../hooks/useActiveProductionRun", () => ({
  useActiveProductionRun: () => ({ run: null, finished: null, acknowledge: () => undefined }),
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

  it("🔒 le header et la sidebar ne défilent pas avec le contenu", () => {
    // Le défaut réparé le 2026-08-04 : sans clipping, la sidebar (~1100 px) faisait grandir le
    // DOCUMENT, et c'est le body qui scrollait — emportant les deux hors de l'écran.
    const { container } = show();
    const wrapper = container.firstElementChild as HTMLElement;

    expect(wrapper.className).toContain("overflow-hidden");
    expect(container.querySelector("main")!.className).toContain("overflow-auto");
  });
});
