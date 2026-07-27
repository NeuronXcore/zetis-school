import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { type ReviewCard } from "@zetis/types";
import { RevisionSessionPage } from "./RevisionSessionPage";

vi.mock("../lib/reviews", () => ({
  startReviewSession: vi.fn(),
  submitReviewAttempt: vi.fn(),
}));
import { startReviewSession, submitReviewAttempt } from "../lib/reviews";

const CARD: ReviewCard = {
  card_id: 1,
  subject_slug: "maths",
  front_markdown: "Combien font 2+2 ?",
  back_markdown: "**4**",
};

function renderSession(state: unknown) {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/revision/session", state }]}>
      <Routes>
        <Route path="/revision" element={<div>ÉCRAN DECKS</div>} />
        <Route path="/revision/session" element={<RevisionSessionPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(startReviewSession).mockReset().mockResolvedValue([CARD]);
  vi.mocked(submitReviewAttempt)
    .mockReset()
    .mockResolvedValue({ next_due_at: null, xp_awarded: 5, is_consolidation: false });
});

describe("RevisionSessionPage", () => {
  it("accès sans deck (refresh direct) → redirige vers l'écran des decks", () => {
    renderSession(null);
    expect(screen.getByText("ÉCRAN DECKS")).toBeInTheDocument();
    expect(startReviewSession).not.toHaveBeenCalled();
  });

  it("les notes sont absentes avant le flip, présentes après « Révéler la réponse »", async () => {
    renderSession({ deck: "mix_day", label: "Mélange du jour", subjectNames: {} });

    // Recto affiché, pas encore de notes.
    expect(await screen.findByRole("button", { name: "Révéler la réponse" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Bien/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /À revoir/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Révéler la réponse" }));

    // Après le flip + délai anti-réflexe, les 4 notes apparaissent (aucune rouge).
    expect(await screen.findByRole("button", { name: /Bien/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /À revoir/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Difficile/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Facile/ })).toBeInTheDocument();
  });
});
