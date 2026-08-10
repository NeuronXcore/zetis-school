// Charge de la semaine + la puce « commander » (addendum ADR-0025 §14.5).
//
// L'action existait depuis le 2026-08-03 mais exigeait d'ouvrir le panneau de détail. Ce fichier
// verrouille la seule règle qui la rend sûre au niveau de l'item : **jamais de bouton mort**.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { type AgendaItemPilot } from "@zetis/types";
import { AgendaWeekBoard } from "./AgendaWeekBoard";
import { type AgendaColumn } from "../../lib/agendaModel";

function item(over: Partial<AgendaItemPilot> = {}): AgendaItemPilot {
  return {
    id: 1,
    label: "Les fractions",
    subject: { id: 7, name: "Mathématiques", slug: "maths", color: null },
    subject_id: 7,
    chapter_id: 3,
    lesson_id: null,
    due_on: "2026-09-10",
    kind: "lecon",
    created_by: "parent",
    parent_note: null,
    done_at: null,
    dismissed_at: null,
    edited_by_parent_at: null,
    created_at: null,
    updated_at: null,
    // ADR-0050 : servis par le pilotage depuis le 2026-08-10. Les omettre laissait passer un
    // `undefined` que `tsc -b` attrape ici — les tests de Papa SONT dans le projet typé, à la
    // différence de ceux de Massimo.
    plan_steps_total: 0,
    plan_steps_done: 0,
    ...over,
  };
}

function column(items: AgendaItemPilot[]): AgendaColumn[] {
  return [
    { date: "2026-09-10", weekdayLabel: "jeu", dayNumber: 10, isToday: false, items },
  ] as AgendaColumn[];
}

function renderBoard(
  items: AgendaItemPilot[],
  commandFor?: (i: AgendaItemPilot) => (() => void) | null,
) {
  return render(
    <AgendaWeekBoard
      columns={column(items)}
      selectedId={null}
      onSelect={vi.fn()}
      commandFor={commandFor}
    />,
  );
}

const puce = () => screen.queryByRole("button", { name: /Commander les missions du chapitre/ });

describe("AgendaWeekBoard — la puce « commander »", () => {
  it("apparaît sur une échéance commandable, et lance le Commander", () => {
    const run = vi.fn();
    renderBoard([item()], () => run);

    const bouton = puce();
    expect(bouton).not.toBeNull();
    fireEvent.click(bouton!);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("VERROU — n'apparaît JAMAIS quand la page ne rend pas de geste", () => {
    // `commandFor` rend `null` : c'est la page qui sait si l'échéance est commandable (chapitre
    // ET matière rattachée à l'année active). Rendre la puce puis ne rien faire au clic se
    // lirait comme une panne.
    renderBoard([item({ chapter_id: null })], () => null);
    expect(puce()).toBeNull();
  });

  it("n'apparaît pas sur une échéance archivée", () => {
    // Le travail se prescrit pour ce qui vient, pas pour ce qui a été rangé.
    const run = vi.fn();
    renderBoard([item({ dismissed_at: "2026-09-01T10:00:00Z" })], () => run);
    expect(puce()).toBeNull();
  });

  it("est absente quand le tableau est monté sans le hook des missions", () => {
    renderBoard([item()]);
    expect(puce()).toBeNull();
  });

  it("étiquette la leçon à apprendre sans lui donner le fuchsia du contrôle", () => {
    const { container } = renderBoard([item({ kind: "lecon" })]);
    expect(screen.getByText("leçon")).toBeInTheDocument();
    expect(container.innerHTML).not.toContain("fuchsia");
  });
});

describe("AgendaWeekBoard — l'état d'un item", () => {
  it("VERROU §14.7 — un item coché se lit « coché », JAMAIS « fait »", () => {
    // Le seul fait connu est que Massimo a touché une case. Écrire « fait » affirmerait une
    // complétion que rien ne permet d'établir — l'ADR-0025 §3 est explicite (« cocher ne prouve
    // rien, ne pas cocher ne prouve rien »), et le reste de la page l'écrivait déjà correctement.
    const { container } = renderBoard([item({ done_at: "2026-09-10T18:00:00Z" })]);

    expect(screen.getByText("✓ coché")).toBeInTheDocument();
    // ⚠️ « à faire » ne contient PAS « fait » — l'assertion ne se déclenche que sur une vraie
    // affirmation de complétion.
    expect(container.textContent).not.toMatch(/\bfait\b/);
  });

  it("un item non coché reste « à faire » — un état neutre, pas un manquement", () => {
    renderBoard([item()]);
    expect(screen.getByText("à faire")).toBeInTheDocument();
    expect(screen.queryByText(/coché/)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// L'ÉTIQUETTE DU PLAN DE PRÉPARATION (ADR-0050 Décision 7) — et surtout, son ABSENCE
// ─────────────────────────────────────────────────────────────────────────────────────

const etiquettePlan = () => screen.queryByText(/^✦ \d+\/\d+$/);

describe("AgendaWeekBoard — le plan de préparation, en lecture", () => {
  it("🔴 VERROU — sans plan, AUCUNE étiquette n'est rendue", () => {
    // La plupart des échéances n'ont pas de plan (il faut un chapitre et au moins 2 jours). Un
    // « ✦ 0/0 » sur chacune ferait de la grille un tableau de manques — et il désignerait un
    // manque dont Papa n'est pas l'auteur.
    const { container } = renderBoard([item({ plan_steps_total: 0, plan_steps_done: 0 })]);
    expect(etiquettePlan()).toBeNull();
    expect(container.textContent).not.toContain("✦");
  });

  it("affiche le compte quand le plan existe", () => {
    renderBoard([item({ plan_steps_total: 3, plan_steps_done: 1 })]);
    expect(etiquettePlan()).toHaveTextContent("✦ 1/3");
  });

  it("🔴 VERROU — jamais « fait » : Papa lit une DÉCLARATION de Massimo (§14.7)", () => {
    // Le seul fait connu est qu'il a touché une case. Le reste de cette page l'écrit déjà
    // correctement (« ✓ coché »), et l'étiquette du plan ne doit pas rouvrir la brèche.
    const { container } = renderBoard([item({ plan_steps_total: 3, plan_steps_done: 3 })]);
    expect(container.textContent).not.toMatch(/faite?s?\b/i);
    expect(container.textContent).not.toMatch(/terminé|complété|réussi/i);
  });

  it("VERROU — l'étiquette n'est pas un bouton : Papa ne pilote pas le plan", () => {
    // Décision 7 : aucun geste, aucune édition, aucune génération manuelle. Le plan est un
    // service rendu à Massimo. Une étiquette cliquable serait la première marche vers un
    // « régénérer » — c'est-à-dire vers une prescription d'adulte.
    // ⚠️ L'assertion ne peut PAS être « aucun bouton ne s'appelle ✦ » : la cellule entière est
    // déjà un bouton de SÉLECTION, et il porte le texte de toutes ses étiquettes. Ce qu'on
    // verrouille, c'est qu'aucun contrôle DÉDIÉ au plan n'existe.
    renderBoard([item({ plan_steps_total: 3, plan_steps_done: 1 })]);
    expect(etiquettePlan()!.tagName).toBe("SPAN");
    for (const interdit of [/plan/i, /générer/i, /régénérer/i, /étape/i]) {
      expect(screen.queryByRole("button", { name: interdit })).toBeNull();
      expect(screen.queryByRole("link", { name: interdit })).toBeNull();
    }
  });
});
