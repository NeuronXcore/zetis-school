import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type FicheDetail } from "@zetis/types";
import { FicheEditorModal } from "./FicheEditorModal";
import { updateFiche } from "../lib/fiches";

// L'éditeur appelle updateFiche (PUT /api/fiches/{id}) — mocké : le test vérifie l'UI + la
// normalisation du spec envoyé, sans réseau.
vi.mock("../lib/fiches", () => ({ updateFiche: vi.fn() }));

const BASE: FicheDetail = {
  id: 7,
  lesson_id: 3,
  title: "Multiplication",
  chapter: "Relatifs",
  subject_slug: "mathematiques",
  validation_status: "validated",
  seen: false,
  // Requis par `FicheDetail` depuis l'ADR-0054 §3 (datation absolue de l'export A5). Le fixture
  // avait pris du retard sur le contrat, et rien ne l'a vu : `vitest` transpile sans vérifier les
  // types, et la CI ne lance aucun `tsc`. Seul le build de PROD tombait.
  updated_at: null,
  spec: {
    title: "Multiplication",
    subject: "Mathématiques",
    level: "4e",
    chapter: "Relatifs",
    essentiel: "Pour multiplier des relatifs on calcule la valeur puis le signe.",
    definitions: [{ terme: "Valeur absolue", definition: "Le nombre sans son signe." }],
    points_cles: ["Multiplier les chiffres", "Signes pareils = positif"],
    erreurs_a_eviter: ["Oublier le signe final"],
    mini_exemple: "(-2) x (+3) = -6",
  },
};

function withSpec(over: Partial<FicheDetail["spec"]>): FicheDetail {
  return { ...BASE, spec: { ...BASE.spec, ...over } };
}

beforeEach(() => vi.clearAllMocks());

describe("FicheEditorModal", () => {
  it("préremplit les champs depuis le spec (pas de JSON)", () => {
    render(<FicheEditorModal fiche={BASE} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByDisplayValue("Multiplication")).toBeInTheDocument(); // titre
    expect(
      screen.getByDisplayValue("Pour multiplier des relatifs on calcule la valeur puis le signe."),
    ).toBeInTheDocument(); // essentiel
    expect(screen.getByDisplayValue("Valeur absolue")).toBeInTheDocument(); // terme d'une définition
    expect(screen.getByDisplayValue("Multiplier les chiffres")).toBeInTheDocument(); // un point clé
  });

  it("désactive « ⊕ ajouter » quand une liste est au plafond (4 déf. / 5 points / 3 pièges)", () => {
    render(
      <FicheEditorModal
        fiche={withSpec({
          definitions: [1, 2, 3, 4].map((n) => ({ terme: `t${n}`, definition: `d${n}` })),
          points_cles: [1, 2, 3, 4, 5].map((n) => `p${n}`),
          erreurs_a_eviter: [1, 2, 3].map((n) => `e${n}`),
        })}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /ajouter une définition/i })).toBeDisabled();
    for (const btn of screen.getAllByRole("button", { name: "⊕ ajouter" })) {
      expect(btn).toBeDisabled();
    }
  });

  it("enregistre : porte subject/level inchangés et retire les lignes vides", async () => {
    vi.mocked(updateFiche).mockResolvedValue(BASE);
    const onSaved = vi.fn();
    render(<FicheEditorModal fiche={BASE} onClose={() => {}} onSaved={onSaved} />);

    // Ajoute un point clé vide → doit être retiré à la normalisation.
    fireEvent.click(screen.getAllByRole("button", { name: "⊕ ajouter" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(updateFiche).toHaveBeenCalledTimes(1));
    const [id, spec] = vi.mocked(updateFiche).mock.calls[0];
    expect(id).toBe(7);
    expect(spec.subject).toBe("Mathématiques"); // porté inchangé
    expect(spec.level).toBe("4e"); // porté inchangé
    expect(spec.points_cles).toEqual(["Multiplier les chiffres", "Signes pareils = positif"]); // vide retiré
    expect(onSaved).toHaveBeenCalledWith(BASE);
  });

  it("bloque l'enregistrement si le titre est vide (garde cliente)", () => {
    render(<FicheEditorModal fiche={BASE} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByDisplayValue("Multiplication"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(updateFiche).not.toHaveBeenCalled();
    expect(screen.getByText(/titre est obligatoire/i)).toBeInTheDocument();
  });
});
