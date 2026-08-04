import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type Autonomy } from "@zetis/types";

import { PRESET_LABEL } from "../lib/settings";
import { type AutonomyState } from "../hooks/useAutonomyState";
import { EtatZetis } from "./EtatZetis";

const REGIMES = ["Manuel", "Semi-autonome", "Autonome", "Sur mesure"];

function ready(overrides: Partial<Autonomy> = {}): AutonomyState {
  return {
    status: "ready",
    autonomy: { auto_trigger_enabled: false, classes: [], preset: "semi", ...overrides },
  };
}

function show(state: AutonomyState) {
  return render(
    <MemoryRouter>
      <EtatZetis state={state} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EtatZetis", () => {
  it("🔒 n'affiche AUCUN régime avant la réponse serveur (addendum §7.4)", () => {
    const { container } = show({ status: "loading" });

    // « Un régime faux affiché une seconde est un mensonge » — et ici il le serait sur 22 pages.
    for (const label of REGIMES) expect(screen.queryByText(label)).toBeNull();
    // Le halo est ABSENT, pas invisible : un réceptacle vide finirait par se remplir d'un défaut.
    expect(container.querySelector(".regime-halo")).toBeNull();
    expect(screen.getByRole("link")).toHaveAttribute("aria-busy", "true");
  });

  it("🔒 à l'erreur, le dit — sans régime de repli et sans une seule classe rouge", () => {
    const { container } = show({ status: "error" });

    expect(screen.getByText("État indisponible")).toBeInTheDocument();
    for (const label of REGIMES) expect(screen.queryByText(label)).toBeNull();
    expect(container.querySelector(".regime-halo")).toBeNull();
    // §7.6 : le rouge de ce bloc est celui de l'avatar Autonome et veut dire « ZETIS a tous les
    // droits ». Un message d'erreur rouge rendrait les deux indiscernables.
    expect(container.innerHTML).not.toMatch(/red-/);
  });

  it("🔒 déclencheur DÉSARMÉ : jamais « démarre seul », régime Autonome compris", () => {
    const { container } = show(ready({ preset: "autonome", auto_trigger_enabled: false }));

    // La ligne 3 de la table de vérité : « ZETIS sert seul MAIS il attend votre clic ». C'est
    // exactement ce qu'un signe unique rendrait impossible à dire.
    expect(screen.getByText(/démarre sur clic/)).toBeInTheDocument();
    expect(screen.queryByText(/démarre seul/)).toBeNull();
    expect(container.querySelector(".regime-orbit")).toBeNull();
  });

  it("🔒 déclencheur ARMÉ sous régime Manuel : « démarre seul » ET le point", () => {
    const { container } = show(ready({ preset: "manuel", auto_trigger_enabled: true }));

    // Le symétrique. Les deux tests ENSEMBLE prouvent que les axes sont indépendants ; l'un seul
    // passerait avec un composant qui déduirait le déclencheur du régime.
    expect(screen.getByText(/démarre seul/)).toBeInTheDocument();
    expect(screen.queryByText(/démarre sur clic/)).toBeNull();
    expect(container.querySelector(".regime-orbit")).not.toBeNull();
  });

  it("gradue le halo par régime — et Manuel n'emprunte celui d'aucun autre", () => {
    for (const [preset, classe] of [
      ["manuel", "regime-halo--manuel"],
      ["semi", "regime-halo--semi"],
      ["autonome", "regime-halo--autonome"],
    ] as const) {
      const { container, unmount } = show(ready({ preset }));
      const halo = container.querySelector(".regime-halo");
      expect(halo).not.toBeNull();
      expect(halo!.className).toContain(classe);
      unmount();
    }

    const { container } = show(ready({ preset: "manuel" }));
    expect(container.querySelector(".regime-halo")!.className).not.toMatch(/semi|autonome/);
  });

  it("« Sur mesure » se rend sans ressembler à une anomalie", () => {
    // ⚠️ Cet état est INATTEIGNABLE par l'API (deux classes libres, la monotonie interdit le
    // quatrième couple). Ce test est sa SEULE preuve : ne pas le supprimer en le croyant mort.
    const { container } = show(ready({ preset: null, auto_trigger_enabled: true }));

    expect(screen.getByText("Sur mesure")).toBeInTheDocument();
    expect(container.querySelector(".regime-halo")!.className).toContain("regime-halo--sur-mesure");
    // Le déclencheur, lui, on le connaît : la ligne 2 reste rendue.
    expect(screen.getByText(/démarre seul/)).toBeInTheDocument();
  });

  it("🔒 les libellés viennent de la source unique, ils ne sont pas recopiés", () => {
    show(ready({ preset: "semi" }));
    // Une recopie en dur (« Semi-auto ») casserait ici, et seulement ici.
    expect(screen.getByText(PRESET_LABEL.semi)).toBeInTheDocument();
  });

  it("🔒 ne fait AUCUN appel réseau, dans aucun de ses états", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const etats: AutonomyState[] = [
      { status: "loading" },
      { status: "error" },
      ready({ preset: "manuel" }),
      ready({ preset: "semi" }),
      ready({ preset: "autonome", auto_trigger_enabled: true }),
      ready({ preset: null }),
    ];
    for (const state of etats) show(state).unmount();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("est un LIEN vers les Paramètres — il lit, il ne règle pas (§7.3)", () => {
    show(ready({ preset: "semi" }));
    const lien = screen.getByRole("link");
    expect(lien).toHaveAttribute("href", "/parametres");
    // Aucun bouton : rien ne se change depuis ce bloc.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("son nom accessible porte les DEUX axes, et l'image n'en porte aucun", () => {
    const { container } = show(ready({ preset: "autonome", auto_trigger_enabled: true }));

    const lien = screen.getByRole("link", { name: /Autonome/ });
    expect(lien.getAttribute("aria-label")).toMatch(/démarre seul/);
    // L'image est décorative PARCE QUE le texte est là : un `alt` non vide écraserait le nom du
    // lien, qui est le seul à dire les deux axes.
    expect(container.querySelector("img[aria-hidden]")).not.toBeNull();
    expect(container.querySelector("img[alt]:not([alt=''])")).toBeNull();
  });

  it("donne la description complète au survol — la valeur ajoutée du bloc", () => {
    show(ready({ preset: "autonome" }));
    expect(screen.getByRole("link")).toHaveAttribute("title", expect.stringContaining("ZETIS"));
  });
});
