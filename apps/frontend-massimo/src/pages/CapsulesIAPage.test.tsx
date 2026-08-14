import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CapsulesIAPage } from "./CapsulesIAPage";
import type { CapsulePublicItem } from "../lib/capsules";

// 🔒 LE VERROU DE PARITÉ de l'ADR-0057 (slice Quiz).
//
// La page Capsules est l'**étalon** : c'est d'elle que vient le motif « matière → chapitre +
// recherche », et la slice l'a migrée sur la brique partagée `SubjectChapterShelves`. Elle
// n'avait **aucun test** jusqu'ici — la parité n'avait donc aucun garde. Ce fichier en pose un
// sur ce qui doit rester vrai après la migration.

vi.mock("../lib/capsules", async (orig) => {
  const actual = await orig<typeof import("../lib/capsules")>();
  return {
    ...actual,
    fetchCapsuleLibrary: vi.fn(),
    fetchCapsuleStats: vi.fn(),
    recordCapsuleView: vi.fn(),
    videoSrc: (u: string) => u,
  };
});
import { fetchCapsuleLibrary, fetchCapsuleStats } from "../lib/capsules";

vi.mock("@zetis/ui", async (orig) => {
  const actual = await orig<typeof import("@zetis/ui")>();
  return { ...actual, useCelebrate: () => vi.fn(), SoundToggle: () => null };
});

const CAPSULES: CapsulePublicItem[] = [
  {
    id: 1,
    title: "Les fractions en vidéo",
    subject: "Mathématiques",
    subject_slug: "mathematiques",
    chapter_id: 3,
    chapter: "Nombres et calculs",
    difficulty: null,
    video_url: "/v/1.mp4",
    seen: true,
  },
  {
    id: 2,
    title: "La photosynthèse expliquée",
    subject: "SVT",
    subject_slug: "svt",
    chapter_id: 8,
    chapter: "Le vivant",
    difficulty: null,
    video_url: "/v/2.mp4",
    seen: true,
  },
];

beforeEach(() => {
  vi.mocked(fetchCapsuleLibrary).mockReset().mockResolvedValue(CAPSULES);
  vi.mocked(fetchCapsuleStats)
    .mockReset()
    .mockResolvedValue({ total: 2, seen_count: 2, new_count: 0, view_count: 5 });
});

describe("CapsulesIAPage — parité après migration sur la brique partagée", () => {
  it("les étagères sont FERMÉES à l'arrivée, et une matière s'ouvre au clic", async () => {
    // 🔴 C'est la parité elle-même : la page Capsules n'ouvre rien d'office. Le `defaultOpen` de
    // la brique existe pour l'écran des quiz, PAS pour celui-ci.
    render(<CapsulesIAPage />);

    expect(await screen.findByText("Mathématiques")).toBeInTheDocument();
    expect(screen.queryByText("Les fractions en vidéo")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Mathématiques"));
    expect(screen.getByText("Nombres et calculs")).toBeInTheDocument();
    expect(screen.getByText("Les fractions en vidéo")).toBeInTheDocument();
  });

  it("la recherche filtre TOUTES les matières, et son état vide nomme ce qu'on cherchait", async () => {
    render(<CapsulesIAPage />);
    await screen.findByText("Mathématiques");

    const champ = screen.getByPlaceholderText(/Rechercher une capsule/);
    fireEvent.change(champ, { target: { value: "photosynth" } });
    // La matière qui ne correspond pas disparaît ; celle qui correspond reste.
    expect(screen.queryByText("Mathématiques")).not.toBeInTheDocument();
    expect(screen.getByText("SVT")).toBeInTheDocument();

    fireEvent.change(champ, { target: { value: "zzzz" } });
    expect(screen.getByText(/Aucune capsule ne correspond à « zzzz »/)).toBeInTheDocument();
  });
});
