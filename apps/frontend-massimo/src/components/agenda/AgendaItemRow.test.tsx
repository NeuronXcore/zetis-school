// La ligne d'agenda de Massimo — marqueurs de nature (§14.4) et lien vers le cours (§15).
//
// Deux règles tiennent cet écran : la leçon se repère sans que le fuchsia du contrôle se dilue,
// et une échéance qui NOMME un cours y donne accès — sans jamais offrir un lien vers nulle part.
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { type AgendaItemStudent, type AgendaKind } from "@zetis/types";
import { AgendaItemRow } from "./AgendaItemRow";

function item(over: Partial<AgendaItemStudent> = {}): AgendaItemStudent {
  return {
    id: 1,
    label: "Le passé composé",
    subject: { id: 7, name: "Français", slug: "francais", color: null },
    due_on: "2026-09-10",
    kind: "lecon",
    done: false,
    created_by: "parent",
    edited_by_parent: false,
    lesson_id: null,
    chapter_id: null,
    ...over,
  };
}

const ligne = (over: Partial<AgendaItemStudent> = {}) =>
  render(
    <MemoryRouter>
      <AgendaItemRow item={item(over)} onToggle={vi.fn()} onDismiss={vi.fn()} />
    </MemoryRouter>,
  );

const lien = () => screen.queryByRole("link", { name: /lire le cours/ });

describe("AgendaItemRow — les marqueurs de nature", () => {
  it("une leçon à apprendre porte sa marque", () => {
    ligne({ kind: "lecon" });
    expect(screen.getByText(/leçon/)).toBeInTheDocument();
  });

  it("VERROU — le fuchsia reste réservé au contrôle", () => {
    // Une leçon est du travail ORDINAIRE : elle se repère, elle n'alarme pas. Diluer le fuchsia
    // sur un second type lui ferait perdre son sens — c'est le seul signal de gravité de l'écran.
    const { container: avecLecon } = ligne({ kind: "lecon" });
    expect(avecLecon.innerHTML).not.toContain("fuchsia");

    const { container: avecControle } = ligne({ kind: "controle" });
    expect(avecControle.innerHTML).toContain("fuchsia");
  });

  it("le devoir et le rendu restent sans marque", () => {
    // État d'avant ce chantier, conservé : la ligne calme est le défaut.
    const { container: devoir } = ligne({ kind: "devoir" });
    expect(devoir.textContent).not.toMatch(/leçon|contrôle/);

    const { container: rendu } = ligne({ kind: "rendu" });
    expect(rendu.textContent).not.toMatch(/leçon|contrôle/);
  });
});

describe("AgendaItemRow — le lien vers le cours (§15)", () => {
  it("mène à LA leçon quand l'échéance en porte une", () => {
    ligne({ lesson_id: 42, chapter_id: 12 });
    expect(lien()).toHaveAttribute("href", "/subjects/francais/cours?lesson=42");
  });

  it("dégrade sur le chapitre, EN EMPORTANT le titre cherché (§15.6)", () => {
    // Sans `lesson_id`, le libellé reste souvent le titre exact d'un cours du chapitre : le lien
    // le dit, et la page tentera le rapprochement. Sans lui, l'échéance nommait un cours qu'elle
    // ne savait pas désigner.
    ligne({ lesson_id: null, chapter_id: 12, label: "La phrase complexe" });
    expect(lien()).toHaveAttribute(
      "href",
      "/subjects/francais/cours?chapter=12&title=La%20phrase%20complexe",
    );
  });

  it("dégrade sur la matière quand il n'y a ni leçon ni chapitre", () => {
    ligne();
    expect(lien()).toHaveAttribute("href", "/subjects/francais/cours");
  });

  it("VERROU — aucun lien sans matière, jamais un lien vers la racine", () => {
    // Même discipline que `pilotageLink` côté Papa : un lien qui déposerait Massimo au hasard
    // est pire que pas de lien.
    ligne({ subject: null, lesson_id: 42 });
    expect(lien()).toBeNull();
  });

  it("apparaît quel que soit le type — un devoir rattaché à un cours y mène aussi", () => {
    // Recopier ici une règle de `kind` en ferait une seconde source de vérité : celle de
    // `TRIGGERING_KINDS` a divergé le jour même où `devoir` y est entré.
    ligne({ kind: "devoir", lesson_id: 42 });
    expect(lien()).toHaveAttribute("href", "/subjects/francais/cours?lesson=42");
  });
});
