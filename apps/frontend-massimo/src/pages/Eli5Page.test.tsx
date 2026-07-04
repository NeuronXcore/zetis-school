import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type Eli5Explain, type Eli5Reverse } from "../lib/eli5";
import { Eli5Page } from "./Eli5Page";

vi.mock("../lib/eli5", () => ({
  fetchSkills: vi.fn(),
  fetchDueReviews: vi.fn(),
  fetchLessonSuggestions: vi.fn(),
  explainEli5: vi.fn(),
  reverseEli5: vi.fn(),
  transcribeEli5: vi.fn(),
  requestNotion: vi.fn(),
  Eli5SttUnavailable: class extends Error {},
}));

import {
  explainEli5,
  fetchDueReviews,
  fetchLessonSuggestions,
  fetchSkills,
  requestNotion,
  reverseEli5,
} from "../lib/eli5";

const EXPLAIN: Eli5Explain = {
  title: "Les fractions",
  simple_explanation: "Une fraction est une part d'un tout.",
  analogy: "Comme une pizza coupée en parts.",
  example: "1/2 = la moitié.",
  common_mistake: "",
  check_question: "Combien font deux quarts ?",
  next_action: "Réviser demain",
  sources_used: 0,
};

const REVERSE: Eli5Reverse = {
  score: 72,
  feedback: "Bien joué, ton explication est claire.",
  missing_points: ["le dénominateur"],
  next_action: "Refais un exercice sur les parts.",
};

beforeEach(() => {
  vi.mocked(fetchSkills)
    .mockReset()
    .mockResolvedValue([{ id: 1, name: "Les fractions", subject: "Maths" }]);
  vi.mocked(fetchDueReviews).mockReset().mockResolvedValue([]);
  vi.mocked(fetchLessonSuggestions).mockReset().mockResolvedValue([]);
  vi.mocked(explainEli5).mockReset().mockResolvedValue(EXPLAIN);
  vi.mocked(reverseEli5).mockReset().mockResolvedValue(REVERSE);
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/eli5"]}>
      <Eli5Page />
    </MemoryRouter>,
  );
}

describe("Eli5Page", () => {
  it("déroule la boucle et n'affiche jamais de vocabulaire négatif", async () => {
    renderPage();
    // Attend que fetchSkills soit résolu (la chip « Ta leçon » n'apparaît qu'ensuite),
    // sinon la résolution du champ n'a aucun skill à matcher.
    await screen.findByText(/Ta leçon/);

    fireEvent.change(screen.getByLabelText(/Quelle notion/i), {
      target: { value: "Les fractions" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Expliquer" }));

    // État 2 — explication + blocs teintés.
    expect(await screen.findByText(/Comme une pizza coupée en parts/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Écris ton explication/), {
      target: { value: "Une fraction c'est une part d'un tout." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer à ZETIS" }));

    // État 4 — retour bienveillant.
    expect(await screen.findByText(/72% compris/)).toBeInTheDocument();
    expect(screen.getByText("À ajouter à ton explication")).toBeInTheDocument();

    // Vocabulaire interdit : jamais à l'écran.
    for (const banned of ["échec", "manquant", "lacune"]) {
      expect(screen.queryByText(new RegExp(banned, "i"))).not.toBeInTheDocument();
    }
  });

  it("champ sans match : état vide bienveillant, aucun appel explain", async () => {
    renderPage();
    // Laisse fetchSkills se résoudre avant de soumettre (chip = skills chargés).
    await screen.findByText(/Ta leçon/);

    fireEvent.change(screen.getByLabelText(/Quelle notion/i), {
      target: { value: "le théorème de Pythagore" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Expliquer" }));

    expect(await screen.findByText(/pas encore dans ton programme/)).toBeInTheDocument();
    expect(vi.mocked(explainEli5)).not.toHaveBeenCalled();
  });

  it("notion hors-programme : « Dis à Papa » signale et confirme", async () => {
    vi.mocked(requestNotion).mockResolvedValue({ id: 1, text: "Pythagore", status: "pending" });
    renderPage();
    await screen.findByText(/Ta leçon/);

    fireEvent.change(screen.getByLabelText(/Quelle notion/i), { target: { value: "Pythagore" } });
    fireEvent.click(screen.getByRole("button", { name: "Expliquer" }));

    fireEvent.click(await screen.findByRole("button", { name: /Dis à Papa/ }));

    expect(await screen.findByText(/C'est noté/)).toBeInTheDocument();
    expect(vi.mocked(requestNotion)).toHaveBeenCalledWith("Pythagore");
  });
});
