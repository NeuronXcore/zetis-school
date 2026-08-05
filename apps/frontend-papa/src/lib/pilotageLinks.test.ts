import { describe, expect, it } from "vitest";
import { pilotageLink, reviewLink } from "./pilotageLinks";

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

const ITEM = {
  kind: "fiche" as const,
  id: 7,
  title: "Additionner des relatifs",
  subject_id: 3,
  subject: "Mathématiques",
  subject_slug: "mathematiques",
  chapter_id: 9,
  chapter: "Nombres relatifs",
  lesson_id: 42,
  lesson: "Additionner des relatifs",
  created_at: null,
};

describe("reviewLink — où va Papa pour LIRE avant de trancher", () => {
  it("les deux dérivés réutilisent la convention ?subject=&focus=", () => {
    expect(reviewLink(ITEM)).toBe("/fiches?subject=3&focus=7");
    expect(reviewLink({ ...ITEM, kind: "mindmap" })).toBe("/mindmaps?subject=3&focus=7");
  });

  it("une leçon ouvre le référentiel sur elle, chapitre déplié", () => {
    expect(reviewLink({ ...ITEM, kind: "lesson", id: 42 })).toBe(
      "/programme?subject=3&chapter=9&lesson=42",
    );
  });

  it("un chapitre s'arrête au chapitre : il n'a pas de leçon parente", () => {
    // Le faire passer par la branche générique l'enverrait sur /quiz — d'où le branchement
    // explicite plutôt qu'une cinquième entrée dans CoverageCellKey.
    expect(
      reviewLink({ ...ITEM, kind: "chapter", id: 9, lesson_id: null, lesson: null }),
    ).toBe("/programme?subject=3&chapter=9");
  });

  it("une capsule va sur SA page, sans passer par une leçon", () => {
    expect(
      reviewLink({ ...ITEM, kind: "capsule", id: 12, lesson_id: null, chapter_id: null }),
    ).toBe("/capsules?subject=3&focus=12");
  });

  it("sans matière, aucun lien — mieux vaut pas de sortie qu'une sortie au hasard", () => {
    expect(reviewLink({ ...ITEM, subject_id: null })).toBeNull();
  });

  it("un dérivé sans rattachement complet n'ouvre rien", () => {
    expect(reviewLink({ ...ITEM, chapter_id: null })).toBeNull();
    expect(reviewLink({ ...ITEM, lesson_id: null })).toBeNull();
  });
});
