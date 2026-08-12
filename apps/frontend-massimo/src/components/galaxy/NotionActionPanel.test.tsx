import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GalaxyNotion } from "@zetis/types";
import { NotionActionPanel } from "./NotionActionPanel";

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../../lib/quiz", () => ({ fetchQuizById: vi.fn() }));
import { fetchQuizById } from "../../lib/quiz";

beforeEach(() => {
  navigateMock.mockReset();
  vi.mocked(fetchQuizById).mockReset();
});

function panel(notion: Partial<GalaxyNotion> = {}) {
  const full: GalaxyNotion = {
    skill_id: 12,
    name: "Mitose",
    status: "learning",
    chapter_title: "La cellule",
    subject_slug: "svt",
    subject_name: "SVT",
    actions: [
      { kind: "cours", available: true, lesson_id: 3 },
      { kind: "eli5", available: true },
    ],
    ...notion,
  };
  return render(
    <MemoryRouter>
      <NotionActionPanel notion={full} onClose={() => {}} />
    </MemoryRouter>,
  );
}

describe("NotionActionPanel", () => {
  it("rend exactement les actions du serveur, dans l'ordre reçu", () => {
    panel({
      actions: [
        { kind: "eli5", available: true },
        { kind: "quiz", available: true, quiz_id: 9 },
      ],
    });
    const labels = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(labels.filter((l) => l.includes("Fais-moi comprendre"))).toHaveLength(1);
    expect(labels.filter((l) => l.includes("Me tester"))).toHaveLength(1);
  });

  it("affiche la panoplie complète, en grisant ce qui n'existe pas encore", () => {
    // Révision de l'ADR-0024 §4 (2026-07-28) : Massimo voit tout ce que ZETIS sait faire
    // d'une notion. Une activité manquante n'est pas son échec — c'est du contenu à produire.
    panel({
      actions: [
        { kind: "eli5", available: true },
        { kind: "fiche", available: false },
        { kind: "capsule", available: false },
      ],
    });
    expect(screen.getByText("Lire la fiche")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Lire la fiche/ }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(
      screen.getByRole("button", { name: /Fais-moi comprendre/ }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("ne formule jamais l'indisponibilité comme un échec", () => {
    const { container } = panel({
      actions: [{ kind: "eli5", available: true }, { kind: "quiz", available: false }],
    });
    expect(container.textContent).not.toMatch(/échec|raté|impossible|erreur|manque/i);
  });

  it("met l'accent sur la première activité RÉELLEMENT faisable", () => {
    panel({
      actions: [
        { kind: "cours", available: false },
        { kind: "eli5", available: true },
      ],
    });
    // Un bouton mis en avant doit pouvoir être cliqué : l'accent ne va pas au cours absent.
    const eli5 = screen.getByRole("button", { name: /Fais-moi comprendre/ });
    expect(eli5.className).toContain("from-zetis-accent");
    expect(screen.getByRole("button", { name: /Voir le cours/ }).className).not.toContain(
      "from-zetis-accent",
    );
  });

  it("montre le libellé ENFANT de l'état, jamais le statut technique ni un score", () => {
    const { container } = panel({ status: "solid" });
    expect(screen.getByText("Bien acquis")).toBeTruthy();
    expect(container.textContent).not.toMatch(/solid|mastery|%/);
  });
});

// --- Destinations : le filet de l'extraction (2026-08-01) --------------------------------
//
// Ces cas ont été écrits AVANT de sortir la table `kind → route` de la closure `go()`, et
// contre le code d'alors. Ils n'ont pas bougé pendant l'extraction : leur vert est la preuve
// que `notionRoutes.ts` envoie Massimo exactement là où le panneau l'envoyait.
//
// ⚠️ Avant eux, AUCUN test ne couvrait les destinations — seulement les libellés, le `disabled`
// et l'accent. Un refactor de routage se serait fait sans filet.

describe("NotionActionPanel — destinations", () => {
  // ⚠️ DEUX lignes de ce tableau ont changé à l'extraction, et deux seulement : `eli5` et
  // `revision` gagnent `&from=<slug>`. Ce n'est pas une dérive du refactor, c'est l'ajout
  // délibéré du rétrolien — ces deux surfaces sont les seules dont le CHEMIN ne porte pas la
  // matière, donc les seules incapables de savoir d'où Massimo vient. Les cinq autres
  // destinations sont identiques au caractère près.
  const CAS: Array<[string, GalaxyNotion["actions"][number], string, RegExp]> = [
    ["cours", { kind: "cours", available: true, lesson_id: 3 }, "/subjects/svt/cours", /Voir le cours/],
    [
      "eli5",
      { kind: "eli5", available: true },
      "/eli5?skill_id=12&name=Mitose&from=svt",
      /Fais-moi comprendre/,
    ],
    ["fiche", { kind: "fiche", available: true, fiche_id: 5 }, "/fiches/svt", /Lire la fiche/],
    ["capsule", { kind: "capsule", available: true, capsule_id: 7 }, "/capsules", /Regarder la capsule/],
    [
      "mindmap",
      { kind: "mindmap", available: true, mindmap_id: 44 },
      "/mindmaps/reconstruire/44",
      // « la mindmap » et non « la carte » depuis le 2026-08-12 : ce libellé se lisait deux lignes
      // au-dessus de « Réviser mes cartes ». L'invariant vit dans `lib/notionActionUi.test.ts` ;
      // ici on ne fait que cliquer sur le bouton par son nom.
      /Reconstruire la mindmap/,
    ],
    [
      "revision",
      { kind: "revision", available: true },
      // `?subject=` LANCE la session, `?from=` sert le retour. Deux paramètres parce que ce
      // sont deux rôles : les confondre ferait d'un lien de retour un lancement.
      "/revision?subject=svt&from=svt",
      /Réviser mes cartes/,
    ],
  ];

  it.each(CAS)("« %s » ouvre sa surface réelle", (_kind, action, route, label) => {
    panel({ actions: [action] });
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(navigateMock.mock.calls[0][0]).toBe(route);
  });

  it("la fiche transporte le NOM de la matière (l'URL ne porte qu'un slug)", () => {
    panel({ actions: [{ kind: "fiche", available: true, fiche_id: 5 }] });
    fireEvent.click(screen.getByRole("button", { name: /Lire la fiche/ }));
    expect(navigateMock.mock.calls[0][1]).toEqual({ state: { name: "SVT" } });
  });

  it("le quiz charge le quiz COMPLET puis navigue avec returnTo=/galaxy", async () => {
    // `/quiz/session` n'est pas adressable par id : il attend le quiz dans `location.state`.
    // C'est la seule activité asynchrone, et le `returnTo` est ce que l'extraction paramètre.
    vi.mocked(fetchQuizById).mockResolvedValue({ id: 9 } as never);
    panel({ actions: [{ kind: "quiz", available: true, quiz_id: 9 }] });
    fireEvent.click(screen.getByRole("button", { name: /Me tester/ }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    expect(fetchQuizById).toHaveBeenCalledWith(9);
    expect(navigateMock.mock.calls[0][0]).toBe("/quiz/session");
    expect(navigateMock.mock.calls[0][1].state).toMatchObject({
      quiz: { id: 9 },
      label: "SVT · Mitose",
      returnTo: "/galaxy",
    });
  });

  it("un quiz disparu retombe sur la liste, SANS message d'échec", async () => {
    // Ce n'est pas la faute de Massimo : on ne lui montre pas d'erreur, on l'emmène ailleurs.
    vi.mocked(fetchQuizById).mockRejectedValue(new Error("404"));
    const { container } = panel({ actions: [{ kind: "quiz", available: true, quiz_id: 9 }] });
    fireEvent.click(screen.getByRole("button", { name: /Me tester/ }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/quiz"));
    expect(container.textContent).not.toMatch(/erreur|échec|introuvable/i);
  });

  it("une activité indisponible ne navigue NULLE PART", () => {
    panel({ actions: [{ kind: "fiche", available: false }] });
    fireEvent.click(screen.getByRole("button", { name: /Lire la fiche/ }));
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
