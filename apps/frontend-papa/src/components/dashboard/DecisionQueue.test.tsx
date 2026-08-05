import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { InboxItem } from "@zetis/types";
import { DecisionQueue } from "./DecisionQueue";

// La file « À décider » a une doctrine écrite au-dessus du composant : elle TRIE, elle ne travaille
// pas. Les tests les plus importants de ce fichier ne vérifient pas ce qu'elle affiche, mais ce
// qu'elle refuse d'afficher — c'est ce qui se perd en premier quand on veut « rendre service ».

const VALIDATION: InboxItem = {
  kind: "validation",
  count: 33,
  label: "33 contenus en attente de relecture",
  detail: "27 cours · 1 fiche · 5 capsules",
  href: "/relecture",
  breakdown: [
    { kind: "lesson", count: 27, label: "27 cours", href: "/relecture?kind=lesson" },
    { kind: "fiche", count: 1, label: "1 fiche", href: "/relecture?kind=fiche" },
    { kind: "capsule", count: 5, label: "5 capsules", href: "/relecture?kind=capsule" },
  ],
};

const GAP: InboxItem = {
  kind: "gap",
  count: 2,
  label: "2 notions à renforcer sans mission active",
  detail: "Fractions · Pythagore",
  href: "/lacunes",
  breakdown: [],
};

function renderQueue(items: InboxItem[]) {
  return render(
    <MemoryRouter>
      <DecisionQueue items={items} />
    </MemoryRouter>,
  );
}

describe("DecisionQueue", () => {
  it("rend chaque part du détail comme un lien vers sa surface", () => {
    renderQueue([VALIDATION]);

    expect(screen.getByRole("link", { name: "27 cours" })).toHaveAttribute(
      "href",
      "/relecture?kind=lesson",
    );
    expect(screen.getByRole("link", { name: "1 fiche" })).toHaveAttribute(
      "href",
      "/relecture?kind=fiche",
    );
    expect(screen.getByRole("link", { name: "5 capsules" })).toHaveAttribute(
      "href",
      "/relecture?kind=capsule",
    );
    expect(screen.getByRole("link", { name: "Relire" })).toHaveAttribute("href", "/relecture");
  });

  it("garde UNE SEULE LIGNE par famille, même décomposée", () => {
    // 🔴 Le verrou doctrinal : « une ligne par famille, jamais une ligne par contenu ». Détaillée
    // en 33 lignes, la file redeviendrait une liste de tâches — exactement ce que la page
    // /relecture existe pour porter.
    renderQueue([VALIDATION, GAP]);

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("n'expose AUCUN bouton d'action dans la file", () => {
    // Valider depuis le dashboard paraîtrait serviable et ferait de la file un poste de travail.
    // Les seuls éléments cliquables sont des liens.
    renderQueue([VALIDATION, GAP]);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("retombe sur le détail textuel quand le breakdown est vide", () => {
    renderQueue([GAP]);

    const ligne = screen.getByRole("listitem");
    expect(within(ligne).getByText("Fractions · Pythagore")).toBeTruthy();
    // Le détail d'une famille non décomposable ne doit pas devenir cliquable par accident.
    expect(within(ligne).getAllByRole("link")).toHaveLength(1);
  });

  it("n'affiche pas le détail brut quand il est décomposé", () => {
    // Sinon Papa lirait deux fois la même chose, une fois cliquable et une fois non.
    renderQueue([VALIDATION]);

    expect(screen.queryByText("27 cours · 1 fiche · 5 capsules")).toBeNull();
  });

  it("écrit l'état vide au lieu de féliciter", () => {
    renderQueue([]);

    expect(screen.getByText(/Quand cette file est vide, il n'y a rien à faire\./)).toBeTruthy();
  });
});
