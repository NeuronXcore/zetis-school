import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NotionRequestsPanel } from "./NotionRequestsPanel";

vi.mock("../../lib/notionRequests", () => ({
  fetchNotionRequests: vi.fn(),
  resolveNotionRequest: vi.fn(),
}));

import { fetchNotionRequests, resolveNotionRequest } from "../../lib/notionRequests";

const REQUESTS = [
  { id: 1, text: "Théorème de Pythagore", status: "pending", subject_id: null, created_at: "" },
  { id: 2, text: "Photosynthèse", status: "pending", subject_id: null, created_at: "" },
];

beforeEach(() => {
  vi.mocked(fetchNotionRequests).mockReset().mockResolvedValue(REQUESTS);
  vi.mocked(resolveNotionRequest)
    .mockReset()
    .mockResolvedValue({ ...REQUESTS[0], status: "dismissed" });
});

describe("NotionRequestsPanel", () => {
  it("liste les demandes en attente de Massimo", async () => {
    render(<NotionRequestsPanel />);
    expect(await screen.findByText(/Théorème de Pythagore/)).toBeInTheDocument();
    expect(screen.getByText(/Demandes de Massimo \(2\)/)).toBeInTheDocument();
  });

  it("« Ignorer » appelle l'API et retire la demande", async () => {
    render(<NotionRequestsPanel />);
    await screen.findByText(/Théorème de Pythagore/);
    fireEvent.click(screen.getAllByRole("button", { name: "Ignorer" })[0]);
    await waitFor(() =>
      expect(vi.mocked(resolveNotionRequest)).toHaveBeenCalledWith(1, "dismissed"),
    );
    await waitFor(() =>
      expect(screen.queryByText(/Théorème de Pythagore/)).not.toBeInTheDocument(),
    );
  });

  it("ne rend rien quand il n'y a aucune demande", async () => {
    vi.mocked(fetchNotionRequests).mockResolvedValue([]);
    const { container } = render(<NotionRequestsPanel />);
    await waitFor(() => expect(fetchNotionRequests).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
