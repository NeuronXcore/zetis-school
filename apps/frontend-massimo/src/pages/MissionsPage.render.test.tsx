import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Mission } from "@zetis/types";

// 🔴 **LES PREMIERS TESTS DE RENDU DE CETTE PAGE.** `MissionsPage.test.tsx` en portait deux, mais
// aucun ne montait le composant : ils vérifient la table `TYPE_META`. Une page de trois écrans
// n'avait donc **aucun filet** de rendu — la même situation que `MindmapSubjectPage` deux jours
// plus tôt. Ce n'était pas une raison de ne pas en écrire : c'était la raison.

const ui = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../hooks/useMissions", async (orig) => {
  const actual = await orig<typeof import("../hooks/useMissions")>();
  return { ...actual, useMissions: () => ui.value };
});

// Les modales embarquent quiz/mindmap/ELI5 : hors sujet ici, et lourdes à monter.
vi.mock("../components/missions/Eli5MissionModal", () => ({ Eli5MissionModal: () => null }));
vi.mock("../components/missions/QuizMissionModal", () => ({ QuizMissionModal: () => null }));
vi.mock("../components/missions/MindmapMissionModal", () => ({ MindmapMissionModal: () => null }));

import { MissionsPage } from "./MissionsPage";

function mission(p: Partial<Mission> & Pick<Mission, "id" | "title">): Mission {
  return {
    subject: "Mathématiques",
    subject_slug: "mathematiques",
    chapter_id: 1,
    chapter: "Nombres relatifs",
    skill_id: 1,
    skill_name: "Notion",
    description: null,
    mission_type: "manual",
    status: "planned",
    priority: 0,
    estimated_minutes: 10,
    xp_reward: 50,
    steps: [],
    ...p,
  };
}

// ⚠️ DEUX chapitres dans la MÊME matière — sans ça, un regroupement qui les fusionnerait resterait
// invisible (le groupe unique porterait le nom du premier). Ce sabotage est resté VERT en slice
// Quiz, faute d'un décor capable de le voir.
const MATHS = {
  name: "Mathématiques",
  slug: "mathematiques",
  missions: [
    mission({ id: 1, title: "Travailler : Règle des signes" }),
    mission({ id: 2, title: "Renforcer : Fractions", chapter_id: 2, chapter: "Fractions" }),
    // 🔴 Une notion enseignée dans plusieurs chapitres → le serveur rend `null`, et l'écran doit
    // l'accueillir sous « Sans chapitre » plutôt que de l'inventer un.
    mission({ id: 3, title: "Renforcer : Priorités", chapter_id: null, chapter: null }),
  ],
};
const FRANCAIS = {
  name: "Français",
  slug: "francais",
  missions: [
    mission({
      id: 9,
      title: "Travailler : Participe passé",
      subject: "Français",
      subject_slug: "francais",
      chapter_id: 7,
      chapter: "Orthographe",
    }),
  ],
};

function etat(groups = [MATHS, FRANCAIS]) {
  return {
    loading: false,
    error: null,
    today: { elected: null, reason: null },
    groups,
    champions: [],
    upToDate: [],
    completed: [],
    completion: null,
    busy: false,
    activeActivity: null,
    slugForSubject: (n: string) => (n === "Français" ? "francais" : "mathematiques"),
    openStep: vi.fn(),
    onStepDone: vi.fn(),
    closeActivity: vi.fn(),
    reload: vi.fn(),
    dismissCompletion: vi.fn(),
  };
}

function ouvrirMaths() {
  render(
    <MemoryRouter initialEntries={["/missions"]}>
      <MissionsPage />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Mathématiques/ }));
}

beforeEach(() => {
  ui.value = etat();
});

describe("MissionsPage — matière → chapitre + recherche (ADR-0057 addendum)", () => {
  it("🔒 range les missions sous LEURS chapitres, « Sans chapitre » compris", () => {
    ouvrirMaths();

    expect(screen.getByText("Nombres relatifs")).toBeInTheDocument();
    expect(screen.getByText("Fractions")).toBeInTheDocument();
    // La mission dont la notion traverse plusieurs chapitres est accueillie, pas rangée d'office.
    expect(screen.getByText("Sans chapitre")).toBeInTheDocument();
    expect(screen.getByText("Renforcer : Priorités")).toBeInTheDocument();
  });

  it("🔒 « Sans chapitre » vient EN DERNIER, jamais en tête", () => {
    ouvrirMaths();
    const libelles = [...document.querySelectorAll("p.uppercase")].map((n) => n.textContent);
    expect(libelles[libelles.length - 1]).toBe("Sans chapitre");
  });

  it("🔒 l'écran ne NOMME PAS deux fois la matière ouverte", () => {
    // L'en-tête d'écran la porte déjà. Le triple nommage a été payé à l'écran sur `/fiches`.
    ouvrirMaths();
    expect(screen.getAllByText("Mathématiques")).toHaveLength(1);
  });

  it("🔒 la recherche TRAVERSE les matières, et le clic ouvre la mission", () => {
    ouvrirMaths();
    // Avant de chercher, l'écran ne montre QUE la matière ouverte.
    expect(screen.queryByText("Travailler : Participe passé")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Rechercher une mission/), {
      target: { value: "participe" },
    });
    expect(screen.getByText("Travailler : Participe passé")).toBeInTheDocument();
    expect(screen.queryByText("Travailler : Règle des signes")).not.toBeInTheDocument();
    // On sait d'où vient le résultat : l'en-tête d'étagère le nomme.
    expect(screen.getByRole("button", { name: /Français/ })).toBeInTheDocument();

    // 🔴 Le clic EMMÈNE : il ouvre la mission d'une autre matière, sans adresse à inventer —
    // la destination est un écran de mission, pas une page.
    fireEvent.click(screen.getByText("Travailler : Participe passé"));
    expect(screen.getByText(/Participe passé/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Rechercher une mission/)).not.toBeInTheDocument();
  });

  it("🔒 un mot qui ne trouve rien nomme ce qu'on cherchait", () => {
    ouvrirMaths();
    fireEvent.change(screen.getByPlaceholderText(/Rechercher une mission/), {
      target: { value: "zzzz" },
    });
    expect(screen.getByText(/Aucune mission ne correspond à « zzzz »/)).toBeInTheDocument();
  });

  it("une matière sans mission garde son message serein", () => {
    ui.value = etat([{ name: "SVT", slug: "svt", missions: [] }, MATHS]);
    render(
      <MemoryRouter initialEntries={["/missions"]}>
        <MissionsPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /SVT/ }));
    expect(screen.getByText(/À jour, bravo/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Rechercher une mission/)).not.toBeInTheDocument();
  });
});
