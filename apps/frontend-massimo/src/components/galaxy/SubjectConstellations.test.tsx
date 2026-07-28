import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GalaxySubject } from "@zetis/types";
import { SubjectConstellations } from "./SubjectConstellations";

const subjects: GalaxySubject[] = [
  { subject_id: 1, name: "SVT", slug: "svt", lit: 2, total: 11 },
  { subject_id: 2, name: "Espagnol", slug: "espagnol", lit: 0, total: 0 },
];

function planetLayers(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('span[class*="animate-"]')];
}

describe("planètes des matières", () => {
  it("anime chaque sphère, en motion-safe uniquement", () => {
    const { container } = render(<SubjectConstellations subjects={subjects} onOpen={() => {}} />);
    const layers = planetLayers(container);
    expect(layers.length).toBeGreaterThan(0);
    // `motion-safe:` est ce qui neutralise l'animation sous prefers-reduced-motion. Sans ce
    // préfixe, la planète tournerait même pour qui a demandé qu'on arrête de bouger.
    for (const layer of layers) expect(layer.className).toContain("motion-safe:animate-");
  });

  it("garde la tuile à 160px — la largeur DOIT égaler le trajet du keyframe", () => {
    // Invariant fragile et déjà cassé une fois : avec une tuile de 80px (= la sphère), aucun
    // relief n'entre ni ne sort du champ, le motif paraît figé et rien ne semble tourner.
    // Le keyframe `zetis-planet-spin` va de 0 à -160px : les deux doivent rester d'accord.
    const { container } = render(<SubjectConstellations subjects={subjects} onOpen={() => {}} />);
    for (const layer of planetLayers(container)) {
      expect(layer.style.backgroundSize).toBe("160px 80px");
    }
  });

  it("superpose deux couches à vitesses différentes — la parallaxe fait la sphère", () => {
    const { container } = render(
      <SubjectConstellations subjects={[subjects[0]]} onOpen={() => {}} />,
    );
    const durations = planetLayers(container).map((l) =>
      l.style.getPropertyValue("--spin") || l.style.getPropertyValue("--haze"),
    );
    expect(durations).toHaveLength(2);
    expect(durations[0]).not.toBe(durations[1]);
  });

  it("annonce un COMPTE d'étoiles, jamais un pourcentage", () => {
    const { container } = render(<SubjectConstellations subjects={subjects} onOpen={() => {}} />);
    expect(screen.getByText(/2 étoiles allumées/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/%/);
  });

  it("pose le PICTOGRAMME de marque, jamais un emoji", () => {
    // `design-system.md §Pictogrammes de matière` l'interdit explicitement, et un emoji
    // change de dessin selon l'OS — l'identité visuelle ne peut pas en dépendre.
    const { container } = render(<SubjectConstellations subjects={subjects} onOpen={() => {}} />);
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    // Décoratif : le nom de la matière est écrit juste en dessous, un `alt` le doublerait.
    expect(img?.getAttribute("alt")).toBe("");
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("montre une main sur une planète ouvrable, pas sur une planète vide", () => {
    // ⚠️ La préflight de Tailwind v4 met `cursor: default` sur les <button> — contrairement
    // à v3. Sans `cursor-pointer` EXPLICITE, rien n'indique qu'une planète se clique.
    render(<SubjectConstellations subjects={subjects} onOpen={() => {}} />);
    expect(screen.getByRole("button", { name: /SVT/ }).className).toContain("cursor-pointer");
    expect(screen.getByRole("button", { name: /Espagnol/ }).className).toContain("cursor-default");
  });

  it("éclaire la planète au survol, et laisse la matière vide éteinte", () => {
    const { container } = render(
      <SubjectConstellations subjects={subjects} onOpen={() => {}} />,
    );
    const [svt, espagnol] = [...container.querySelectorAll("button")];
    const sphere = (b: Element) => b.querySelector("span")!.className;
    expect(sphere(svt)).toContain("group-hover:brightness-125");
    expect(sphere(svt)).toContain("group-hover:shadow-");
    expect(sphere(espagnol)).not.toContain("group-hover:");
  });

  it("n'ouvre pas une matière encore vide", () => {
    render(<SubjectConstellations subjects={subjects} onOpen={() => {}} />);
    expect(screen.getByRole("button", { name: /Espagnol/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /SVT/ }).hasAttribute("disabled")).toBe(false);
  });
});
