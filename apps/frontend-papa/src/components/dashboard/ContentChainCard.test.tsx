import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { DashboardContentStage } from "@zetis/types";
import { ContentChainCard } from "./ContentChainCard";

// L'entonnoir de production. Le test central de ce fichier porte sur un chiffre qui était FAUX et
// que personne ne pouvait vérifier tant qu'il n'était pas cliquable.

// ⚠️ Un delta se lit sur la marche SUIVANTE : celui affiché sous « Fiches » décrit le manque de
// QUIZ. La première marche ne porte donc pas de lien (rien ne se trouve au-dessus d'elle), et les
// trois deltas sont ici volontairement distincts — deux nombres égaux rendraient les assertions
// ambiguës sans qu'aucune ne soit fausse.
const STAGES: DashboardContentStage[] = [
  {
    stage: "chapitres_valides",
    label: "Chapitres validés",
    value: 38,
    target: 40,
    missing_href: null,
    missing_count: null,
  },
  {
    stage: "cours_valides",
    label: "Cours validés",
    value: 30,
    target: 36,
    missing_href: "/couverture?filter=no_course",
    missing_count: 6,
  },
  {
    stage: "fiches",
    label: "Fiches",
    value: 11,
    target: 30,
    missing_href: "/couverture?filter=ready&manque=fiche",
    missing_count: 19,
  },
  {
    stage: "quiz",
    label: "Quiz de fin de cours",
    value: 22,
    // 🔴 La cible du quiz est le nombre de COURS (30), pas le nombre de fiches (11).
    target: 30,
    missing_href: "/couverture?filter=ready&manque=quiz",
    missing_count: 8,
  },
];

function renderCard(stages = STAGES, onToggleFocus = () => {}) {
  return render(
    <MemoryRouter>
      <ContentChainCard stages={stages} focus={null} onToggleFocus={onToggleFocus} />
    </MemoryRouter>,
  );
}

describe("ContentChainCard", () => {
  it("le manque décrit toujours la marche SUIVANTE, jamais celle qui le porte", () => {
    // Le calcul historique `stage.value - next.value` donnait ici 11 − 22 = −11 sous « Fiches »,
    // donc « ↓ complet » — alors qu'il manque 8 quiz. Les deux formules coïncident sur les trois
    // premières marches et divergent sur la dernière, ce qui rendait le défaut invisible.
    renderCard();

    expect(screen.getByText("↓ 8 à produire")).toBeTruthy(); // quiz produisibles
    expect(screen.getByText("↓ 19 à produire")).toBeTruthy(); // fiches produisibles
    expect(screen.getByText("↓ 6 à produire")).toBeTruthy(); // cours à rédiger
    expect(screen.queryByText("↓ complet")).toBeNull();
  });

  it("chaque delta ouvre là où SON manque se produit", () => {
    renderCard();

    expect(screen.getByRole("link", { name: "↓ 19 à produire" })).toHaveAttribute(
      "href",
      "/couverture?filter=ready&manque=fiche",
    );
    expect(screen.getByRole("link", { name: "↓ 8 à produire" })).toHaveAttribute(
      "href",
      "/couverture?filter=ready&manque=quiz",
    );
    expect(screen.getByRole("link", { name: "↓ 6 à produire" })).toHaveAttribute(
      "href",
      "/couverture?filter=no_course",
    );
  });

  it("« complet » n'ouvre rien — un lien vers un ensemble vide se lit comme une page cassée", () => {
    renderCard(STAGES.map((stage) => ({ ...stage, value: stage.target, missing_count: 0 })));

    expect(screen.getAllByText("↓ complet").length).toBe(3);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("🔴 affiche ce que la DESTINATION ouvre, pas la soustraction des marches", () => {
    // Le défaut mesuré à l'écran : « ↓ 49 à produire » pour une page qui ouvrait 17 lignes. La
    // soustraction compte les leçons validées SANS cours rédigé, où aucune fiche n'est générable.
    renderCard([
      { ...STAGES[1] },
      { ...STAGES[2], value: 11, target: 60, missing_count: 17 },
    ]);

    expect(screen.getByText("↓ 17 à produire")).toBeTruthy();
    expect(screen.queryByText("↓ 49 à produire")).toBeNull();
  });

  it("retombe sur la soustraction, bornée à zéro, si le serveur ne sert pas le compte", () => {
    // Repli de compatibilité. Un dérivé peut survivre à l'archivage de sa leçon (orphelins) : la
    // marche dépasse alors sa cible, et « ↓ -3 à produire » n'aurait aucun sens.
    renderCard([
      { ...STAGES[2], value: 30, target: 30, missing_count: null },
      { ...STAGES[3], value: 35, target: 30, missing_count: null },
    ]);

    expect(screen.getByText("↓ complet")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/↓ -\d/);
  });

  it("n'affiche aucun lien quand le serveur n'en fournit pas", () => {
    renderCard(STAGES.map((stage) => ({ ...stage, missing_href: null })));

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("↓ 19 à produire")).toBeTruthy();
  });
});
