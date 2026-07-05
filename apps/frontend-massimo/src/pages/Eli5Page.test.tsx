import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type Eli5Explain, type Eli5Reverse } from "../lib/eli5";
import { type StudentNotionsSummary, type SubjectNotions } from "@zetis/types";
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
vi.mock("../lib/notions", () => ({
  fetchNotionsSummary: vi.fn(),
  fetchSubjectNotions: vi.fn(),
}));

import {
  explainEli5,
  fetchDueReviews,
  fetchLessonSuggestions,
  fetchSkills,
  reverseEli5,
} from "../lib/eli5";
import { fetchNotionsSummary, fetchSubjectNotions } from "../lib/notions";

// Explication AVEC leçon canonique → badge « D'après ta leçon ».
const EXPLAIN_WITH_LESSON: Eli5Explain = {
  title: "Les fractions",
  simple_explanation: "Une fraction est une part d'un tout.",
  analogy: "Comme une pizza coupée en parts.",
  example: "1/2 = la moitié.",
  common_mistake: "",
  check_question: "Combien font deux quarts ?",
  next_action: "Réviser demain",
  sources_used: 2,
  lesson_id: 9,
  lesson_title: "Les nombres relatifs",
};
// Explication SANS leçon ni cours → aucun badge (chemin question libre).
const EXPLAIN_NO_SOURCE: Eli5Explain = {
  ...EXPLAIN_WITH_LESSON,
  sources_used: 0,
  lesson_id: undefined,
  lesson_title: undefined,
};

const REVERSE: Eli5Reverse = {
  score: 72,
  feedback: "Bien joué, ton explication est claire.",
  missing_points: ["le dénominateur"],
  next_action: "Refais un exercice sur les parts.",
};

const SUMMARY: StudentNotionsSummary = {
  subjects: [
    { slug: "mathematiques", name: "Mathématiques", notion_count: 2, new_count: 1 }, // fraîches → ✨ new
    { slug: "espagnol", name: "Espagnol", notion_count: 0, new_count: 0 }, // vide → « bientôt »
  ],
};
const MATHS_NOTIONS: SubjectNotions = {
  subject: { slug: "mathematiques", name: "Mathématiques" },
  notions: [{ skill_id: 1, name: "Les fractions", chapter_title: "Nombres et calculs" }],
};
const EMPTY_NOTIONS: SubjectNotions = {
  subject: { slug: "espagnol", name: "Espagnol" },
  notions: [],
};

beforeEach(() => {
  vi.mocked(fetchSkills)
    .mockReset()
    .mockResolvedValue([{ id: 1, name: "Les fractions", subject: "Maths" }]);
  vi.mocked(fetchDueReviews).mockReset().mockResolvedValue([]);
  vi.mocked(fetchLessonSuggestions).mockReset().mockResolvedValue([]);
  vi.mocked(explainEli5).mockReset().mockResolvedValue(EXPLAIN_WITH_LESSON);
  vi.mocked(fetchNotionsSummary).mockReset().mockResolvedValue(SUMMARY);
  vi.mocked(fetchSubjectNotions).mockReset().mockImplementation(async (slug: string) =>
    slug === "espagnol" ? EMPTY_NOTIONS : MATHS_NOTIONS,
  );
});

function renderAt(path = "/eli5") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Eli5Page />
    </MemoryRouter>,
  );
}

describe("Eli5Page — entrée v2 par decks", () => {
  it("écran 1 : decks matières + compteur, matière vide « bientôt »", async () => {
    renderAt();
    // Deck matière avec compteur (2 notions) et deck spécial Question libre.
    expect(await screen.findByRole("button", { name: /Mathématiques/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Question libre/ })).toBeInTheDocument();
    // Matière sans notion : « bientôt », toujours cliquable (dimmedClickable).
    expect(screen.getByText("bientôt ✨")).toBeInTheDocument();
    // Notions fraîchement ajoutées → badge « ✨ new » sur le deck matière.
    const maths = screen.getByRole("button", { name: /Mathématiques/ });
    expect(within(maths).getByText(/new/)).toBeInTheDocument();
  });

  it("chip de notion → session avec badge « D'après ta leçon » (skill_id circule)", async () => {
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: /Mathématiques/ }));

    // Écran 2 : chip de notion (nom + chapitre en sous-texte).
    const chip = await screen.findByRole("button", { name: /Les fractions/ });
    expect(screen.getByText("Nombres et calculs")).toBeInTheDocument();
    fireEvent.click(chip);

    // Écran 3 : explication + badge leçon (le skill_id de la notion a bien circulé).
    expect(await screen.findByText(/Comme une pizza coupée en parts/)).toBeInTheDocument();
    expect(screen.getByText(/D'après ta leçon/)).toBeInTheDocument();
    expect(screen.getByText("Les nombres relatifs")).toBeInTheDocument();
  });

  it("question libre → session SANS badge leçon", async () => {
    vi.mocked(explainEli5).mockResolvedValue(EXPLAIN_NO_SOURCE);
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: /Question libre/ }));

    fireEvent.change(await screen.findByLabelText(/Ta question/i), {
      target: { value: "Les fractions" },
    });
    // Attend que les skills soient chargés (résolution client) puis lance l'explication.
    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: "Expliquer" }));
      expect(vi.mocked(explainEli5)).toHaveBeenCalled();
    });

    expect(await screen.findByText(/Comme une pizza coupée en parts/)).toBeInTheDocument();
    expect(screen.queryByText(/D'après ta leçon/)).not.toBeInTheDocument();
    expect(screen.queryByText(/D'après ton cours/)).not.toBeInTheDocument();
  });

  it("déroule la boucle complète et bannit le vocabulaire négatif", async () => {
    vi.mocked(reverseEli5).mockResolvedValue(REVERSE);
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: /Mathématiques/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Les fractions/ }));

    fireEvent.change(await screen.findByPlaceholderText(/Écris ton explication/), {
      target: { value: "Une fraction c'est une part d'un tout." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer à ZETIS" }));

    expect(await screen.findByText(/72% compris/)).toBeInTheDocument();
    for (const banned of ["échec", "manquant", "lacune"]) {
      expect(screen.queryByText(new RegExp(banned, "i"))).not.toBeInTheDocument();
    }
  });

  it("matière vide : carte positive + question libre possible", async () => {
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: /Espagnol/ }));
    expect(await screen.findByText(/arrivent bientôt/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expliquer" })).toBeInTheDocument();
  });

  it("deep-link ?subject= ouvre directement l'écran notions", async () => {
    renderAt("/eli5?subject=mathematiques");
    expect(await screen.findByRole("button", { name: /Les fractions/ })).toBeInTheDocument();
    // On est bien sur l'écran matière (bouton retour « Matières »).
    expect(screen.getByRole("button", { name: /Matières/ })).toBeInTheDocument();
  });
});
