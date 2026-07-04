import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { type SkillsBackfillPreview } from "@zetis/types";

// Client API mocké : le hook est testé sans réseau.
vi.mock("../lib/curriculum", () => ({
  generateSkillsBackfill: vi.fn(),
  confirmSkillsBackfill: vi.fn(),
}));

import { confirmSkillsBackfill, generateSkillsBackfill } from "../lib/curriculum";
import { useSkillsBackfill } from "./useSkillsBackfill";

const PREVIEW: SkillsBackfillPreview = {
  subject_id: 1,
  subject_name: "Mathématiques",
  level: "5e",
  cycle: "cycle 4",
  program_version: "2020",
  groups: [
    { scaffold_chapter: "Nombres relatifs", notions: ["Relatifs", "Comparaison"] },
    { scaffold_chapter: "Fractions", notions: ["Addition de fractions"] },
  ],
  failed_scaffolds: [],
};

function setup() {
  return renderHook(() => useSkillsBackfill({ subjectId: 1, activeLevel: "4e" }));
}

describe("useSkillsBackfill — state machine", () => {
  it("démarre sur 'level' avec le niveau antérieur pré-sélectionné (5e pour une 4e)", () => {
    const { result } = setup();
    expect(result.current.status).toBe("level");
    expect(result.current.level).toBe("5e");
    expect(result.current.hasUnconfirmedProposal).toBe(false);
  });

  it("generate : level → generating → preview, groupes clonés depuis la réponse", async () => {
    vi.mocked(generateSkillsBackfill).mockResolvedValue(PREVIEW);
    const { result } = setup();
    await act(async () => {
      await result.current.generate();
    });
    expect(vi.mocked(generateSkillsBackfill)).toHaveBeenCalledWith(1, "5e");
    expect(result.current.status).toBe("preview");
    expect(result.current.total).toBe(3);
    expect(result.current.hasUnconfirmedProposal).toBe(true);
    // Clone défensif : muter les groupes ne touche pas la réponse d'origine.
    expect(result.current.groups[0].notions).not.toBe(PREVIEW.groups[0].notions);
  });

  it("confirm : aplatit l'édition (chips vides écartées) et passe à 'done'", async () => {
    vi.mocked(generateSkillsBackfill).mockResolvedValue(PREVIEW);
    vi.mocked(confirmSkillsBackfill).mockResolvedValue({ created: 2, existing: 1 });
    const { result } = setup();
    await act(async () => {
      await result.current.generate();
    });
    // Retirer « Comparaison », ajouter une notion, en laisser une vide.
    act(() => result.current.remove(0, 1));
    act(() => result.current.startAdd(1));
    act(() => result.current.setDraft("Fractions égales"));
    act(() => result.current.commitEdit(1, 1));
    act(() => result.current.startAdd(0)); // chip vide laissée telle quelle
    expect(result.current.total).toBe(3); // vide non comptée

    await act(async () => {
      await result.current.confirm();
    });
    expect(vi.mocked(confirmSkillsBackfill)).toHaveBeenCalledWith(1, "5e", [
      { scaffold_chapter: "Nombres relatifs", name: "Relatifs" },
      { scaffold_chapter: "Fractions", name: "Addition de fractions" },
      { scaffold_chapter: "Fractions", name: "Fractions égales" },
    ]);
    expect(result.current.status).toBe("done");
    expect(result.current.result).toEqual({ created: 2, existing: 1 });
  });

  it("compteur exact après retrait / ajout / renommage", async () => {
    vi.mocked(generateSkillsBackfill).mockResolvedValue(PREVIEW);
    const { result } = setup();
    await act(async () => {
      await result.current.generate();
    });
    expect(result.current.total).toBe(3);
    act(() => result.current.remove(0, 0));
    expect(result.current.total).toBe(2);
    act(() => result.current.startAdd(0));
    act(() => result.current.setDraft("Droite graduée"));
    act(() => result.current.commitEdit(0, result.current.groups[0].notions.length - 1));
    expect(result.current.total).toBe(3);
  });

  it("expose les doublons inter-groupes (signalement, pas suppression)", async () => {
    vi.mocked(generateSkillsBackfill).mockResolvedValue({
      ...PREVIEW,
      groups: [
        { scaffold_chapter: "A", notions: ["Ratio"] },
        { scaffold_chapter: "B", notions: ["ratio"] },
      ],
    });
    const { result } = setup();
    await act(async () => {
      await result.current.generate();
    });
    expect(result.current.duplicates.get("0:0")).toEqual(["B"]);
    expect(result.current.duplicates.get("1:0")).toEqual(["A"]);
    expect(result.current.total).toBe(2); // non supprimées
  });

  it("erreur de confirmation (502) : retour à 'preview', édition conservée, retry rejoue confirm", async () => {
    vi.mocked(generateSkillsBackfill).mockResolvedValue(PREVIEW);
    vi.mocked(confirmSkillsBackfill)
      .mockRejectedValueOnce(new Error("502 génération indisponible"))
      .mockResolvedValueOnce({ created: 3, existing: 0 });
    const { result } = setup();
    await act(async () => {
      await result.current.generate();
    });
    act(() => result.current.remove(0, 1)); // une édition à préserver
    await act(async () => {
      await result.current.confirm();
    });
    expect(result.current.status).toBe("preview");
    expect(result.current.error).toBe("502 génération indisponible");
    expect(result.current.total).toBe(2); // l'édition n'a pas été perdue

    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.result).toEqual({ created: 3, existing: 0 });
  });

  it("erreur de génération depuis 'level' : reste sur 'level', aucune proposition", async () => {
    vi.mocked(generateSkillsBackfill).mockRejectedValue(
      new Error("503 ANTHROPIC_API_KEY absente"),
    );
    const { result } = setup();
    await act(async () => {
      await result.current.generate();
    });
    expect(result.current.status).toBe("level");
    expect(result.current.preview).toBeNull();
    expect(result.current.hasUnconfirmedProposal).toBe(false);
    expect(result.current.error).toBe("503 ANTHROPIC_API_KEY absente");
  });
});
