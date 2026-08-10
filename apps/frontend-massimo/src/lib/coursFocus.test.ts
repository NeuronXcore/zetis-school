// Quelle leçon la page Cours encadre (addendum ADR-0025 §15, §15.6).
//
// Le rattrapage par titre a été ajouté le 2026-08-10, après un constat à l'écran : une échéance
// dont le libellé était MOT POUR MOT le titre d'un cours du chapitre n'encadrait rien, faute de
// `lesson_id`. Ces tests bornent le rattrapage autant qu'ils le vérifient — c'est la borne qui
// le sépare de la résolution « texte libre → leçon » que le §13.3 a écartée.
import { describe, expect, it } from "vitest";
import { type StudentCours } from "@zetis/types";
import { resolveFocusLesson } from "./coursFocus";

const COURS = {
  subject_id: 1,
  subject_name: "Français",
  subject_slug: "francais",
  level: "4e",
  chapters: [
    {
      id: 2,
      name: "Grammaire",
      description: null,
      lessons: [
        { id: 10, title: "La phrase complexe : juxtaposition et coordination", summary: null, has_content: true },
        { id: 11, title: "La proposition subordonnée relative", summary: null, has_content: true },
      ],
    },
    {
      id: 3,
      name: "Orthographe",
      description: null,
      // ⚠️ Homonyme VOLONTAIRE dans un autre chapitre : c'est le piège que le bornage évite.
      lessons: [
        { id: 20, title: "La phrase complexe : juxtaposition et coordination", summary: null, has_content: true },
      ],
    },
  ],
} as unknown as StudentCours;

describe("resolveFocusLesson", () => {
  it("l'identifiant PRIME toujours", () => {
    expect(
      resolveFocusLesson(COURS, { lessonId: 11, chapterId: 2, title: "La proposition subordonnée relative" }),
    ).toBe(11);
    // Même si le titre désigne autre chose : `lesson_id` est certain, le titre est un repli.
    expect(resolveFocusLesson(COURS, { lessonId: 11, chapterId: 2, title: "n'importe quoi" })).toBe(11);
  });

  it("rattrape par titre EXACT dans le chapitre visé", () => {
    expect(
      resolveFocusLesson(COURS, {
        lessonId: null,
        chapterId: 2,
        title: "La phrase complexe : juxtaposition et coordination",
      }),
    ).toBe(10);
  });

  it("tolère les espaces de bord, rien de plus", () => {
    expect(
      resolveFocusLesson(COURS, {
        lessonId: null,
        chapterId: 2,
        title: "  La proposition subordonnée relative  ",
      }),
    ).toBe(11);
  });

  it("VERROU §15.6 — ne cherche JAMAIS hors du chapitre visé", () => {
    // Deux chapitres peuvent porter des leçons homonymes. Élargir la fenêtre à la matière
    // désignerait la mauvaise — et c'est le seul cas où ce rattrapage pourrait mentir.
    expect(
      resolveFocusLesson(COURS, {
        lessonId: null,
        chapterId: 3,
        title: "La proposition subordonnée relative", // elle est dans le chapitre 2
      }),
    ).toBeNull();
  });

  it("VERROU §15.6 — égalité STRICTE, jamais une ressemblance", () => {
    // Un titre voisin ne matche pas : le pire cas doit rester « pas de cadre », jamais un cadre
    // sur autre chose. C'est ce qui sépare ce rattrapage d'une résolution floue (§13.3).
    for (const proche of [
      "La phrase complexe",
      "la phrase complexe : juxtaposition et coordination",
      "La phrase complexe : juxtaposition et coordination.",
    ]) {
      expect(resolveFocusLesson(COURS, { lessonId: null, chapterId: 2, title: proche })).toBeNull();
    }
  });

  it("rend null quand il n'y a rien à désigner", () => {
    expect(resolveFocusLesson(COURS, { lessonId: null, chapterId: 2, title: null })).toBeNull();
    expect(resolveFocusLesson(COURS, { lessonId: null, chapterId: null, title: "x" })).toBeNull();
    expect(resolveFocusLesson(null, { lessonId: null, chapterId: 2, title: "x" })).toBeNull();
    // Chapitre inconnu (dévalidé depuis la saisie) : repli silencieux, pas d'erreur.
    expect(resolveFocusLesson(COURS, { lessonId: null, chapterId: 99, title: "x" })).toBeNull();
  });
});
