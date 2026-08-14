import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import type { QuizSubjectSummary, StudentQuizListItem } from "@zetis/types";
import { QuizPage } from "./QuizPage";

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../lib/quiz", () => ({
  fetchQuizSubjects: vi.fn(),
  fetchQuizIndex: vi.fn(),
  fetchQuizById: vi.fn(),
}));
import { fetchQuizIndex, fetchQuizSubjects } from "../lib/quiz";

const SUBJECTS: QuizSubjectSummary[] = [
  { slug: "mathematiques", name: "Mathématiques", quiz_count: 1 },
  { slug: "svt", name: "SVT", quiz_count: 2 },
];

// ⚠️ Le listing est désormais LÉGER et couvre TOUTES les matières (ADR-0057) : la page ne
// demande plus les quiz d'une matière, elle filtre ce qu'elle a déjà.
const INDEX: StudentQuizListItem[] = [
  {
    quiz_id: 6,
    title: "Quiz — Les fractions",
    subject: "Mathématiques",
    subject_slug: "mathematiques",
    chapter_id: 3,
    chapter: "Nombres et calculs",
    lesson_id: 21,
    questions_count: 4,
  },
  {
    // ⚠️ DEUXIÈME chapitre de la MÊME matière — sans lui, un regroupement qui fusionnerait tous
    // les chapitres resterait invisible : le groupe unique porterait le nom du premier quiz et
    // l'écran serait identique. Le sabotage « tout dans Sans chapitre » est resté VERT jusqu'à
    // ce que ce quiz existe.
    quiz_id: 7,
    title: "Quiz — Le théorème de Pythagore",
    subject: "Mathématiques",
    subject_slug: "mathematiques",
    chapter_id: 5,
    chapter: "Géométrie",
    lesson_id: 22,
    questions_count: 6,
  },
  {
    quiz_id: 9,
    title: "Quiz — La photosynthèse",
    subject: "SVT",
    subject_slug: "svt",
    chapter_id: 8,
    chapter: "Le vivant",
    lesson_id: 44,
    questions_count: 3,
  },
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
  vi.mocked(fetchQuizIndex).mockReset().mockResolvedValue(INDEX);
});

describe("QuizPage — lien profond par matière", () => {
  it("`?subject=` ouvre directement les quiz de CETTE matière", async () => {
    // ⚠️ Régression du 2026-08-01 : la bande de la page matière affichait « 1 quiz » sans
    // pouvoir l'ouvrir — `/quiz` gardait la matière en état interne, invisible de l'URL. Le
    // clic ne faisait rien, et ça se lisait comme une panne.
    renderAt("/quiz?subject=mathematiques");

    expect(await screen.findByText(/Les fractions/)).toBeInTheDocument();
    // ⚠️ L'assertion porte sur CE QUE L'ÉCRAN MONTRE, pas sur l'appel réseau : depuis
    // l'ADR-0057 la page charge un listing unique, toutes matières, et filtre elle-même. Un
    // `toHaveBeenCalledWith("mathematiques")` ne dirait plus rien du comportement voulu.
    expect(screen.queryByText(/photosynthèse/)).not.toBeInTheDocument();
  });

  it("sans `?subject=`, on reste sur la grille des matières", async () => {
    renderAt("/quiz");

    expect(await screen.findByText("Mathématiques")).toBeInTheDocument();
    expect(screen.queryByText(/Les fractions/)).not.toBeInTheDocument(); // aucun quiz affiché
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
    // ⚠️ SVT, donc le quiz de SVT. L'ancien décor rendait les MÊMES quiz quelle que soit la
    // matière demandée (le mock ignorait son argument) : « Les fractions » s'affichait en
    // ouvrant SVT, et personne ne pouvait le voir. Le listing unique a rendu le décor honnête.
    await screen.findByText(/photosynthèse/);

    // 🔴 `waitFor`, et non une lecture immédiate. L'affichage des quiz et le nettoyage d'URL
    // passent par DEUX chemins d'état indépendants — l'état de la page d'un côté, le routeur de
    // l'autre — et rien ne garantit que React les commite dans le même rendu. Attendre le
    // premier pour lire le second était une COURSE.
    //
    // Elle s'est manifestée deux fois le 2026-08-11 en suite complète, puis a été **reproduite
    // volontairement sous charge** (backend + Papa lancés en parallèle) :
    //   AssertionError: expected 'subject=svt&from=svt' not to contain 'subject='
    // Le nettoyage avait bien eu lieu — la sonde ne l'avait pas encore vu.
    //
    // ⚠️ Les DEUX assertions restent dans le `waitFor` : si le nettoyage mangeait aussi `from`,
    // la condition ne serait jamais satisfaite et le test échouerait. L'invariant est intact,
    // seule sa synchronisation est corrigée. **On attend ce qu'on assère.**
    await waitFor(() => {
      const url = screen.getByTestId("url").textContent ?? "";
      expect(url).toContain("from=svt"); // le rétrolien survit
      expect(url).not.toContain("subject="); // l'ouverture ne se rejoue pas au retour
    });
  });

  it("une matière inconnue laisse la grille, SANS message d'échec", async () => {
    // Ce n'est pas la faute de Massimo, et la grille répond déjà à « où y a-t-il des quiz ? ».
    const { container } = renderAt("/quiz?subject=latin");

    expect(await screen.findByText("Mathématiques")).toBeInTheDocument();
    expect(screen.queryByText(/Les fractions/)).not.toBeInTheDocument(); // on reste sur la grille
    expect(container.textContent).not.toMatch(/erreur|introuvable|échec/i);
  });
});

describe("QuizPage — matière → chapitre + recherche (ADR-0057)", () => {
  it("🔒 les quiz sont rangés SOUS le nom de leur chapitre", async () => {
    renderAt("/quiz?subject=mathematiques");

    expect(await screen.findByText(/Les fractions/)).toBeInTheDocument();
    // Le chapitre vient de la leçon, côté serveur — c'est lui qui rend le rangement possible.
    // 🔴 LES DEUX chapitres de la matière doivent apparaître, chacun avec SON quiz : c'est ce
    // qui distingue un vrai regroupement d'un tas unique.
    expect(screen.getByText("Nombres et calculs")).toBeInTheDocument();
    expect(screen.getByText("Géométrie")).toBeInTheDocument();
    expect(screen.getByText(/Pythagore/)).toBeInTheDocument();
  });

  it("🔒 la recherche traverse les MATIÈRES — la règle des capsules, pas celle de la galaxie", async () => {
    // 🔴 Arbitrage du 2026-08-14 : on cherche sans savoir la matière. Depuis les quiz de maths,
    // « photosynth » doit trouver le quiz de SVT — et le clic mène dessus, il ne l'affiche pas
    // en cul-de-sac. Borner la recherche à la matière ouverte ferait rougir CE test : c'est
    // exactement la règle qui n'a PAS été retenue.
    renderAt("/quiz?subject=mathematiques");
    await screen.findByText(/Les fractions/);

    fireEvent.change(screen.getByPlaceholderText(/Rechercher un quiz/), {
      target: { value: "photosynth" },
    });

    expect(screen.getByText(/photosynthèse/)).toBeInTheDocument();
    expect(screen.queryByText(/Les fractions/)).not.toBeInTheDocument();
  });

  it("🔒 un mot qui ne trouve rien nomme ce qu'on cherchait", async () => {
    renderAt("/quiz?subject=mathematiques");
    await screen.findByText(/Les fractions/);

    fireEvent.change(screen.getByPlaceholderText(/Rechercher un quiz/), {
      target: { value: "zzzz" },
    });
    expect(screen.getByText(/Aucun quiz ne correspond à « zzzz »/)).toBeInTheDocument();
  });
});

describe("QuizPage — l'en-tête ne ment pas pendant une recherche", () => {
  it("🔒 chercher hors de la matière ouverte change le TITRE de la page", async () => {
    // 🔴 Défaut trouvé à l'écran, invisible à tous les autres tests : « thales » depuis les quiz
    // de Français affichait deux quiz de Mathématiques sous un titre « 📖 Français ».
    renderAt("/quiz?subject=mathematiques");
    await screen.findByText(/Les fractions/);
    // ⚠️ `getByRole("heading")` : « Mathématiques » apparaît DEUX fois (le titre de la page et
    // l'étagère de la matière). Un `getByText` échouerait sur l'ambiguïté, pas sur le défaut.
    expect(screen.getByRole("heading", { name: /Mathématiques/ })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Rechercher un quiz/), {
      target: { value: "photosynth" },
    });
    expect(screen.getByText("🔎 Résultats de recherche")).toBeInTheDocument();
  });
});
