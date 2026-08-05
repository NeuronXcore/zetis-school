import { beforeEach, describe, expect, it, vi } from "vitest";

// Table d'aiguillage : chaque famille doit appeler LE client de son type. Une erreur ici est
// silencieuse à l'écran — la ligne partirait de la file (retrait optimiste) et le mauvais objet
// serait validé.

vi.mock("./fiches", () => ({
  validateFiche: vi.fn().mockResolvedValue({}),
  rejectFiche: vi.fn().mockResolvedValue({}),
}));
vi.mock("./mindmaps", () => ({
  validateMindmap: vi.fn().mockResolvedValue({}),
  rejectMindmap: vi.fn().mockResolvedValue({}),
}));
vi.mock("./capsules", () => ({ setCapsuleValidation: vi.fn().mockResolvedValue({}) }));
vi.mock("./curriculum", () => ({
  validateLesson: vi.fn().mockResolvedValue({}),
  rejectLesson: vi.fn().mockResolvedValue({}),
  patchChapter: vi.fn().mockResolvedValue({}),
}));

import { rejectFiche, validateFiche } from "./fiches";
import { rejectMindmap, validateMindmap } from "./mindmaps";
import { setCapsuleValidation } from "./capsules";
import { patchChapter, rejectLesson, validateLesson } from "./curriculum";
import { reviewAction } from "./reviewActions";

describe("reviewAction — chaque famille appelle son propre client", () => {
  beforeEach(() => vi.clearAllMocks());

  it("les leçons passent par le référentiel", async () => {
    await reviewAction("lesson", "validate", 42);
    expect(validateLesson).toHaveBeenCalledWith(42);
    await reviewAction("lesson", "reject", 42);
    expect(rejectLesson).toHaveBeenCalledWith(42);
  });

  it("les fiches et les mindmaps ont leurs endpoints dédiés", async () => {
    await reviewAction("fiche", "validate", 7);
    expect(validateFiche).toHaveBeenCalledWith(7);
    await reviewAction("fiche", "reject", 7);
    expect(rejectFiche).toHaveBeenCalledWith(7);
    await reviewAction("mindmap", "validate", 8);
    expect(validateMindmap).toHaveBeenCalledWith(8);
    await reviewAction("mindmap", "reject", 8);
    expect(rejectMindmap).toHaveBeenCalledWith(8);
  });

  it("les capsules gardent leur route à action", async () => {
    await reviewAction("capsule", "validate", 12);
    expect(setCapsuleValidation).toHaveBeenCalledWith(12, "validate");
    await reviewAction("capsule", "reject", 12);
    expect(setCapsuleValidation).toHaveBeenCalledWith(12, "reject");
  });

  it("les chapitres gardent leur PATCH porteur d'une validation_action", async () => {
    // Le référentiel se co-construit par nœud (ADR-0009 §3) : on garde SA convention plutôt que
    // d'inventer une sixième route.
    await reviewAction("chapter", "validate", 9);
    expect(patchChapter).toHaveBeenCalledWith(9, { validation_action: "validate" });
    await reviewAction("chapter", "reject", 9);
    expect(patchChapter).toHaveBeenCalledWith(9, { validation_action: "reject" });
  });

  it("propage l'échec — la page doit pouvoir rétablir la ligne qu'elle a retirée", async () => {
    vi.mocked(validateFiche).mockRejectedValueOnce(new Error("503"));
    await expect(reviewAction("fiche", "validate", 7)).rejects.toThrow("503");
  });
});
