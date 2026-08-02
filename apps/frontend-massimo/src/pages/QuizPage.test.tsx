import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import type { QuizSubjectSummary, StudentQuiz } from "@zetis/types";
import { QuizPage } from "./QuizPage";

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../lib/quiz", () => ({
  fetchQuizSubjects: vi.fn(),
  fetchSubjectQuizzes: vi.fn(),
}));
import { fetchQuizSubjects, fetchSubjectQuizzes } from "../lib/quiz";

const SUBJECTS: QuizSubjectSummary[] = [
  { slug: "mathematiques", name: "Mathématiques", quiz_count: 1 },
  { slug: "svt", name: "SVT", quiz_count: 2 },
];

const QUIZZES: StudentQuiz[] = [
  {
    id: 6,
    lesson_id: 21,
    title: "Quiz — Les fractions",
    quiz_type: "mission",
    questions: [],
  } as unknown as StudentQuiz,
];

function renderAt(path = "/quiz") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QuizPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  vi.mocked(fetchQuizSubjects).mockReset().mockResolvedValue(SUBJECTS);
  vi.mocked(fetchSubjectQuizzes).mockReset().mockResolvedValue(QUIZZES);
});

describe("QuizPage — lien profond par matière", () => {
  it("`?subject=` ouvre directement les quiz de CETTE matière", async () => {
    // ⚠️ Régression du 2026-08-01 : la bande de la page matière affichait « 1 quiz » sans
    // pouvoir l'ouvrir — `/quiz` gardait la matière en état interne, invisible de l'URL. Le
    // clic ne faisait rien, et ça se lisait comme une panne.
    renderAt("/quiz?subject=mathematiques");

    expect(await screen.findByText(/Les fractions/)).toBeInTheDocument();
    expect(fetchSubjectQuizzes).toHaveBeenCalledWith("mathematiques");
  });

  it("sans `?subject=`, on reste sur la grille des matières", async () => {
    renderAt("/quiz");

    expect(await screen.findByText("Mathématiques")).toBeInTheDocument();
    expect(fetchSubjectQuizzes).not.toHaveBeenCalled();
  });

  it("le nettoyage d'URL ne mange QUE `subject` — `from` doit survivre", async () => {
    // La bande envoie `/quiz?subject=svt&from=svt` : `subject` ouvre la matière, `from` sert le
    // rétrolien. Le `setSearchParams` de cette page ne doit retirer que le premier — c'est
    // exactement le piège déjà rencontré sur ELI5.
    //
    // ⚠️ On lit l'URL du ROUTEUR via une sonde, pas `window.location` : `MemoryRouter` n'y
    // touche pas, et l'assertion serait verte à vide.
    function Sonde() {
      const [params] = useSearchParams();
      return <output data-testid="url">{params.toString()}</output>;
    }
    render(
      <MemoryRouter initialEntries={["/quiz?subject=svt&from=svt"]}>
        <QuizPage />
        <Sonde />
      </MemoryRouter>,
    );
    await screen.findByText(/Les fractions/);

    const url = screen.getByTestId("url").textContent ?? "";
    expect(url).toContain("from=svt"); // le rétrolien survit
    expect(url).not.toContain("subject="); // l'ouverture ne se rejoue pas au retour
  });

  it("une matière inconnue laisse la grille, SANS message d'échec", async () => {
    // Ce n'est pas la faute de Massimo, et la grille répond déjà à « où y a-t-il des quiz ? ».
    const { container } = renderAt("/quiz?subject=latin");

    expect(await screen.findByText("Mathématiques")).toBeInTheDocument();
    expect(fetchSubjectQuizzes).not.toHaveBeenCalled();
    expect(container.textContent).not.toMatch(/erreur|introuvable|échec/i);
  });
});
