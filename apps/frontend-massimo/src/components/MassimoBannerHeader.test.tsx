import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ⚠️ CE FICHIER EST LE PREMIER TEST DU HEADER MASSIMO, ET SON EXISTENCE EST UN ACQUIS DU CHANTIER.
//
// Il n'y en avait AUCUN — pas par oubli : `NeuralLinks.tsx:30` construisait un `ResizeObserver`,
// que jsdom n'implémente pas et que `test/setup.ts` ne polyfille pas. Monter le header jetait
// donc `ReferenceError`, et personne ne pouvait rien verrouiller. Son remplaçant
// (`HeaderGalaxy`) teste `typeof ResizeObserver === "undefined"` et retombe sur un écouteur de
// `resize` : le header est enfin montable, et ce qui suit devient possible.
//
// Côté Papa, `PapaLayout.test.tsx` verrouillait déjà la signature de l'interface depuis le
// 2026-08-04. Ce fichier est son miroir.

const logout = vi.fn();
vi.mock("@zetis/auth", () => ({
  useAuth: () => ({ user: { username: "massimo" }, logout }),
}));

const fetchGamificationSummary = vi.fn();
vi.mock("../lib/gamification", () => ({
  fetchGamificationSummary: () => fetchGamificationSummary(),
}));

// Le décor a son propre fichier de tests : ici on ne veut que sa PRÉSENCE, pas son dessin.
vi.mock("./header/HeaderGalaxy", () => ({
  HeaderGalaxy: () => <canvas aria-hidden data-testid="header-galaxy" />,
}));

import { MassimoBannerHeader } from "./MassimoBannerHeader";

const show = () =>
  render(
    <MemoryRouter>
      <MassimoBannerHeader />
    </MemoryRouter>,
  );

beforeEach(() => {
  logout.mockReset();
  fetchGamificationSummary.mockReset().mockResolvedValue({ level: 9, total_xp: 2400 });
});

describe("MassimoBannerHeader — ce qui ne doit pas bouger", () => {
  it("🔒 la HAUTEUR du bandeau est figée — `GalaxyPage` la recopie en dur", () => {
    // ⚠️ `GalaxyPage.tsx:542` positionne son plein écran avec `top-24 … sm:top-28`, valeurs qui
    // RÉPLIQUENT ce `h-24 sm:h-28`. Les changer ici décale le plein écran de la galaxie sans que
    // rien ne le signale — le bandeau serait recouvert ou une bande vide apparaîtrait.
    const { container } = show();
    const header = container.querySelector("header");

    expect(header).not.toBeNull();
    expect(header!.className).toContain("h-24");
    expect(header!.className).toContain("sm:h-28");
  });

  it("🔒 le CADRAGE du sprite est figé — c'est un découpage au pixel", () => {
    // La bannière fait 1400×420 ; on n'en montre que le cercle et le livre, en la réduisant à
    // 356×107 et en la décalant de -136/-2. Les traînées d'onde tombent hors du cercle, et c'est
    // voulu. Une seule de ces quatre valeurs qui bouge, et l'emblème se décadre.
    const { container } = show();
    const emblem = container.querySelector('[style*="zetis-banner"]') as HTMLElement;

    expect(emblem).not.toBeNull();
    expect(emblem.style.backgroundSize).toBe("356px 107px");
    expect(emblem.style.backgroundPosition).toBe("-136px -2px");
  });

  it("🔒 les deux frontends ne se confondent pas", () => {
    // Miroir de `PapaLayout.test.tsx` : `docs/frontend-papa/README.md` veut que les deux
    // interfaces restent discernables. Le bandeau de Massimo ne porte JAMAIS la signature Papa.
    const { container } = show();

    expect(container.textContent).not.toContain("ZETIS Papa");
  });

  it("🔒 l'accès permanent à la galaxie survit au décor (ADR-0024 §7)", async () => {
    // Le bandeau est sur toutes les pages : ce lien EST l'accès à la progression. Le décor passe
    // dessous, jamais devant — s'il le recouvrait, on l'apprendrait par Massimo, pas par la CI.
    show();

    const link = await screen.findByRole("link", { name: /voir ma galaxie/i });
    expect(link.getAttribute("href")).toBe("/galaxy");
  });

  it("🔒 le bouton Déconnexion reste atteignable", () => {
    show();

    expect(screen.getByRole("button", { name: "Déconnexion" })).toBeTruthy();
  });

  it("🔒 niveau et XP en direct, avec repli sur le mock si le réseau tombe", async () => {
    // Comportement qui existait déjà et n'avait jamais été testé : une panne de gamification ne
    // doit pas vider le bandeau. `PROFILE` vaut niveau 7 / 1240 XP.
    fetchGamificationSummary.mockRejectedValue(new Error("Erreur 503"));
    show();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText(/Niveau 7/)).toBeTruthy();
    expect(screen.getByText(/1240 XP/)).toBeTruthy();
  });

  it("le niveau réel remplace le mock quand le serveur répond", async () => {
    show();

    await waitFor(() => expect(screen.getByText(/Niveau 9/)).toBeTruthy());
    expect(screen.getByText(/2400 XP/)).toBeTruthy();
  });
});

describe("MassimoBannerHeader — le coût permanent qu'on a supprimé", () => {
  it("🔒 plus AUCUNE animation SMIL dans le chrome de l'app", () => {
    // `NeuralLinks` en maintenait 32 en `repeatCount="indefinite"`, sur les 21 routes. Ce cas
    // échoue si quelqu'un les réintroduit « pour faire vivant » — c'est la galaxie qui fait
    // vivant maintenant, et elle s'arrête.
    const { container } = show();

    expect(container.querySelectorAll("animate")).toHaveLength(0);
  });

  it("🔒 plus AUCUN cube — 44 animations CSS infinies dont une sur `filter`", () => {
    // `hfx-twinkle` animait `filter: drop-shadow`, qui n'est pas composable : 22 éléments
    // repeints à chaque image, éternellement.
    const { container } = show();

    expect(container.querySelectorAll("[class*='hfx-cube']")).toHaveLength(0);
  });

  it("le halo autour de l'emblème, lui, est CONSERVÉ", () => {
    // Ses deux animations portent sur `opacity` et `transform` — composables, gratuites pour le
    // compositeur. Les supprimer aurait été un dommage collatéral, pas une décision.
    const { container } = show();

    expect(container.querySelector(".hfx-halo-glow")).not.toBeNull();
    expect(container.querySelector(".hfx-halo-ring")).not.toBeNull();
  });

  it("le décor est monté, une seule fois, et il est décoratif", () => {
    const { container } = show();
    const galaxy = screen.getByTestId("header-galaxy");

    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    expect(galaxy.getAttribute("aria-hidden")).toBe("true");
  });
});
