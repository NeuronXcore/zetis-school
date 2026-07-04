import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type SkillsBackfillPreview } from "@zetis/types";
import { SkillsBackfillModal } from "./SkillsBackfillModal";

// Client API mocké : la modale est testée en isolation (aucun appel réseau).
vi.mock("../../lib/curriculum", () => ({
  generateSkillsBackfill: vi.fn(),
  confirmSkillsBackfill: vi.fn(),
}));

import { confirmSkillsBackfill, generateSkillsBackfill } from "../../lib/curriculum";

const PREVIEW: SkillsBackfillPreview = {
  subject_id: 1,
  subject_name: "Mathématiques",
  level: "5e",
  cycle: "cycle 4",
  program_version: "2020",
  groups: [
    {
      scaffold_chapter: "Nombres relatifs : introduction",
      notions: ["Nombres relatifs", "Comparaison de relatifs"],
    },
    { scaffold_chapter: "Fractions", notions: ["Fraction d'une quantité"] },
  ],
  failed_scaffolds: ["Priorités et distributivité"],
};

function open() {
  render(
    <SkillsBackfillModal
      subjectId={1}
      subjectName="Mathématiques"
      activeLevel="4e"
      onClose={vi.fn()}
    />,
  );
}

describe("SkillsBackfillModal", () => {
  it("niveau antérieur pré-sélectionné (5e pour une 4e) et génération câblée", async () => {
    vi.mocked(generateSkillsBackfill).mockResolvedValue(PREVIEW);
    open();
    expect(screen.getByRole("button", { name: "5e" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "⚡ Générer" }));
    expect(vi.mocked(generateSkillsBackfill)).toHaveBeenCalledWith(1, "5e");
    await screen.findByText("Nombres relatifs : introduction");
  });

  it("prévisualisation : échafaudages étiquetés, notions en chips, échec partiel signalé", async () => {
    vi.mocked(generateSkillsBackfill).mockResolvedValue(PREVIEW);
    open();
    fireEvent.click(screen.getByRole("button", { name: "⚡ Générer" }));

    expect(await screen.findByText("Nombres relatifs : introduction")).toBeInTheDocument();
    expect(screen.getByText("Fractions")).toBeInTheDocument();
    // Les échafaudages sont explicitement marqués « non créés ».
    expect(screen.getAllByText("échafaudage · non créé")).toHaveLength(2);
    // Notions en chips.
    expect(screen.getByText("Nombres relatifs")).toBeInTheDocument();
    expect(screen.getByText("Fraction d'une quantité")).toBeInTheDocument();
    // Échec partiel non bloquant.
    expect(screen.getByText(/1 section n'a pas abouti/)).toBeInTheDocument();
  });

  it("édition + confirmation : retrait d'une notion, ajout d'une autre, flatten envoyé", async () => {
    vi.mocked(generateSkillsBackfill).mockResolvedValue(PREVIEW);
    vi.mocked(confirmSkillsBackfill).mockResolvedValue({ created: 2, existing: 1 });
    open();
    fireEvent.click(screen.getByRole("button", { name: "⚡ Générer" }));
    await screen.findByText("Nombres relatifs : introduction");

    // Retrait d'une notion hors-sujet.
    fireEvent.click(
      screen.getByRole("button", { name: "Retirer la notion Comparaison de relatifs" }),
    );
    expect(screen.queryByText("Comparaison de relatifs")).not.toBeInTheDocument();

    // Ajout d'une notion dans le groupe Fractions.
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une notion à Fractions" }));
    const input = screen.getByLabelText("Renommer la notion");
    fireEvent.change(input, { target: { value: "Fractions égales" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("Fractions égales")).toBeInTheDocument();

    // Confirmation : la charge utile aplatie reflète l'édition.
    fireEvent.click(screen.getByRole("button", { name: "✓ Confirmer" }));
    await waitFor(() =>
      expect(vi.mocked(confirmSkillsBackfill)).toHaveBeenCalledWith(1, "5e", [
        { scaffold_chapter: "Nombres relatifs : introduction", name: "Nombres relatifs" },
        { scaffold_chapter: "Fractions", name: "Fraction d'une quantité" },
        { scaffold_chapter: "Fractions", name: "Fractions égales" },
      ]),
    );
    // Écran résultat : créées vs déjà présentes.
    expect(await screen.findByText("Notions ajoutées au référentiel")).toBeInTheDocument();
    expect(screen.getByText("créées")).toBeInTheDocument();
    expect(screen.getByText("déjà présente")).toBeInTheDocument();
  });

  it("erreur cloud : detail backend verbatim, reste sur l'étape niveau", async () => {
    vi.mocked(generateSkillsBackfill).mockRejectedValue(
      new Error(
        "Génération de référentiel indisponible : ANTHROPIC_API_KEY absente. " +
          "CURRICULUM_LLM_PROVIDER=ollama pour le repli local.",
      ),
    );
    open();
    fireEvent.click(screen.getByRole("button", { name: "⚡ Générer" }));

    expect(
      await screen.findByText(/CURRICULUM_LLM_PROVIDER=ollama/),
    ).toBeInTheDocument();
    // Pas de prévisualisation : l'étape niveau (bouton Générer) est toujours là.
    expect(screen.getByRole("button", { name: "⚡ Générer" })).toBeInTheDocument();
  });
});
