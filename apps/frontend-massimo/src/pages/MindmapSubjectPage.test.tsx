import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import type { MindmapListItem } from "@zetis/types";

// 🔴 **LES PREMIERS TESTS DE CETTE PAGE.** Elle n'en avait aucun avant le 2026-08-14 — ni de
// rendu, ni de navigation. Ce n'était pas une raison de ne pas en écrire : c'était la raison.

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

const api = vi.hoisted(() => ({
  fetchMindmap: vi.fn(),
  fetchMindmapsIndex: vi.fn(),
  markMindmapSeen: vi.fn(),
  submitMindmapAttempt: vi.fn(),
}));
vi.mock("../lib/mindmaps", () => api);

// Le plan de travail embarque elk + xyflow : hors sujet ici, et lourd à monter.
vi.mock("@zetis/ui/mindmap", () => ({
  MindmapWorkspace: () => <div data-testid="workspace" />,
}));
vi.mock("../components/mindmap/FicheSidePanel", () => ({ FicheSidePanel: () => null }));

import { MindmapSubjectPage } from "./MindmapSubjectPage";

function carte(p: Partial<MindmapListItem> & Pick<MindmapListItem, "id" | "title">): MindmapListItem {
  return {
    lesson_id: 1,
    chapter: "Zébu",
    chapter_id: 1,
    subject_slug: "francais",
    subject: "Français",
    ...p,
  };
}

// ⚠️ DEUX chapitres dans la MÊME matière — sans ça, un regroupement qui les fusionnerait resterait
// invisible (le groupe unique porterait le nom du premier). Ce sabotage est resté VERT en slice
// Quiz, faute d'un décor capable de le voir.
const INDEX: MindmapListItem[] = [
  carte({ id: 1, title: "La phrase complexe" }),
  carte({ id: 2, title: "Le récit", chapter: "Alphabet", chapter_id: 2 }),
  carte({
    id: 30,
    title: "Le théorème de Pythagore",
    chapter: "Géométrie",
    chapter_id: 9,
    subject_slug: "mathematiques",
    subject: "Mathématiques",
  }),
];

function monter(entree = "/mindmaps/francais") {
  return render(
    <MemoryRouter initialEntries={[entree]}>
      <Routes>
        <Route path="/mindmaps/:slug" element={<MindmapSubjectPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  api.fetchMindmapsIndex.mockReset().mockResolvedValue(INDEX);
  api.fetchMindmap.mockReset().mockResolvedValue({
    id: 1,
    lesson_id: 1,
    title: "La phrase complexe",
    chapter: "Zébu",
    subject_slug: "francais",
    mindmap_json: { center: "La phrase complexe", nodes: [] },
  });
  api.markMindmapSeen.mockReset().mockResolvedValue(undefined);
});

describe("MindmapSubjectPage — matière → chapitre + recherche (ADR-0057)", () => {
  it("🔒 range les mindmaps sous LEURS chapitres", async () => {
    monter();

    expect(await screen.findByText("La phrase complexe")).toBeInTheDocument();
    expect(screen.getByText("Zébu")).toBeInTheDocument();
    expect(screen.getByText("Alphabet")).toBeInTheDocument();
  });

  it("🔒 garde l'ordre du PROGRAMME, pas l'alphabétique", async () => {
    // Le serveur rend « Zébu » avant « Alphabet » (Chapter.sort_order). La brique trie par NOM
    // par défaut — la page lui passe l'ordre d'apparition. Sans `chapterOrder`, « Alphabet »
    // remonterait en tête.
    const { container } = monter();
    await screen.findByText("La phrase complexe");

    const titres = [...container.querySelectorAll("p")]
      .map((n) => n.textContent)
      .filter((t) => t === "Zébu" || t === "Alphabet");
    expect(titres).toEqual(["Zébu", "Alphabet"]);
  });

  it("🔒 la recherche traverse les matières, et le clic EMMÈNE par l'adresse neuve", async () => {
    monter();
    await screen.findByText("La phrase complexe");

    fireEvent.change(screen.getByPlaceholderText(/Rechercher une mindmap/), {
      target: { value: "pythagore" },
    });
    expect(screen.getByText("Le théorème de Pythagore")).toBeInTheDocument();
    expect(screen.getByText("Mathématiques")).toBeInTheDocument(); // on sait d'où ça vient
    expect(screen.queryByText("La phrase complexe")).not.toBeInTheDocument();

    // 🔴 Le clic n'ouvre PAS en place : il emmène là où la carte vit, par `?carte=<id>` —
    // l'adresse que cette slice a créée. Sans elle, le résultat serait un cul-de-sac.
    fireEvent.click(screen.getByText("Le théorème de Pythagore"));
    expect(navigateMock).toHaveBeenCalledWith("/mindmaps/mathematiques?carte=30");
    expect(api.fetchMindmap).not.toHaveBeenCalled();
  });

  it("🔒 `?carte=` ouvre la carte à l'arrivée, et se retire de l'URL", async () => {
    function Sonde() {
      const [params] = useSearchParams();
      return <output data-testid="url">{params.toString()}</output>;
    }
    render(
      <MemoryRouter initialEntries={["/mindmaps/francais?carte=2&from=svt"]}>
        <Routes>
          <Route path="/mindmaps/:slug" element={<MindmapSubjectPage />} />
        </Routes>
        <Sonde />
      </MemoryRouter>,
    );

    await waitFor(() => expect(api.fetchMindmap).toHaveBeenCalledWith(2));
    // ⚠️ Le nettoyage ne mange QUE `carte` — le reste de l'URL survit (piège déjà payé sur ELI5
    // et sur `/quiz?subject=…&from=…`).
    await waitFor(() => {
      const url = screen.getByTestId("url").textContent ?? "";
      expect(url).toContain("from=svt");
      expect(url).not.toContain("carte=");
    });
  });

  it("🔒 un mot qui ne trouve rien nomme ce qu'on cherchait", async () => {
    monter();
    await screen.findByText("La phrase complexe");

    fireEvent.change(screen.getByPlaceholderText(/Rechercher une mindmap/), {
      target: { value: "zzzz" },
    });
    expect(screen.getByText(/Aucune mindmap ne correspond à « zzzz »/)).toBeInTheDocument();
  });
});
