// Le jour ouvert depuis la bande (addendum ADR-0025 §17).
//
// Le tap était muet sur un jour passé — et TOUS les jours passés sont dans ce cas, le serveur ne
// renvoyant jamais leurs échéances (§6). Des points de trace allumés sous un jour qui ne répond
// pas se lisent comme une panne. Ce panneau répond toujours.
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { type AgendaItemStudent } from "@zetis/types";
import { AgendaDayPanel } from "./AgendaDayPanel";

const HIER = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const DEMAIN = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

function item(over: Partial<AgendaItemStudent> = {}): AgendaItemStudent {
  return {
    id: 1,
    label: "Relire la leçon sur les fractions",
    subject: { id: 7, name: "Mathématiques", slug: "maths", color: null },
    due_on: HIER,
    kind: "devoir",
    done: false,
    created_by: "parent",
    edited_by_parent: false,
    lesson_id: null,
    chapter_id: null,
    revisable_cards: 0,
    ...over,
  };
}

function panneau(over: Partial<React.ComponentProps<typeof AgendaDayPanel>> = {}) {
  return render(
    <MemoryRouter>
      <AgendaDayPanel
        date={HIER}
        items={[]}
        traces={null}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onDismiss={vi.fn()}
        {...over}
      />
    </MemoryRouter>,
  );
}

describe("AgendaDayPanel", () => {
  it("montre le travail d'un jour passé — c'est ce qui le rend rattrapable", () => {
    panneau({ items: [item()] });
    expect(screen.getByText("Relire la leçon sur les fractions")).toBeInTheDocument();
  });

  it("VERROU §17 — un jour SANS échéance répond quand même", () => {
    // C'est le silence rencontré à l'écran le 2026-08-10 : trois points verts allumés, et rien
    // au tap. Un jour qui montre quelque chose et ne répond pas se lit comme une panne.
    panneau({ items: [], traces: 3 });
    expect(screen.getByText(/Rien à rendre ce jour-là/)).toBeInTheDocument();
  });

  it("dit ce qui a été fait, quand le jour porte des traces", () => {
    panneau({ items: [], traces: 3 });
    expect(screen.getByText(/tu as travaillé 3 fois/)).toBeInTheDocument();
  });

  it("VERROU §7 — `0` trace ne se rend pas : c'est un jour sans donnée, pas un vide constaté", () => {
    // Le contrat serveur ne distingue pas `0` de « pas de donnée ». Afficher « tu as travaillé
    // 0 fois » fabriquerait le constat d'absence que le §7 interdit.
    const { container: zero } = panneau({ items: [], traces: 0 });
    expect(zero.textContent).not.toMatch(/tu as travaillé/);

    const { container: futur } = panneau({ date: DEMAIN, items: [], traces: null });
    expect(futur.textContent).not.toMatch(/tu as travaillé/);
  });

  it("VERROU §7 — aucun vocabulaire de retard, aucun compteur d'arriéré", () => {
    const { container } = panneau({ items: [item(), item({ id: 2, label: "Fiche de lecture" })] });
    expect(container.textContent).not.toMatch(/en retard|retard|manqué|oublié/i);
    // Ni « 2 à rattraper », ni « 2/3 » : rien qui compte ce qui n'est pas fait.
    expect(container.textContent).not.toMatch(/\d+\s*(à rattraper|non faits?|\/\s*\d+)/i);
  });

  it("un jour à VENIR ne parle pas de rattrapage", () => {
    panneau({ date: DEMAIN, items: [] });
    expect(screen.getByText(/Rien de noté pour ce jour/)).toBeInTheDocument();
    expect(screen.queryByText(/Rien à rendre ce jour-là/)).toBeNull();
  });

  describe("🔴 le ✦ tient sa promesse (relecture humaine du 2026-08-10)", () => {
    // La bande allume un `✦` d'après les `plan_steps` du JOUR ; le panneau ne rendait que les
    // `fixed_items` du jour. Deux questions différentes — et la Décision 3 garantit qu'elles ne
    // coïncident JAMAIS (une étape tombe toujours avant l'échéance qu'elle prépare). Un jour
    // marqué s'ouvrait donc sur « Rien de noté pour ce jour ».
    const CONTROLE = item({
      id: 42,
      due_on: DEMAIN,
      label: "Multiplication de fractions",
      chapter_id: 8,
    });
    const PREPARATIONS = [
      {
        step: {
          id: 5,
          agenda_item_id: 42,
          kind: "revision" as const,
          day_offset: 1,
          skill_id: null,
          resource_id: null,
          done: false,
        },
        item: CONTROLE,
      },
    ];

    it("un jour qui ne porte QUE des étapes les montre, au lieu de dire « rien »", () => {
      panneau({ date: DEMAIN, items: [], preparations: PREPARATIONS });
      // ANCRE POSITIVE — sans elle, un bloc supprimé satisferait l'assertion négative.
      expect(screen.getByText(/Ce jour-là, tu prépares/)).toBeInTheDocument();
      expect(screen.getByText("Réviser ce chapitre")).toBeInTheDocument();
      // Le SUJET de l'étape : sans lui la ligne flotte (« réviser » — quoi ?).
      expect(screen.getByText(/Multiplication de fractions/)).toBeInTheDocument();
      // 🔴 Et surtout : la phrase de vide MEURT. C'est le défaut lui-même.
      expect(screen.queryByText(/Rien de noté pour ce jour/)).toBeNull();
    });

    it("🔴 VERROU — une étape ne se coche PAS ici : sa case vit sous l'échéance", () => {
      // Deux cases pour un même état, c'est le défaut que le reste de ce correctif retire.
      // Ces lignes MÈNENT à l'activité, elles ne la déclarent pas.
      const { container } = panneau({ date: DEMAIN, items: [], preparations: PREPARATIONS });
      expect(screen.getByText(/Ce jour-là, tu prépares/)).toBeInTheDocument();
      expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
      const bloc = screen.getByText(/Ce jour-là, tu prépares/).parentElement!;
      expect(bloc.querySelectorAll("button")).toHaveLength(0);
    });

    it("sans étape, le jour vide dit toujours qu'il est vide", () => {
      // La correction ne doit pas faire taire l'état vide légitime — c'est tout le §17.1.
      panneau({ date: DEMAIN, items: [], preparations: [] });
      expect(screen.getByText(/Rien de noté pour ce jour/)).toBeInTheDocument();
      expect(screen.queryByText(/Ce jour-là, tu prépares/)).toBeNull();
    });
  });
});
