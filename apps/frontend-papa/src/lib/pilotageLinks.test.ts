import { describe, expect, it } from "vitest";
import { pilotageLink } from "./pilotageLinks";

const TARGET = { subjectId: 3, chapterId: 9, lessonId: 42, objectId: 7 };

describe("pilotageLink — où mène chaque cellule", () => {
  it("le cours ouvre le RÉFÉRENTIEL sur sa leçon, pas une page de dérivé", () => {
    // Le cours n'est pas un dérivé : il vit dans Programme, avec son chapitre déplié.
    expect(pilotageLink("cours", TARGET)).toBe("/programme?subject=3&chapter=9&lesson=42");
  });

  it("les trois dérivés ouvrent leur page de pilotage, ciblés sur l'objet", () => {
    expect(pilotageLink("fiche", TARGET)).toBe("/fiches?subject=3&focus=7");
    expect(pilotageLink("mindmap", TARGET)).toBe("/mindmaps?subject=3&focus=7");
    expect(pilotageLink("quiz", TARGET)).toBe("/quiz?subject=3&focus=7");
  });

  it("sans objet, aucun lien — une cellule vide n'a rien à ouvrir", () => {
    const empty = { ...TARGET, objectId: null };
    expect(pilotageLink("fiche", empty)).toBeNull();
    expect(pilotageLink("mindmap", empty)).toBeNull();
    expect(pilotageLink("quiz", empty)).toBeNull();
  });

  it("le cours reste atteignable même sans objet : la leçon existe toujours", () => {
    // `object_id` est nul quand la cellule est `absent`/`blocked` — mais la LEÇON, elle,
    // existe et se valide dans Programme. C'est justement là qu'on veut aller.
    expect(pilotageLink("cours", { ...TARGET, objectId: null })).toBe(
      "/programme?subject=3&chapter=9&lesson=42",
    );
  });
});
