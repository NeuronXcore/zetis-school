import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { DashboardSeries } from "@zetis/types";
import { MemoryTrendCard } from "./MemoryTrendCard";

// « Évolution de la mémoire » à quatre vues.
//
// Ce que ces tests protègent n'est PAS l'apparence des tracés — elle se vérifie à l'œil — mais les
// deux propriétés qui, si elles se décrochaient, produiraient un écran crédible et faux :
//
//   1. les quatre vues lisent des séries DIFFÉRENTES. Une vue branchée sur la mauvaise série
//      afficherait des nombres plausibles issus d'une autre mesure ;
//   2. un flux à zéro se dit « on n'a pas de trace », jamais « rien n'a bougé ». C'est toute la
//      raison d'être de la vue « Solde » : elle est la seule surface où une PERTE est visible, et
//      une ligne plate y mentirait tranquillement.

function series(overrides: Partial<DashboardSeries> = {}): DashboardSeries {
  return {
    covered: [10, 20],
    consolidated: [1, 3],
    fragile: [4, 4],
    in_progress: [2, 5],
    gained: [0, 6],
    lost: [7, 0],
    reviews: { again: [8, 0], hard: [0, 9], good: [11, 0], easy: [0, 12] },
    ...overrides,
  };
}

function renderCard(props: Partial<React.ComponentProps<typeof MemoryTrendCard>> = {}) {
  return render(
    <MemoryTrendCard
      series={series()}
      period="30"
      focus={null}
      reviewLoad={Array.from({ length: 14 }, () => 2)}
      notionsTotal={40}
      historySince="2026-07-31"
      {...props}
    />,
  );
}

const view = (label: string) => screen.getByRole("button", { name: label });

describe("les quatre vues de la carte mémoire", () => {
  it("ouvre sur « Paliers », la vue qui justifie les KPI qui allument la carte", () => {
    // Ce défaut par défaut n'est pas esthétique : `CARD_SCOPES` fait allumer cette carte par
    // « Notions consolidées » et « À renforcer ». Ouvrir sur les révisions SRS — la vue la mieux
    // fournie en données — ferait tomber le clic d'un KPI sur un diagramme qui ne le justifie pas.
    renderCard();
    expect(view("Paliers")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/Paliers/);
  });

  it("chaque vue lit SA série, et pas celle de sa voisine", () => {
    // Les valeurs du fixture sont toutes distinctes : une vue qui lirait la mauvaise clé
    // afficherait un nombre d'une autre mesure sans que rien n'ait l'air cassé.
    renderCard();

    // Paliers → les stocks. 3 consolidées, 4 à renforcer, 5 en cours sur 40 au programme.
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/3 consolidées/);

    fireEvent.click(view("Révisions"));
    // Révisions → 8+9+11+12 = 40 passages, et 14 × 2 = 28 cartes dues.
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/40 passages/);
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/28 cartes dues/);

    fireEvent.click(view("Rétention"));
    // Rétention → 3 / (3 + 4 + 5) = 25 %. Le dénominateur est « travaillées », jamais le programme
    // entier : rapporté à 40, le taux vaudrait 8 % — rassurant et faux.
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/25 %/);
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/12 notions travaillées/);

    fireEvent.click(view("Solde"));
    // Solde → le FLUX, 6 entrées et 7 sorties : aucun rapport avec les stocks ci-dessus.
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/6 entrées et 7 sorties/);
  });

  it("🔴 un solde vide dit l'ABSENCE DE TRACE, jamais l'absence de mouvement", () => {
    // Le cas réel de la base de dev : `skill_mastery_history` n'a que des entrées en `weak`, donc
    // aucun franchissement du palier consolidé. Dessiner une ligne plate à zéro se lirait
    // « stable » alors que la mesure dit « je ne sais pas ».
    renderCard({ series: series({ gained: [0, 0], lost: [0, 0] }) });
    fireEvent.click(view("Solde"));

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/absence de trace, pas une absence de mouvement/)).toBeTruthy();
    expect(screen.getByText(/31\/07\/2026/)).toBeTruthy();
  });

  it("la rétention s'interrompt plutôt que de plonger à 0 % quand rien n'a été travaillé", () => {
    // « 0 % de rien » est un jugement, pas une mesure — et il se lirait comme un effondrement.
    renderCard({
      series: series({ consolidated: [0, 0], fragile: [0, 0], in_progress: [0, 0] }),
    });
    fireEvent.click(view("Rétention"));

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/rien à rapporter/)).toBeTruthy();
  });

  it("le dénominateur de la rétention est affiché à côté du taux", () => {
    // Avec 12 notions travaillées, une seule notion déplace le taux de 8 points. Un pourcentage nu
    // laisserait croire à une mesure stable.
    renderCard();
    fireEvent.click(view("Rétention"));
    expect(screen.getByText(/sur 12 travaillées/)).toBeTruthy();
  });
});
