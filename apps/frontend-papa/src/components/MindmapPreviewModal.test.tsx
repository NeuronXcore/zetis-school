import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type MindmapPilotageCard } from "@zetis/types";
import { MindmapPreviewModal } from "./MindmapPreviewModal";
import { evaluateMindmapPreview, updateMindmap } from "../lib/mindmaps";

// La brique de canvas est MOCKÉE : React Flow + elk ne tournent pas en jsdom (layout asynchrone,
// mesures DOM) et ce n'est pas ce que ce test couvre. Ce qui est testé ici, c'est le CHROME de
// l'aperçu Papa : bandeau « rien n'est enregistré », onglets, avertissement conditionnel, garde
// d'intégrité avant PUT — et le fait que la brique reçoive bien un `evaluator` d'aperçu.
const workspaceProps: Record<string, unknown>[] = [];
vi.mock("@zetis/ui/mindmap", () => ({
  MindmapWorkspace: (props: Record<string, unknown>) => {
    workspaceProps.push(props);
    return <div data-testid="mm-canvas" data-mode={String(props.mode)} />;
  },
}));
vi.mock("../lib/mindmaps", () => ({
  evaluateMindmapPreview: vi.fn(),
  updateMindmap: vi.fn(),
}));

const PENDING: MindmapPilotageCard = {
  id: 9,
  lesson_id: 4,
  title: "Nutrition végétale",
  chapter: "Ch. 3 — Nutrition des plantes",
  subject_slug: "svt",
  validation_status: "pending",
  attempt_count: 0,
  avg_score: null,
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

const noop = () => {};

function renderModal(card: MindmapPilotageCard = PENDING) {
  return render(
    <MindmapPreviewModal
      card={card}
      subjectName="SVT"
      lessonTitle="La nutrition végétale"
      onClose={noop}
      onSaved={noop}
      onValidate={noop}
      onRegenerate={noop}
      onDelete={noop}
    />,
  );
}

function labelInput(value: string): HTMLInputElement {
  const found = screen
    .getAllByRole("textbox")
    .find((el) => (el as HTMLInputElement).value === value);
  if (!found) throw new Error(`aucun champ libellé de valeur « ${value} »`);
  return found as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  workspaceProps.length = 0;
});

describe("MindmapPreviewModal", () => {
  it("rend une carte `pending` et annonce que rien n'est enregistré pour Massimo", async () => {
    renderModal();
    expect(screen.getByText("La nutrition végétale")).toBeInTheDocument();
    expect(screen.getByText(/SVT — Ch\. 3/)).toBeInTheDocument();
    expect(screen.getByText("à valider")).toBeInTheDocument();
    expect(screen.getByText(/rien n'est enregistré pour Massimo/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("mm-canvas")).toBeInTheDocument());
    // La carte descend EN PROP (zéro fetch dans la brique).
    expect(workspaceProps[0].mm).toEqual(PENDING.mindmap_json);
  });

  it("les 3 onglets d'aperçu pilotent le mode de la brique partagée", async () => {
    renderModal();
    await waitFor(() => expect(screen.getByTestId("mm-canvas")).toBeInTheDocument());
    expect(screen.getByTestId("mm-canvas")).toHaveAttribute("data-mode", "view");

    fireEvent.click(screen.getByRole("button", { name: "Mémorise" }));
    await waitFor(() =>
      expect(screen.getByTestId("mm-canvas")).toHaveAttribute("data-mode", "train"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Reconstruis" }));
    await waitFor(() =>
      expect(screen.getByTestId("mm-canvas")).toHaveAttribute("data-mode", "build"),
    );
  });

  it("l'`evaluator` injecté appelle evaluate-preview et ne rapporte aucun XP", async () => {
    vi.mocked(evaluateMindmapPreview).mockResolvedValue({
      score: 75,
      correct_count: 3,
      expected_count: 4,
      details: [],
    });
    renderModal();
    await waitFor(() => expect(workspaceProps.length).toBeGreaterThan(0));

    const evaluate = workspaceProps[0].evaluator as (
      p: { node_id: string; parent_id: string | null }[],
      f: number,
    ) => Promise<{ score: number; xp_awarded: number; attempt_id: number }>;
    const result = await evaluate([{ node_id: "eau", parent_id: null }], 0);

    expect(evaluateMindmapPreview).toHaveBeenCalledWith(9, [{ node_id: "eau", parent_id: null }]);
    expect(result.score).toBe(75);
    expect(result.xp_awarded).toBe(0); // aucun XP en aperçu — l'endpoint ne persiste rien
    expect(result.attempt_id).toBe(0);
  });

  it("l'avertissement de retrait n'apparaît que sur une carte `validated`", () => {
    const { unmount } = renderModal(PENDING);
    fireEvent.click(screen.getByRole("button", { name: "Éditer" }));
    expect(screen.queryByText(/retirera de sa liste/i)).not.toBeInTheDocument();
    unmount();

    renderModal({ ...PENDING, validation_status: "validated" });
    fireEvent.click(screen.getByRole("button", { name: "Éditer" }));
    expect(screen.getByText(/visible par Massimo/i)).toBeInTheDocument();
    expect(screen.getByText(/retirera de sa liste jusqu'à validation/i)).toBeInTheDocument();
  });

  it("l'éditeur refuse d'enregistrer un arbre incohérent (libellé vide)", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Éditer" }));
    fireEvent.change(labelInput("Lumière"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(updateMindmap).not.toHaveBeenCalled();
    expect(screen.getByText(/chaque nœud doit avoir un libellé/i)).toBeInTheDocument();
  });

  it("enregistrer l'arbre corrigé envoie le PUT et referme via onSaved", async () => {
    vi.mocked(updateMindmap).mockResolvedValue({ ...PENDING });
    const onSaved = vi.fn();
    render(
      <MindmapPreviewModal
        card={PENDING}
        subjectName="SVT"
        lessonTitle="La nutrition végétale"
        onClose={noop}
        onSaved={onSaved}
        onValidate={noop}
        onRegenerate={noop}
        onDelete={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Éditer" }));
    fireEvent.change(labelInput("Eau"), { target: { value: "Eau du sol" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(updateMindmap).toHaveBeenCalledTimes(1));
    const [id, payload] = vi.mocked(updateMindmap).mock.calls[0];
    expect(id).toBe(9);
    expect(payload.nodes).toContainEqual({ id: "eau", label: "Eau du sol", parent: null });
    expect(onSaved).toHaveBeenCalled();
  });
});
