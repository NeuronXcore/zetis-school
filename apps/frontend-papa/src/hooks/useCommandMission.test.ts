// La porte « échéance » du Commander (ADR-0025 §11, couplage 1).
//
// Décidée le 2026-07-30, jamais alimentée : `CommandPreviewRequest` porte `gate: "deadline"` et
// `due_date` DEPUIS L'ORIGINE, mais rien ne les remplissait. Ce fichier verrouille le branchement
// — et surtout la non-régression de l'ouverture nue, depuis la page Missions.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("../lib/curriculum", () => ({
  fetchActiveSchoolYear: vi.fn(),
  fetchChapters: vi.fn(),
}));
import { fetchActiveSchoolYear, fetchChapters } from "../lib/curriculum";

vi.mock("../lib/missionsPilotage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/missionsPilotage")>()),
  commandPreview: vi.fn(),
  commandConfirm: vi.fn(),
}));
import { commandConfirm, commandPreview } from "../lib/missionsPilotage";

import { useCommandMission } from "./useCommandMission";

const PREVIEW = {
  scope_label: "Fractions",
  compose_note: "ZETIS composera 2 missions courtes.",
  notions: [
    { skill_id: 11, name: "Additionner", level: "4e", mastery: 0.2, fragility: 0.8, checked: true },
    { skill_id: 12, name: "Multiplier", level: "4e", mastery: 0.3, fragility: 0.7, checked: true },
    { skill_id: 13, name: "Simplifier", level: "4e", mastery: 0.9, fragility: 0.1, checked: false },
  ],
};

beforeEach(() => {
  // ⚠️ Sans ça, le test de non-régression voit les appels des tests précédents et passe (ou
  // tombe) pour la mauvaise raison. `clearAllMocks` vide les appels sans toucher aux
  // implémentations posées juste après.
  vi.clearAllMocks();
  vi.mocked(fetchActiveSchoolYear).mockResolvedValue({ id: 1, label: "2026", subjects: [] } as never);
  vi.mocked(fetchChapters).mockResolvedValue([
    { id: 6, name: "Fractions", validation_status: "validated" },
  ] as never);
  vi.mocked(commandPreview).mockResolvedValue(PREVIEW as never);
  vi.mocked(commandConfirm).mockResolvedValue([] as never);
});

describe("useCommandMission — porte échéance", () => {
  it("openFor arme la porte, la date et la priorité, et lance le preview du bon chapitre", async () => {
    const { result } = renderHook(() => useCommandMission(vi.fn()));

    act(() => result.current.openFor({ sysId: 42, chapterId: 6, dueDate: "2026-08-10" }));

    await waitFor(() => expect(result.current.preview).not.toBeNull());
    expect(result.current.open).toBe(true);
    expect(result.current.gate).toBe("deadline");
    expect(result.current.dueDate).toBe("2026-08-10");
    // Plancher, jamais plafond (ADR-0018 §4) — armé par la porte, retirable par Papa.
    expect(result.current.forcePriority).toBe(true);

    // ⚠️ LE piège du hook : `selectSubject` remet `chapterId` à null et `selectChapter` lit `gate`
    // dans sa fermeture. Si `openFor` les composait, on aurait ici `chapterId === null` et un
    // preview parti sous la porte précédente.
    expect(result.current.chapterId).toBe(6);
    expect(commandPreview).toHaveBeenCalledWith("deadline", 6);
    // Les notions pré-cochées viennent du SERVEUR, jamais d'un calcul local.
    expect([...result.current.checked].sort()).toEqual([11, 12]);
  });

  it("confirme avec la date de l'échéance et les notions du serveur", async () => {
    const { result } = renderHook(() => useCommandMission(vi.fn()));
    act(() => result.current.openFor({ sysId: 42, chapterId: 6, dueDate: "2026-08-10" }));
    await waitFor(() => expect(result.current.preview).not.toBeNull());

    await act(async () => await result.current.confirm());

    expect(commandConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        gate: "deadline",
        chapter_id: 6,
        due_date: "2026-08-10",
        force_priority: true,
      }),
    );
  });

  it("NON-RÉGRESSION — l'ouverture nue reste thématique et sans priorité", async () => {
    // La page Missions appelle `openModal()` sans argument. Si `openFor` avait modifié l'état
    // partagé par défaut, elle aurait silencieusement changé de porte.
    const { result } = renderHook(() => useCommandMission(vi.fn()));

    act(() => result.current.openModal());

    expect(result.current.gate).toBe("theme_ref");
    expect(result.current.forcePriority).toBe(false);
    expect(result.current.chapterId).toBeNull();
    expect(commandPreview).not.toHaveBeenCalled();
  });

  it("changer de matière invalide toujours le chapitre", async () => {
    // `selectSubject` DOIT continuer à remettre `chapterId` à null : le chapitre n'appartient
    // plus à la nouvelle matière. Extraire `loadChapters` ne devait pas casser ça.
    const { result } = renderHook(() => useCommandMission(vi.fn()));
    act(() => result.current.openFor({ sysId: 42, chapterId: 6, dueDate: "2026-08-10" }));
    await waitFor(() => expect(result.current.chapterId).toBe(6));

    act(() => result.current.selectSubject(43));

    expect(result.current.chapterId).toBeNull();
    expect(result.current.preview).toBeNull();
  });
});
