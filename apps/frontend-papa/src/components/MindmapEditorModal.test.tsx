import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { type MindmapDetail } from "@zetis/types";
import { MindmapEditorModal } from "./MindmapEditorModal";
import { updateMindmap } from "../lib/mindmaps";

// L'éditeur appelle updateMindmap (PUT /api/mindmaps/{id}) — mocké : le test vérifie l'UI structurée
// (arbre, pas de JSON brut) et le payload envoyé, sans réseau ni elk.
vi.mock("../lib/mindmaps", () => ({ updateMindmap: vi.fn() }));

const BASE: MindmapDetail = {
  id: 9,
  lesson_id: 4,
  title: "Nutrition des végétaux",
  chapter: "SVT",
  subject_slug: "svt",
  validation_status: "validated",
  mindmap_json: {
    center: "Nutrition végétale",
    nodes: [
      { id: "eau", label: "Eau", parent: null },
      { id: "racines", label: "Racines", parent: "eau" },
      { id: "lumiere", label: "Lumière", parent: null },
    ],
    required_nodes: ["eau", "lumiere"],
    optional_nodes: ["racines"],
  },
};

beforeEach(() => vi.clearAllMocks());

// Un `<select>` d'enfant affiche le label de son parent comme valeur : on cible donc les libellés
// par le rôle `textbox` (les selects sont des `combobox`), pas par getByDisplayValue.
function labelInput(value: string): HTMLInputElement {
  const found = screen
    .getAllByRole("textbox")
    .find((el) => (el as HTMLInputElement).value === value);
  if (!found) throw new Error(`aucun champ libellé de valeur « ${value} »`);
  return found as HTMLInputElement;
}

describe("MindmapEditorModal", () => {
  it("préremplit l'arbre depuis mindmap_json (structuré, pas de JSON brut)", () => {
    render(<MindmapEditorModal mindmap={BASE} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByDisplayValue("Nutrition végétale")).toBeInTheDocument(); // idée centrale
    expect(labelInput("Eau")).toBeInTheDocument();
    expect(labelInput("Racines")).toBeInTheDocument();
    expect(labelInput("Lumière")).toBeInTheDocument();
    // Aucune saisie de JSON brut (l'ancienne modale avait un textarea, plus maintenant).
    expect(screen.queryAllByRole("textbox").every((el) => el.tagName === "INPUT")).toBe(true);
  });

  it("enregistre l'arbre édité (renommage) + porte required/optional", async () => {
    vi.mocked(updateMindmap).mockResolvedValue(BASE);
    const onSaved = vi.fn();
    render(<MindmapEditorModal mindmap={BASE} onClose={() => {}} onSaved={onSaved} />);

    fireEvent.change(labelInput("Eau"), { target: { value: "Eau du sol" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(updateMindmap).toHaveBeenCalledTimes(1));
    const [id, payload] = vi.mocked(updateMindmap).mock.calls[0];
    expect(id).toBe(9);
    expect(payload.center).toBe("Nutrition végétale");
    expect(payload.nodes).toContainEqual({ id: "eau", label: "Eau du sol", parent: null });
    expect(payload.nodes).toHaveLength(3);
    expect(payload.required_nodes).toEqual(["eau", "lumiere"]);
    expect(payload.optional_nodes).toEqual(["racines"]);
    expect(onSaved).toHaveBeenCalled();
  });

  it("bloque l'enregistrement si un nœud a un libellé vide (garde cliente)", () => {
    render(<MindmapEditorModal mindmap={BASE} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(labelInput("Lumière"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(updateMindmap).not.toHaveBeenCalled();
    expect(screen.getByText(/chaque nœud doit avoir un libellé/i)).toBeInTheDocument();
  });

  it("« Déplacer sous » exclut le nœud lui-même et ses descendants (pas de cycle possible)", () => {
    render(<MindmapEditorModal mindmap={BASE} onClose={() => {}} onSaved={() => {}} />);
    // Rangée « Eau » = 1er combobox (ordre de rendu : eau, racines, lumiere).
    const eauSelect = screen.getAllByRole("combobox")[0];
    const options = within(eauSelect)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toContain("◎ Centre (branche principale)");
    expect(options).toContain("Lumière");
    expect(options).not.toContain("Eau"); // soi-même exclu
    expect(options).not.toContain("Racines"); // descendant exclu
  });
});
