import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet } from "react-router-dom";

// Renommage `/progression` → `/galaxy` (addendum ADR-0024 §A).
//
// Ce test protège la promesse écrite dans l'addendum : `/progression` n'est PLUS JAMAIS une page,
// seulement une redirection permanente — les liens et les signets antérieurs au 2026-07-31 ne
// cassent pas. Sans lui, transformer la redirection en page (ou la supprimer) passerait inaperçu.

// Le layout et la garde d'auth ne sont pas le sujet : on veut voir QUELLE page la route rend.
vi.mock("@zetis/auth", async (orig) => ({
  ...(await orig<typeof import("@zetis/auth")>()),
  RequireAuth: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("./layouts/MassimoLayout", () => ({
  MassimoLayout: () => <Outlet />,
}));
vi.mock("./pages/GalaxyPage", () => ({
  GalaxyPage: () => <div>page-galaxy</div>,
}));

import App from "./App";

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("routes — la Galaxy et son ancienne adresse", () => {
  it("/galaxy sert la page", () => {
    renderAt("/galaxy");
    expect(screen.getByText("page-galaxy")).toBeTruthy();
  });

  it("/progression redirige vers /galaxy et n'est jamais une page", () => {
    renderAt("/progression");
    // La même page est rendue : la redirection a eu lieu, et elle n'a rien affiché au passage.
    expect(screen.getByText("page-galaxy")).toBeTruthy();
    expect(screen.queryByText("Page introuvable")).toBeNull();
  });
});
