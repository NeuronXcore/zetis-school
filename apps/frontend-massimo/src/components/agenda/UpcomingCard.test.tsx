// « Ce qui arrive » — et la mort du bouton « Préparer · bientôt » (ADR-0050).
//
// Ce fichier n'existait pas : la carte a vécu deux chantiers sans test, et c'est à l'écran qu'on
// a vu qu'elle promettait encore « bientôt » une fonctionnalité livrée le jour même.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { type AgendaUpcomingItem } from "@zetis/types";
import { UpcomingCard } from "./UpcomingCard";

function item(over: Partial<AgendaUpcomingItem> = {}): AgendaUpcomingItem {
  return {
    id: 1,
    label: "Multiplication de fractions",
    subject: { id: 3, name: "Mathématiques", slug: "maths", color: null },
    due_on: "2026-08-14",
    days_left: 4,
    has_plan: false,
    ...over,
  };
}

const carte = (over: Partial<AgendaUpcomingItem> = {}, onOpenPlan = vi.fn()) => {
  const vue = render(<UpcomingCard item={item(over)} onOpenPlan={onOpenPlan} />);
  return { ...vue, onOpenPlan };
};

describe("UpcomingCard — le décompte", () => {
  it("affiche un chiffre neutre et une date, jamais une urgence", () => {
    const { container } = carte();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("jours")).toBeInTheDocument();
    // Aucun vocabulaire de retard, aucune couleur d'alarme : l'échéance est SUBIE, elle vient
    // du collège — ZETIS ne fabrique pas le compte à rebours, il le reporte (§1).
    expect(container.textContent).not.toMatch(/retard|urgent|vite|attention/i);
    expect(container.innerHTML).not.toContain("red-");
  });

  it("le singulier est respecté à J+1", () => {
    carte({ days_left: 1 });
    expect(screen.getByText("jour")).toBeInTheDocument();
  });
});

describe("UpcomingCard — « ✦ Ton plan » (ADR-0050)", () => {
  it("🔴 VERROU — plus AUCUN « bientôt » sur cette carte", () => {
    // Le bouton « Préparer · bientôt » a vécu deux chantiers. Il était justifié tant que le plan
    // n'existait pas ; le jour de sa livraison, il est devenu un mensonge affiché à Massimo.
    // ⚠️ Le saboter en remettant le bouton grisé doit ROUGIR — c'est LE verrou de l'étape 4bis
    // porté dans le code, et non dans un document que personne ne relit.
    for (const has_plan of [true, false]) {
      const { container, unmount } = carte({ has_plan });
      expect(container.textContent).not.toMatch(/bientôt|indisponible|manquant/i);
      unmount();
    }
  });

  it("🔴 VERROU — sans plan, AUCUN bouton (ni grisé, ni explicatif)", () => {
    // Une échéance sans chapitre, ou à J+1, n'aura JAMAIS de plan : promettre quoi que ce soit
    // serait mentir une seconde fois. « Un bouton mort se lit comme une panne » (§14.6).
    const { container } = carte({ has_plan: false });
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector("[disabled]")).toBeNull();
    expect(container.textContent).not.toContain("plan");
  });

  it("avec un plan, le bouton porte LES MOTS de l'encadré qu'il ouvre", () => {
    // « Ton plan » ici, « Ton plan » là-bas : Massimo reconnaît où il atterrit sans explication.
    carte({ has_plan: true });
    expect(screen.getByRole("button", { name: /Ton plan/ })).toBeInTheDocument();
  });

  it("le bouton REMONTE au parent — il ne navigue pas", () => {
    // Le plan vit sous l'échéance, sur cette même page, parfois dans une section REPLIÉE. Seule
    // la page sait la déplier ; une ancre posée ici ne trouverait rien et le bouton serait mort.
    const { onOpenPlan } = carte({ has_plan: true });
    fireEvent.click(screen.getByRole("button", { name: /Ton plan/ }));
    expect(onOpenPlan).toHaveBeenCalledTimes(1);
  });

  it("VERROU — sans rappel fourni, aucun bouton non plus", () => {
    // Garde-fou porté par le RENDU et pas seulement par l'appelant : une surface qui oublierait
    // `onOpenPlan` afficherait sinon un bouton qui n'ouvre rien.
    render(<UpcomingCard item={item({ has_plan: true })} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
