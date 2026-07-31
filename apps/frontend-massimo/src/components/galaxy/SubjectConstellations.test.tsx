import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GalaxySubject } from "@zetis/types";
import { SubjectConstellations } from "./SubjectConstellations";

const subjects: GalaxySubject[] = [
  { subject_id: 1, name: "SVT", slug: "svt", lit: 2, total: 11 },
  { subject_id: 2, name: "Espagnol", slug: "espagnol", lit: 0, total: 0 },
];

/** Les couches de TEXTURE d'une planète (relief + voile).
 *
 * On les reconnaît à `--tile` — le pas du keyframe — et non à `animate-` : la couronne solaire
 * est animée elle aussi, et un sélecteur trop large la comptait comme une texture. */
function planetLayers(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>("span[style]")].filter((s) =>
    s.style.getPropertyValue("--tile"),
  );
}

/** Dimensions de la tuile, en NOMBRES.
 *
 * Comparer la chaîne serait fragile : le navigateur normalise `88.0px` en `88px`, là où jsdom
 * la conserve telle quelle — un test qui mesurerait une chose en test et une autre en vrai
 * (même piège que `grid-column` → `grid-area`, cf. TROUBLESHOOTING.md). */
function tileOf(layer: HTMLElement): number[] {
  return layer.style.backgroundSize.split(" ").map(parseFloat);
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

  it("garde la tuile au DOUBLE du globe — sinon rien ne semble tourner", () => {
    // Invariant fragile et déjà cassé DEUX fois : avec une tuile égale à la sphère, aucun
    // relief n'entre ni ne sort du champ et le motif paraît figé ; avec une tuile de 160px sur
    // un globe de 44px (le bandeau), une seule tache remplit la sphère et sa dérive se lit
    // comme une variation de luminosité.
    const { container } = render(<SubjectConstellations subjects={subjects} onOpen={() => {}} />);
    for (const layer of planetLayers(container)) {
      expect(tileOf(layer)).toEqual([160, 80]);
    }
  });

  it("met la tuile À L'ÉCHELLE du bandeau, et `--tile` suit — sinon la boucle saute", () => {
    // `@keyframes zetis-planet-spin` se déplace de `--tile` exactement : si la variable et la
    // largeur de tuile divergent, le motif saute à chaque tour au lieu de boucler.
    const { container } = render(
      <SubjectConstellations subjects={subjects} onOpen={() => {}} variant="band" />,
    );
    for (const layer of planetLayers(container)) {
      expect(tileOf(layer)).toEqual([88, 44]);
      // `--tile` DOIT valoir la largeur de la tuile — c'est le trajet du keyframe.
      expect(parseFloat(layer.style.getPropertyValue("--tile"))).toBe(88);
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
    // Le GLOBE, et non le premier span venu : la couronne solaire le précède désormais dans
    // le DOM (elle est posée derrière lui).
    const sphere = (b: Element) => b.querySelector('span[class*="overflow-hidden"]')!.className;
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
